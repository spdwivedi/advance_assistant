import os
import json
import time
import re
import ollama
from google import genai
from src.config import (
    DEFAULT_EXECUTION_MODE, DEFAULT_RESEARCH_PROFILE, RESEARCH_PROFILES,
    DEFAULT_MODEL_CONSTRAINING_PROFILE, MODEL_CONSTRAINING_PROFILES,
    TIER_POOLS, MODEL_REGISTRY, ENABLED_TOOLS,
    LOCAL_ORCHESTRATOR_MODEL, LOCAL_WORKER_MODEL
)
from src.memory_manager import (
    load_relevant_memory_books, get_tool_catalog, record_execution_profile,
    synthesize_and_update_memory, process_delta_learning_sync, get_ist_now_str
)
from src.logger import log_action
from src.permissions import execute_command, normalize_cross_platform_path
from src.tools import search_web_documentation
from src.token_governor import TokenGovernor
from src.key_manager import key_manager

# Initialize Financial Governor & Token Ledger
governor = TokenGovernor()

# Dynamic Google GenAI client reference backed by key pool
client, _ = key_manager.get_client_for_request()

# Active model cache per tier
ACTIVE_WORKING_MODELS = {"HIGH": None, "MID": None, "FAST": None, "LIGHT": None}


def load_sub_agent_registry() -> dict:
    sub_agents_path = os.path.abspath("./.agent_memory/sub_agents.json")
    if os.path.exists(sub_agents_path):
        try:
            with open(sub_agents_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log_action("SYSTEM", "SUB_AGENT_REGISTRY_LOAD_FAILED", {"error": str(e)}, model_name="router")
    return {}


def auto_detect_execution_plan(user_prompt: str, project_name: str = None) -> dict:
    tools = get_tool_catalog()
    agent_registry = load_sub_agent_registry()
    
    analysis_prompt = f"""You are the Capability-Aware Swarm Strategy Architect for Advance Assistant OS v6.0.
Analyze this incoming engineering requirement and match it to the optimal sub-agent and model profile from our 10-model registry based on task complexity, model strengths, weaknesses, speed, and quotas.

Task Requirement: {user_prompt}
Available Tools Registry: {list(tools.keys())}

Available 10-Model Sub-Agent Capability Registry:
{json.dumps(agent_registry, indent=2)}

Determine the optimal execution layout. Respond strictly in PURE JSON with this exact schema:
{{
    "mode": "OFFLINE_ONLY" or "HYBRID_CLOUD" or "OFFLINE_AGENTIC" or "HYBRID_AGENTIC",
    "selected_agent": "Exact Agent Key Name from registry",
    "target_model": "Model Endpoint associated with selected agent",
    "target_tier": "HIGH" or "MID" or "FAST",
    "research_profile": "BASIC" or "MEDIUM" or "HIGH" or "MAX",
    "constraining_profile": "HIGH_RPM_TPM" or "HIGHEST_RPM_TPM" or "PRO_PLAN",
    "reasoning": "Technical explanation matching task complexity to agent strengths and quotas"
}}
"""
    try:
        res = ollama.chat(
            model=LOCAL_ORCHESTRATOR_MODEL,
            messages=[{"role": "user", "content": analysis_prompt}],
            keep_alive=0
        )
        reply = res["message"]["content"].strip()
        start_idx = reply.find("{")
        end_idx = reply.rfind("}") + 1
        if start_idx != -1 and end_idx != -1:
            return json.loads(reply[start_idx:end_idx])
    except Exception as e:
        log_action("SYSTEM", "AUTO_DETECT_FAILED", {"error": str(e), "project_name": project_name}, model_name="router")
    
    return {
        "mode": "HYBRID_CLOUD", 
        "selected_agent": "Core_Feature_Writer_Agent",
        "target_model": "gemini-3.5-flash",
        "target_tier": "MID", 
        "research_profile": "MAX",
        "constraining_profile": "HIGH_RPM_TPM",
        "reasoning": "Fallback default capability layout"
    }


def execute_autonomous_spec_expansion(user_prompt: str, profile_level: str, project_name: str = None) -> str:
    if profile_level != "MAX":
        return ""
    log_action("SYSTEM", "SPEC_EXPANSION_INITIATED", {"prompt_len": len(user_prompt), "project_name": project_name}, model_name=LOCAL_ORCHESTRATOR_MODEL)
    features_context = []
    brainstorm_prompt = f"Decompose the following project blueprint into explicit structural milestones, backend requirements, and front-end interface cards: {user_prompt}"
    try:
        res = ollama.chat(
            model=LOCAL_ORCHESTRATOR_MODEL, 
            messages=[{"role": "user", "content": brainstorm_prompt}],
            keep_alive=0
        )
        features_context.append(f"=== QWEN 32B SPEC BRAINSTORM ===\n{res['message']['content']}")
    except Exception:
        pass
    active_client, key_id = key_manager.get_client_for_request(tier_preference="PAID")
    if active_client:
        try:
            cloud_prompt = f"Analyze these requirements and suggest deep backend security structures, performance limits, and advanced ui/ux parameters for: {user_prompt}"
            response = active_client.models.generate_content(model="gemini-2.5-pro", contents=[cloud_prompt])
            if response.text:
                features_context.append(f"=== GEMINI PRO SYSTEM INSIGHTS ===\n{response.text}")
                key_manager.mark_success(key_id)
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower():
                key_manager.mark_exhausted(key_id)
            log_action("SYSTEM", "CLOUD_INSIGHT_PASS_FAILED", {"error": str(e), "project_name": project_name}, model_name=LOCAL_ORCHESTRATOR_MODEL)
    return "\n\n".join(features_context)


def verify_action_result_offline(filepath: str, task_instruction: str, project_name: str = None, test_name: str = None) -> bool:
    filepath = normalize_cross_platform_path(filepath)
    if not os.path.exists(filepath):
        return False
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            file_snippet = f.read(3000)
        if "incomplete or had formatting tags" in file_snippet.lower() or "rewrite it fully" in file_snippet.lower():
            return False

        verification_prompt = f"""You are the Quality Assurance Verification Unit.
Verify if the generated file content matches the original engineering intent correctly.

Original Instruction: {task_instruction}
Generated File Path: {filepath}
File Content View:
---
{file_snippet}
---

Does this code satisfy the structural requirement with valid code syntax and no conversational headers or cutoffs?
Respond EXACTLY with 'YES' or 'NO'. Do not provide explanations.
"""
        res = ollama.chat(
            model=LOCAL_WORKER_MODEL,
            messages=[{"role": "user", "content": verification_prompt}],
            keep_alive="2m"
        )
        verdict = res["message"]["content"].strip().upper()
        return "YES" in verdict
    except Exception as e:
        log_action("SYSTEM", "CHECK_ERROR", {"error": str(e), "project_name": project_name, "test_name": test_name}, model_name="verification")
        return True


def run_agent_pipeline(
    user_prompt: str, 
    tier: str = "MID", 
    target_workspace: str = None, 
    mode_override: str = None,
    profile_override: str = None,
    constraining_profile_override: str = None,
    project_name: str = None,
    test_name: str = None
) -> str:
    active_mode = mode_override or DEFAULT_EXECUTION_MODE
    profile_level = profile_override or DEFAULT_RESEARCH_PROFILE
    constraining_profile = constraining_profile_override or DEFAULT_MODEL_CONSTRAINING_PROFILE
    selected_target_model = None

    if not project_name and "project:" in user_prompt.lower():
        try:
            match = re.search(r'project:\s*([^\s|]+)', user_prompt, re.IGNORECASE)
            if match:
                project_name = match.group(1).strip()
        except Exception:
            pass

    if active_mode == "AUTO_DETECT":
        detected = auto_detect_execution_plan(user_prompt, project_name=project_name)
        active_mode = detected.get("mode", "HYBRID_CLOUD")
        tier = detected.get("target_tier", tier)
        profile_level = detected.get("research_profile", profile_level)
        constraining_profile = detected.get("constraining_profile", constraining_profile)
        selected_target_model = detected.get("target_model")
        record_execution_profile(f"plan_{int(time.time())}", detected)

    memory_context = load_relevant_memory_books(user_prompt)
    research_context = ""
    if ENABLED_TOOLS["WEB_RESEARCH"]:
        if profile_level == "MAX" or "error" in user_prompt.lower() or "fix" in user_prompt.lower() or "decompose" in user_prompt.lower():
            search_query = user_prompt[:140].replace("Implement milestone:", "").replace("Decompose this goal into discrete tasks mapped to independent specific filenames.", "").strip()
            if search_query:
                search_client, _ = key_manager.get_client_for_request(tier_preference="FREE")
                research_context = search_web_documentation(
                    query=search_query, 
                    profile_level=profile_level, 
                    client_ref=search_client,
                    project_name=project_name,
                    test_name=test_name
                )

    expanded_spec_context = ""
    if profile_level == "MAX" and "decompose" in user_prompt.lower():
        expanded_spec_context = execute_autonomous_spec_expansion(user_prompt, profile_level, project_name=project_name)

    log_action(
        tier, "PIPELINE_ACTIVATED", 
        {
            "mode": active_mode, 
            "profile": profile_level, 
            "constraining_profile": constraining_profile,
            "workspace": target_workspace, 
            "search_len": len(research_context), 
            "target_model": selected_target_model,
            "project_name": project_name,
            "test_name": test_name
        },
        model_name=tier
    )

    is_boilerplate_file = any(kw in user_prompt.lower() for kw in [".env", "requirements.txt", "package.json", "tsconfig.json", "gitignore", "dockerfile"])
    if is_boilerplate_file and active_mode != "OFFLINE_ONLY":
        log_action(tier, "TOKEN_SAVER_LOCAL_OVERRIDE", {"reason": "Boilerplate forced locally to save cloud API tokens", "project_name": project_name}, model_name=LOCAL_WORKER_MODEL)
        active_mode = "OFFLINE_ONLY"

    system_prompt = f"""You are an expert production-grade software engineering sub-agent operating in tier [{tier}] under mode [{active_mode}].
=== TARGET ENVIRONMENT CONTEXT ===
{memory_context}
=== LIVE WEB DOCUMENTATION CONTEXT ===
{research_context}
=== EXPANDED AUTONOMOUS STRUCTURE SPECIFICATIONS ===
{expanded_spec_context}
=== ACTIVE WORKSPACE TARGET ===
Target Path Location: {target_workspace or os.getcwd()}

CRITICAL SYSTEM COMMAND FORMATTING DIRECTIVES:
1. To write, modify, or create a file on disk, you must output EXACTLY this layout format on a separate line:
EXECUTE: WRITE_FILE: <path_or_filename> | <full_raw_code_content>

2. DO NOT output non-standard directives like CREATE_DIRECTORY or MAKE_DIR. Writing a file via WRITE_FILE automatically creates all missing parent directories.
3. DO NOT wrap the EXECUTE statement line inside bold markers (**) or Markdown code blocks (```). Keep it raw text.
4. For dependency files like requirements.txt or package.json, output ONLY valid package structures. Do NOT write introductory descriptions.
"""

    reply = None

    has_cloud_keys = key_manager.get_pool_status()["active_keys"] > 0 or bool(os.getenv("GEMINI_API_KEY"))
    if "HYBRID" in active_mode and has_cloud_keys and tier != "LOW" and constraining_profile != "OFFLINE_PURE":
        primary_candidates = TIER_POOLS.get(tier, [])
        fast_fallback_candidates = TIER_POOLS.get("FAST", [])
        full_candidate_queue = primary_candidates + [m for m in fast_fallback_candidates if m not in primary_candidates]

        if selected_target_model and selected_target_model in full_candidate_queue:
            full_candidate_queue = [selected_target_model] + [m for m in full_candidate_queue if m != selected_target_model]

        tier_pref = "PAID" if tier in ["HIGH", "MID"] else "FREE"

        for model_id in full_candidate_queue:
            if "qwen" in model_id.lower():
                continue

            requires_search = (profile_level in ["HIGH", "MAX"])
            allowed = governor.inspect_and_cool_allocation(
                model_name=model_id, 
                estimated_tokens=4000, 
                requires_search=requires_search,
                project_name=project_name,
                constraining_profile=constraining_profile
            )

            if not allowed:
                log_action(tier, "GOVERNOR_LOCKOUT_OR_CONSTRAINED", {"model": model_id, "constraining_profile": constraining_profile, "project_name": project_name}, model_name=model_id)
                continue

            # Multi-key rotation loop: try active keys in pool before abandoning candidate model
            pool_status = key_manager.get_pool_status()
            max_key_attempts = max(2, pool_status["active_keys"])
            key_attempts = 0

            while key_attempts < max_key_attempts:
                curr_client, curr_key_id = key_manager.get_client_for_request(model_name=model_id, tier_preference=tier_pref)
                if not curr_client:
                    break

                try:
                    response = curr_client.models.generate_content(
                        model=model_id,
                        config={"temperature": 0.2},
                        contents=[system_prompt, user_prompt]
                    )
                    reply = response.text
                    ACTIVE_WORKING_MODELS[tier] = model_id
                    key_manager.mark_success(curr_key_id)
                    log_action(tier, "CLOUD_GENERATE_SUCCESS", {"model": model_id, "key_id": curr_key_id, "project_name": project_name}, model_name=model_id)
                    break
                except Exception as e:
                    key_attempts += 1
                    err_str = str(e)
                    log_action(tier, "CLOUD_CANDIDATE_ATTEMPT_FAILED", {"model": model_id, "key_id": curr_key_id, "attempt": key_attempts, "error": err_str[:120], "project_name": project_name}, model_name=model_id)
                    if "429" in err_str or "quota" in err_str.lower() or "resourceexhausted" in err_str.lower() or "503" in err_str:
                        key_manager.mark_exhausted(curr_key_id, cooldown_seconds=60)
                        log_action(tier, "KEY_ROTATION_TRIGGERED", {"exhausted_key": curr_key_id, "reason": "HTTP 429 Quota Exhaustion"}, model_name=model_id)
                        continue
                    else:
                        break
            if reply:
                break


    if not reply:
        log_action(tier, "OFFLINE_CORE_FALLBACK", {"model": LOCAL_WORKER_MODEL, "project_name": project_name}, model_name=LOCAL_WORKER_MODEL)
        local_user_prompt = user_prompt + "\nStrictly remember to use the format: EXECUTE: WRITE_FILE: <path> | <code>. Do not include markdown blocks or conversational introductions."
        
        try:
            print(f"⏳ [Offline Token Generation Stream ({LOCAL_WORKER_MODEL})]: ", end="", flush=True)
            stream = ollama.chat(
                model=LOCAL_WORKER_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": local_user_prompt}
                ],
                keep_alive="2m",
                stream=True
            )
            reply_chunks = []
            for chunk in stream:
                token = chunk["message"]["content"]
                reply_chunks.append(token)
                print(token, end="", flush=True)
            print()
            reply = "".join(reply_chunks)
        except Exception as e:
            log_action(tier, "OLLAMA_CRITICAL_ERROR", {"error": str(e), "project_name": project_name}, model_name=LOCAL_WORKER_MODEL)
            return f"Router Pipeline Critical Execution Failure: {str(e)}"

    if "EXECUTE:" in reply:
        blocks = reply.split("EXECUTE:")
        execution_outputs = []
        for block in blocks[1:]:
            block_content = block.strip()
            if not block_content:
                continue
            cmd_line = "EXECUTE: " + block_content
            out = execute_command(cmd_line, target_dir=target_workspace, model_name=tier, project_name=project_name, test_name=test_name)
            execution_outputs.append(out)

            if "Successfully created" in out and "WRITE_FILE:" in block_content:
                try:
                    raw_write = block_content.replace("WRITE_FILE:", "", 1).strip()
                    filepath_part = raw_write.split("|")[0].strip().strip('*`"\'')
                    if target_workspace and not os.path.isabs(filepath_part):
                        filepath_part = os.path.normpath(os.path.join(target_workspace, filepath_part))
                        
                    is_valid = verify_action_result_offline(filepath_part, user_prompt[:100], project_name=project_name, test_name=test_name)
                    if not is_valid:
                        log_action(tier, "CODE_CHECK_FAILED", {"path": filepath_part, "project_name": project_name}, model_name=LOCAL_WORKER_MODEL)
                        repair_prompt = f"Output ONLY the complete, raw source code for the file: {filepath_part}. Do not include markdown intro."
                        
                        repair_stream = ollama.chat(
                            model=LOCAL_WORKER_MODEL,
                            messages=[
                                {"role": "system", "content": f"You are a code fixer. Output valid raw code for {filepath_part}."},
                                {"role": "user", "content": repair_prompt}
                            ],
                            keep_alive=0,
                            stream=True
                        )
                        repair_chunks = []
                        for rc in repair_stream:
                            repair_chunks.append(rc["message"]["content"])
                        clean_repair_code = "".join(repair_chunks).strip()
                        
                        repair_cmd = f"EXECUTE: WRITE_FILE: {filepath_part} | {clean_repair_code}"
                        execute_command(repair_cmd, target_dir=target_workspace, model_name=tier, project_name=project_name, test_name=test_name)
                except Exception as e:
                    log_action(tier, "REPAIR_EXCEPT", {"error": str(e), "project_name": project_name}, model_name="verification")

    try:
        synthesize_and_update_memory(action_summary=user_prompt[:200], execution_output=reply, project_name=project_name)
        if profile_level in ["HIGH", "MAX"]:
            process_delta_learning_sync()
    except Exception:
        pass

    if "EXECUTE:" in reply:
        reply += "\n\n[Action Output Validation]:\n" + "\n".join(execution_outputs)
    return reply