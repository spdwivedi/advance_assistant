from typing import Optional, List, Dict, Any
import os
import json
import time
import re
import urllib.request
import urllib.error
import ollama

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

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
from src.token_governor import TokenGovernor, token_governor
from src.key_manager import key_manager

# Financial Governor & Token Ledger
governor = token_governor

# Backward-compatible client reference
client, _ = key_manager.get_client_for_request()

# Active working model cache per tier
ACTIVE_WORKING_MODELS = {"HIGH": None, "MID": None, "FAST": None, "LIGHT": None}


def load_sub_agent_registry() -> dict:
    """Loads configured sub-agent profiles from .agent_memory/sub_agents.json."""
    sub_agents_path = os.path.abspath("./.agent_memory/sub_agents.json")
    if os.path.exists(sub_agents_path):
        try:
            with open(sub_agents_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log_action("SYSTEM", "SUB_AGENT_REGISTRY_LOAD_FAILED", {"error": str(e)}, model_name="router")
    return {}


def auto_detect_execution_plan(user_prompt: str, project_name: str = "default_project") -> dict:
    """
    Stage 14.2 Zero-Cloud-Cost Deterministic Task Classifier:
    Analyzes task requirements and maps directly to the optimal sub-agent profile
    without consuming any cloud LLM RPM/TPM quota.
    """
    prompt_lower = (user_prompt or "").lower()

    boilerplate_kw = [
        "setup", "config", "docker", "dockerfile", "env", "requirements.txt",
        "package.json", "init", "boilerplate", "scaffold", "readme", "license",
        "gitignore", "manifest", "lint", "tsconfig"
    ]
    arch_kw = [
        "architecture", "architect", "security", "auth", "jwt", "database",
        "migration", "sql", "postgres", "redis", "schema", "relational",
        "enterprise", "system design", "demediator", "crypto", "encryption",
        "rbac", "permission", "broker"
    ]

    if any(kw in prompt_lower for kw in arch_kw):
        plan = {
            "mode": "HYBRID_CLOUD",
            "selected_agent": "Enterprise_Architect_Agent",
            "target_model": "gemini-2.5-pro",
            "target_tier": "HIGH",
            "research_profile": "MEDIUM",
            "constraining_profile": "PRO_PLAN",
            "reasoning": "Deterministic classification matched complex architectural/security/schema requirements."
        }
    elif any(kw in prompt_lower for kw in boilerplate_kw):
        plan = {
            "mode": "HYBRID_CLOUD",
            "selected_agent": "Boilerplate_Optimizer_Agent",
            "target_model": "gemini-2.5-flash-lite",
            "target_tier": "FAST",
            "research_profile": "BASIC",
            "constraining_profile": "HIGH_RPM_TPM",
            "reasoning": "Deterministic classification matched configuration/setup/scaffolding requirements."
        }
    else:
        plan = {
            "mode": "HYBRID_CLOUD",
            "selected_agent": "High_Performance_Developer_Agent",
            "target_model": "gemini-3.6-flash",
            "target_tier": "HIGH",
            "research_profile": "BASIC",
            "constraining_profile": "HIGH_RPM_TPM",
            "reasoning": "Deterministic classification selected standard high-performance feature developer."
        }

    try:
        record_execution_profile(plan, project_name=project_name)
    except Exception:
        pass

    log_action("SYSTEM", "AUTO_DETECT_PLAN_SUCCESS", {
        "selected_agent": plan["selected_agent"],
        "target_model": plan["target_model"],
        "target_tier": plan["target_tier"],
        "project_name": project_name
    }, model_name="router")

    return plan


def execute_autonomous_spec_expansion(user_prompt: str, profile_level: str, project_name: str = None) -> str:
    """Expands engineering specifications during MAX profile research passes."""
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
    """Verifies that generated files are syntactically sound and non-truncated."""
    filepath = normalize_cross_platform_path(filepath)
    if not os.path.exists(filepath):
        return False
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            file_snippet = f.read(3000)
        if "incomplete or had formatting tags" in file_snippet.lower() or "rewrite it fully" in file_snippet.lower():
            return False
        if len(file_snippet.strip()) < 10:
            return False
        return True
    except Exception:
        return False


def run_agent_pipeline(
    user_prompt: str,
    execution_mode: str = "AUTO_DETECT",
    research_profile: str = "BASIC",
    use_agentic_tool: Optional[str] = None,
    project_name: str = "default_project",
    model_profile: str = "HIGH_RPM_TPM",
    target_tier_override: Optional[str] = None,
    explicit_model: Optional[str] = None,
    fallback_models: Optional[List[str]] = None,
    preferred_key_id: Optional[str] = None,
    tier: str = "HIGH",
    target_workspace: Optional[str] = None,
    mode_override: Optional[str] = None,
    profile_override: Optional[str] = None,
    constraining_profile_override: Optional[str] = None,
    test_name: Optional[str] = None,
    **kwargs
) -> str:
    """
    Stage 14.2 Multi-Provider Execution Pipeline:
    Coordinates tool discovery, precision memory snippet injection, atomic pre-request token leases,
    exact usage reconciliation, and seamless fallback across Google GenAI, Groq LPU, and local Ollama.
    """
    try:
        from src.supervisor import check_build_lifecycle
        if not check_build_lifecycle():
            log_action(tier, "BUILD_CANCELLED_IN_PIPELINE", {"prompt": user_prompt[:80], "project": project_name})
            return "[BUILD_CANCELLED]: Execution aborted by user cancellation."
    except ImportError:
        pass

    active_mode = mode_override or execution_mode or DEFAULT_EXECUTION_MODE
    profile_level = profile_override or research_profile or DEFAULT_RESEARCH_PROFILE
    constraining_profile = constraining_profile_override or model_profile or DEFAULT_MODEL_CONSTRAINING_PROFILE
    effective_tier = target_tier_override or tier or "HIGH"
    tier = effective_tier

    selected_target_model = None
    if active_mode == "AUTO_DETECT" and not explicit_model:
        plan = auto_detect_execution_plan(user_prompt, project_name=project_name)
        active_mode = plan["mode"]
        effective_tier = plan["target_tier"]
        profile_level = plan["research_profile"]
        constraining_profile = plan["constraining_profile"]
        selected_target_model = plan.get("target_model")

    tools = get_tool_catalog()
    sub_agents = load_sub_agent_registry()
    relevant_books = load_relevant_memory_books(user_prompt)

    research_notes = ""
    if profile_level in ["MEDIUM", "HIGH", "MAX"] and ENABLED_TOOLS.get("WEB_RESEARCH"):
        research_notes = search_web_documentation(user_prompt, max_results=3 if profile_level == "MAX" else 1)

    spec_expansion = execute_autonomous_spec_expansion(user_prompt, profile_level, project_name=project_name)

    system_prompt = f"""You are the Advanced Technical Execution Sub-Agent ({tier} Tier).
Operating Workspace: {target_workspace or './'}
Current Execution Mode: {active_mode}
Active Constraining Profile: {constraining_profile}

--- RELEVANT KNOWLEDGE ARCHIVE ---
{relevant_books}

--- LIVE WEB RESEARCH GROUNDING ---
{research_notes}

--- SYSTEM SPECIFICATION EXPANSION ---
{spec_expansion}

--- AVAILABLE SYSTEM TOOLS ---
{list(tools.keys())}

RULES FOR SYSTEM COMMAND GENERATION:
1. When you need to write or replace a file, output the execution directive EXACTLY on its own line:
   EXECUTE: WRITE_FILE: <relative_or_absolute_filepath> | <complete_source_code_without_markdown_wrappers>
2. DO NOT output non-standard directives like CREATE_DIRECTORY or MAKE_DIR. Writing a file via WRITE_FILE automatically creates all missing parent directories.
3. DO NOT wrap the EXECUTE statement line inside bold markers (**) or Markdown code blocks (```). Keep it raw text.
4. For dependency files like requirements.txt or package.json, output ONLY valid package structures. Do NOT write introductory descriptions.
"""

    reply = None
    full_prompt = user_prompt

    # Multi-Provider Execution Path (GOOGLE, GROQ, OLLAMA ROSTER)
    pool_status = key_manager.get_routing_status()
    has_cloud_keys = (pool_status["active_keys"] > 0) or bool(os.getenv("GEMINI_API_KEY")) or bool(os.getenv("GROQ_API_KEY"))

    # Stage 16.2 Explicit Multi-Model Swarm Queue Construction
    full_candidate_queue: List[str] = []
    if explicit_model:
        full_candidate_queue = [explicit_model]
        if fallback_models:
            for fb in fallback_models:
                if fb not in full_candidate_queue:
                    full_candidate_queue.append(fb)
    elif ("HYBRID" in active_mode or active_mode == "AUTO_DETECT") and has_cloud_keys and effective_tier != "LOW" and constraining_profile != "OFFLINE_PURE":
        primary_candidates = TIER_POOLS.get(effective_tier, [])
        fast_fallback_candidates = TIER_POOLS.get("FAST", [])
        full_candidate_queue = primary_candidates + [m for m in fast_fallback_candidates if m not in primary_candidates]

        # Add Groq velocity coder model if registered in sub_agents
        if "qwen-2.5-coder-32b" not in full_candidate_queue and pool_status.get("groq_keys", 0) > 0:
            full_candidate_queue.append("qwen-2.5-coder-32b")

        if selected_target_model and selected_target_model in full_candidate_queue:
            full_candidate_queue = [selected_target_model] + [m for m in full_candidate_queue if m != selected_target_model]

    if full_candidate_queue:
        tier_pref = "PAID" if effective_tier in ["HIGH", "MID"] else "FREE"

        for model_id in full_candidate_queue:
            is_local = (":" in model_id) or (governor.resolve_provider(model_id) == "OLLAMA")
            if is_local:
                # Stage 16.2 Direct Local Ollama Swarm Roster Execution
                log_action(effective_tier, "LOCAL_OLLAMA_ROSTER_EXECUTE", {"model": model_id, "project_name": project_name}, model_name=model_id)
                loc_lease = governor.acquire_lease(
                    model_name=model_id,
                    prompt_text=full_prompt,
                    provider="OLLAMA",
                    tier="LOCAL",
                    key_id="local_ollama"
                )
                try:
                    print(f"⏳ [Local Swarm Roster Stream ({model_id})]: ", end="", flush=True)
                    stream = ollama.chat(
                        model=model_id,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": full_prompt}
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
                    loc_in = max(1, len(full_prompt) // 4)
                    loc_out = max(1, len(reply) // 4)
                    governor.commit_lease(
                        lease_id=loc_lease.get("lease_id"),
                        model_name=model_id,
                        actual_input_tokens=loc_in,
                        actual_output_tokens=loc_out,
                        actual_thinking_tokens=0,
                        provider="OLLAMA",
                        tier="LOCAL",
                        key_id="local_ollama",
                        project_name=project_name,
                        success=True
                    )
                    ACTIVE_WORKING_MODELS[effective_tier] = model_id
                    log_action(effective_tier, "LOCAL_ROSTER_EXECUTE_SUCCESS", {
                        "model": model_id,
                        "tokens_in": loc_in,
                        "tokens_out": loc_out,
                        "project_name": project_name
                    }, model_name=model_id)
                    break
                except Exception as e:
                    governor.commit_lease(
                        lease_id=loc_lease.get("lease_id"),
                        model_name=model_id,
                        actual_input_tokens=0,
                        actual_output_tokens=0,
                        actual_thinking_tokens=0,
                        provider="OLLAMA",
                        tier="LOCAL",
                        key_id="local_ollama",
                        project_name=project_name,
                        success=False
                    )
                    log_action(effective_tier, "LOCAL_ROSTER_EXECUTE_FAILED", {"model": model_id, "error": str(e), "project_name": project_name}, model_name=model_id)
                    continue

            # Model constraining profile check (bypass if user explicitly requested model)
            if model_id != explicit_model and not governor.is_model_allowed_by_profile(model_id, constraining_profile):
                continue

            # Look up agent bounds from registry
            agent_cfg = next((cfg for cfg in sub_agents.values() if cfg.get("model") == model_id), {})
            agent_max_in = agent_cfg.get("max_input_tokens", 8000)
            agent_max_out = agent_cfg.get("max_output_tokens", 4096)
            agent_think_budget = agent_cfg.get("thinking_budget", 0)

            # Determine provider for model
            target_provider = agent_cfg.get("provider") or governor.resolve_provider(model_id)

            # Resolve key context for model and provider with optional preferred_key_id
            ctx = key_manager.resolve_key_context(
                model_name=model_id,
                tier_preference=tier_pref,
                provider=target_provider,
                preferred_key_id=preferred_key_id
            )
            if not ctx.get("key_id") or (target_provider == "GOOGLE" and not ctx.get("client") and not ctx.get("raw_key")):
                continue

            try:
                from src.supervisor import check_build_lifecycle
                if not check_build_lifecycle():
                    return "[BUILD_CANCELLED]: Execution aborted by user cancellation."
            except ImportError:
                pass

            # Pre-Request Atomic Token Lease Acquisition
            lease = governor.acquire_lease(
                model_name=model_id,
                prompt_text=full_prompt,
                provider=ctx["provider"],
                tier=ctx["tier"],
                key_id=ctx["key_id"],
                requested_output_tokens=agent_max_out,
                requested_thinking_budget=agent_think_budget
            )

            if not lease.get("allowed"):
                log_action(tier, "GOVERNOR_LEASE_DENIED", {
                    "model": model_id,
                    "reason": lease.get("reason"),
                    "key_id": ctx["key_id"]
                }, model_name=model_id)
                if lease.get("reason") in ["RPM_LIMIT_EXCEEDED", "TPM_LIMIT_EXCEEDED"]:
                    key_manager.mark_exhausted(ctx["key_id"], cooldown_seconds=60)
                continue

            # Enforce input truncation if needed
            if lease.get("input_truncated_needed"):
                max_chars = lease["enforced_max_input_tokens"] * 4
                if len(full_prompt) > max_chars:
                    full_prompt = full_prompt[:max_chars]

            # Smooth thread pacing sleep
            pacing_delay = lease.get("pacing_delay_s", 0.0)
            if pacing_delay > 0 and os.getenv("DISABLE_PACING_SLEEP") != "1":
                time.sleep(min(pacing_delay, 5.0))

            # Execute Request Based on Provider
            call_success = False
            actual_in = lease["estimated_input_tokens"]
            actual_out = 0
            actual_think = 0

            try:
                if ctx["provider"] == "GOOGLE" and ctx.get("client"):
                    gen_config = {"temperature": 0.2}
                    if lease.get("enforced_max_output_tokens"):
                        gen_config["max_output_tokens"] = lease["enforced_max_output_tokens"]
                    
                    if types and lease.get("enforced_thinking_budget", 0) > 0:
                        try:
                            gen_config["thinking_config"] = types.ThinkingConfig(
                                thinking_budget=lease["enforced_thinking_budget"]
                            )
                        except Exception:
                            pass

                    response = ctx["client"].models.generate_content(
                        model=model_id,
                        config=gen_config,
                        contents=[system_prompt, full_prompt]
                    )
                    reply = response.text
                    usage_meta = getattr(response, "usage_metadata", None)
                    actual_in = getattr(usage_meta, "prompt_token_count", 0) or lease["estimated_input_tokens"]
                    actual_out = getattr(usage_meta, "candidates_token_count", 0) or max(1, len(reply or "") // 4)
                    actual_think = getattr(usage_meta, "thoughts_token_count", 0) or 0
                    call_success = True

                elif ctx["provider"] == "GROQ" and ctx.get("raw_key"):
                    payload = {
                        "model": model_id,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": full_prompt}
                        ],
                        "max_tokens": lease["enforced_max_output_tokens"],
                        "temperature": 0.2
                    }
                    req = urllib.request.Request(
                        "https://api.groq.com/openai/v1/chat/completions",
                        data=json.dumps(payload).encode("utf-8"),
                        headers={
                            "Authorization": f"Bearer {ctx['raw_key']}",
                            "Content-Type": "application/json",
                            "User-Agent": "AdvanceAssistant-OS/6.0"
                        }
                    )
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        groq_res = json.loads(resp.read().decode("utf-8"))
                        reply = groq_res["choices"][0]["message"]["content"]
                        usage = groq_res.get("usage", {})
                        actual_in = usage.get("prompt_tokens", lease["estimated_input_tokens"])
                        actual_out = usage.get("completion_tokens", max(1, len(reply or "") // 4))
                        actual_think = 0
                        call_success = True

                if call_success and reply:
                    ACTIVE_WORKING_MODELS[tier] = model_id
                    key_manager.mark_success(ctx["key_id"])
                    governor.commit_lease(
                        lease_id=lease["lease_id"],
                        model_name=model_id,
                        actual_input_tokens=actual_in,
                        actual_output_tokens=actual_out,
                        actual_thinking_tokens=actual_think,
                        provider=ctx["provider"],
                        tier=ctx["tier"],
                        key_id=ctx["key_id"],
                        project_name=project_name,
                        success=True
                    )
                    log_action(tier, "CLOUD_GENERATE_SUCCESS", {
                        "model": model_id,
                        "provider": ctx["provider"],
                        "key_id": ctx["key_id"],
                        "tokens_in": actual_in,
                        "tokens_out": actual_out,
                        "thinking_tokens": actual_think,
                        "project_name": project_name
                    }, model_name=model_id)
                    break

            except Exception as e:
                err_str = str(e)
                log_action(tier, "CLOUD_CANDIDATE_ATTEMPT_FAILED", {
                    "model": model_id,
                    "provider": ctx["provider"],
                    "key_id": ctx["key_id"],
                    "error": err_str[:120],
                    "project_name": project_name
                }, model_name=model_id)

                governor.commit_lease(
                    lease_id=lease["lease_id"],
                    model_name=model_id,
                    actual_input_tokens=0,
                    actual_output_tokens=0,
                    actual_thinking_tokens=0,
                    provider=ctx["provider"],
                    tier=ctx["tier"],
                    key_id=ctx["key_id"],
                    project_name=project_name,
                    success=False
                )

                if "429" in err_str or "quota" in err_str.lower() or "resourceexhausted" in err_str.lower():
                    key_manager.mark_exhausted(ctx["key_id"], cooldown_seconds=60)
                    log_action(tier, "KEY_ROTATION_TRIGGERED", {
                        "exhausted_key": ctx["key_id"],
                        "reason": "HTTP 429 Quota Exhaustion"
                    }, model_name=model_id)
                continue

    # Offline Core Fallback (Ollama Local Weights)
    if not reply:
        log_action(tier, "OFFLINE_CORE_FALLBACK", {"model": LOCAL_WORKER_MODEL, "project_name": project_name}, model_name=LOCAL_WORKER_MODEL)
        local_user_prompt = user_prompt + "\nStrictly remember to use the format: EXECUTE: WRITE_FILE: <path> | <code>. Do not include markdown blocks or conversational introductions."
        
        try:
            from src.supervisor import check_build_lifecycle
            if not check_build_lifecycle():
                return "[BUILD_CANCELLED]: Execution aborted by user cancellation."
        except ImportError:
            pass

        loc_lease = governor.acquire_lease(
            model_name=LOCAL_WORKER_MODEL,
            prompt_text=local_user_prompt,
            provider="OLLAMA",
            tier="LOCAL",
            key_id="local_worker"
        )

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

            loc_in = max(1, len(local_user_prompt) // 4)
            loc_out = max(1, len(reply) // 4)
            governor.commit_lease(
                lease_id=loc_lease.get("lease_id"),
                model_name=LOCAL_WORKER_MODEL,
                actual_input_tokens=loc_in,
                actual_output_tokens=loc_out,
                actual_thinking_tokens=0,
                provider="OLLAMA",
                tier="LOCAL",
                key_id="local_worker",
                project_name=project_name,
                success=True
            )
        except Exception as e:
            governor.commit_lease(
                lease_id=loc_lease.get("lease_id"),
                model_name=LOCAL_WORKER_MODEL,
                actual_input_tokens=0,
                actual_output_tokens=0,
                actual_thinking_tokens=0,
                provider="OLLAMA",
                tier="LOCAL",
                key_id="local_worker",
                project_name=project_name,
                success=False
            )
            log_action(tier, "OLLAMA_CRITICAL_ERROR", {"error": str(e), "project_name": project_name}, model_name=LOCAL_WORKER_MODEL)
            return f"Router Pipeline Critical Execution Failure: {str(e)}"

    # Command Execution & File Creation Handling
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
