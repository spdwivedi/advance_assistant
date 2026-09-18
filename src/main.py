import sys
import os
import re

# Add parent directory to system path for clean module resolution
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.agent import run_agent_pipeline
from src.vision import VisionEngine
from src.supervisor import ProjectSupervisor
from src.tool_bridge import invoke_external_agent_tool, trigger_n8n_webhook
from src.memory_manager import (
    get_last_env_location, get_tool_catalog, rebuild_catalog_index,
    get_knowledge_base_telemetry, defragment_and_consolidate_books,
    get_ist_now_str
)
from src.config import (
    DEFAULT_EXECUTION_MODE, DEFAULT_RESEARCH_PROFILE, RESEARCH_PROFILES,
    DEFAULT_MODEL_CONSTRAINING_PROFILE, MODEL_CONSTRAINING_PROFILES,
    DEFAULT_ISOLATION_ENABLED, DEFAULT_TARGET_ENVIRONMENT,
    LOCAL_ORCHESTRATOR_MODEL, LOCAL_WORKER_MODEL, TEST_DATA_DIR, WIN_TEST_DATA_DIR
)
from src.logger import log_action
from src.permissions import normalize_cross_platform_path
from src.token_governor import sync_wsl_time_from_internet, TokenGovernor

# Initialize system token governor
governor = TokenGovernor()

# ==============================================================================
# ADVANCE ASSISTANT OS v6.0 - MASTER CONTROL PANEL GATEWAY CLI
# ==============================================================================

def parse_all_in_one_prompt(user_input: str, default_mode: str, default_profile: str, default_constrain: str) -> tuple:
    """
    Parses a single prompt containing parameters inline separated by pipes v6.0.
    Syntax: build: <path> | project: <NAME> | mode: <MODE> | profile: <PROFILE> | constrain: <CONSTRAIN_PROFILE> | <goal>
    """
    active_mode = default_mode
    active_profile = default_profile
    active_constrain = default_constrain
    project_name = "default_project"
    task_goal = ""
    target_path = get_last_env_location()

    if user_input.lower().startswith("build-isolated:"):
        raw_command = user_input[len("build-isolated:"):].strip()
    else:
        raw_command = user_input[len("build:"):].strip()

    parts = [p.strip() for p in raw_command.split("|")]
    
    if parts:
        target_path = parts[0]
        parts = parts[1:]

    remaining_goals = []
    for part in parts:
        p_lower = part.lower()
        if p_lower.startswith("mode:"):
            mode_val = part.split("mode:", 1)[1].strip().upper()
            valid_modes = ["AUTO_DETECT", "OFFLINE_ONLY", "HYBRID_CLOUD", "OFFLINE_AGENTIC", "HYBRID_AGENTIC"]
            if mode_val in valid_modes:
                active_mode = mode_val
        elif p_lower.startswith("profile:"):
            profile_val = part.split("profile:", 1)[1].strip().upper()
            if profile_val in RESEARCH_PROFILES:
                active_profile = profile_val
        elif p_lower.startswith("constrain:") or p_lower.startswith("constraining:"):
            c_val = part.split(":", 1)[1].strip().upper()
            if c_val in MODEL_CONSTRAINING_PROFILES:
                active_constrain = c_val
        elif p_lower.startswith("project:") or p_lower.startswith("project_name:"):
            project_name = part.split(":", 1)[1].strip()
        else:
            if part:
                remaining_goals.append(part)

    task_goal = "|".join(remaining_goals)
    return target_path, active_mode, active_profile, active_constrain, project_name, task_goal


def display_welcome_banner(active_mode: str, active_profile: str, active_constrain: str, active_path: str):
    """Renders the master operational status dashboard at startup."""
    print("\n==================================================================")
    print("       ADVANCE ASSISTANT ADAPTIVE OPERATIONAL ENGINE v6.0        ")
    print("==================================================================")
    print(f" Active Settings Profile:")
    print(f"   • Primary Execution Mode:    {active_mode}")
    print(f"   • Research & Planning Level:  {active_profile} ({RESEARCH_PROFILES[active_profile]['description']})")
    print(f"   • Model Constraint Profile:  {active_constrain} ({MODEL_CONSTRAINING_PROFILES[active_constrain]['description']})")
    print(f"   • Knowledge Base Status:      {get_knowledge_base_telemetry()}")
    print(f"   • Local Orchestrator Engine:  {LOCAL_ORCHESTRATOR_MODEL} (RAM+GPU)")
    print(f"   • Fast Local Worker Engine:   {LOCAL_WORKER_MODEL} (Pure VRAM)")
    print(f"   • Quota Reset Anchor Time:    1:30 PM IST (00:00 Pacific Time)")
    print(f"   • Default Staging Isolation:  {'ENABLED' if DEFAULT_ISOLATION_ENABLED else 'DISABLED (Direct Write)'}")
    print(f"   • Target Host Environment:   {DEFAULT_TARGET_ENVIRONMENT}")
    print(f"   • Last Saved Path Context:   {active_path}")
    print("==================================================================")
    print(" Operational Command Directives:")
    print("   • build: <path> | project: <N> | mode: <M> | profile: <P> | constrain: <C> | <goal>")
    print("   • constrain: <HIGH_RPM_TPM|HIGHEST_RPM_TPM|PRO_PLAN|GEMINI_ONLY|GEMINI_3_ONLY|GEMINI_2_ONLY|OFFLINE_PURE>")
    print("   • profile: <BASIC|MEDIUM|HIGH|MAX> ➜ Switch Active Research Depth Profile")
    print("   • mode: <AUTO_DETECT|OFFLINE_ONLY|HYBRID_CLOUD|OFFLINE_AGENTIC|HYBRID_AGENTIC> ➜ Switch Execution Strategy")
    print("   • defrag                          ➜ Defragment & Consolidate Knowledge Books")
    print("   • test                            ➜ Execute Cross-Platform Subsystem Test Harness")
    print("   • aider: <path> | <task>           ➜ Dispatch Task to Local Aider Engine")
    print("   • roocode: <path> | <task>        ➜ Write Directive for RooCode/Cursor")
    print("   • vision: <url>                    ➜ Playwright Viewport Visual Inspection")
    print("   • n8n: <task_description>         ➜ Trigger Local Windows n8n Workflow")
    print("   • reindex                          ➜ Rebuild Knowledge Catalog Index")
    print("   • Standard Text Prompt            ➜ Direct Chat & Router Tunnel")
    print("==================================================================\n")


def main():
    rebuild_catalog_index()
    active_mode = DEFAULT_EXECUTION_MODE
    active_profile = DEFAULT_RESEARCH_PROFILE
    active_constrain = DEFAULT_MODEL_CONSTRAINING_PROFILE
    last_path = normalize_cross_platform_path(get_last_env_location())
    
    vision_engine = VisionEngine()
    display_welcome_banner(active_mode, active_profile, active_constrain, last_path)

    log_action(
        category_or_model="GATEWAY",
        action_type="SYSTEM_INITIALIZED",
        details={
            "mode": active_mode, 
            "profile": active_profile, 
            "constraining_profile": active_constrain,
            "last_path": last_path, 
            "env": DEFAULT_TARGET_ENVIRONMENT,
            "orchestrator": LOCAL_ORCHESTRATOR_MODEL,
            "worker": LOCAL_WORKER_MODEL,
            "timestamp": get_ist_now_str()
        }
    )

    while True:
        try:
            prompt_indicator = f"[{active_mode}:{active_profile}:{active_constrain} @ {os.path.basename(last_path) or 'root'}]: "
            user_input = input(prompt_indicator).strip()

            if user_input.lower() in ["exit", "quit", "q"]:
                print("\nShutting down Advance Assistant OS v6.0 control systems cleanly...")
                log_action(category_or_model="GATEWAY", action_type="SYSTEM_SHUTDOWN", details={})
                break

            if not user_input:
                continue

            if user_input.lower().startswith("profile:"):
                requested_profile = user_input.split("profile:", 1)[1].strip().upper()
                if requested_profile in RESEARCH_PROFILES:
                    active_profile = requested_profile
                    print(f"✅ Active research profile switched to: {active_profile}")
                    log_action(category_or_model="GATEWAY", action_type="PROFILE_SWITCH", details={"new_profile": active_profile})
                else:
                    print(f"❌ Invalid profile '{requested_profile}'.")
                continue

            if user_input.lower().startswith("constrain:") or user_input.lower().startswith("constraining:"):
                prefix = "constrain:" if user_input.lower().startswith("constrain:") else "constraining:"
                requested_c = user_input[len(prefix):].strip().upper()
                if requested_c in MODEL_CONSTRAINING_PROFILES:
                    active_constrain = requested_c
                    print(f"✅ Active model constraining profile switched to: {active_constrain}")
                    log_action(category_or_model="GATEWAY", action_type="CONSTRAIN_SWITCH", details={"new_constrain": active_constrain})
                else:
                    print(f"❌ Invalid model constraint profile '{requested_c}'.")
                continue

            if user_input.lower().startswith("mode:"):
                requested_mode = user_input.split("mode:", 1)[1].strip().upper()
                valid_modes = ["AUTO_DETECT", "OFFLINE_ONLY", "HYBRID_CLOUD", "OFFLINE_AGENTIC", "HYBRID_AGENTIC"]
                if requested_mode in valid_modes:
                    active_mode = requested_mode
                    print(f"✅ Active operational mode switched to: {active_mode}")
                    log_action(category_or_model="GATEWAY", action_type="MODE_SWITCH", details={"new_mode": active_mode})
                else:
                    print(f"❌ Invalid mode '{requested_mode}'.")
                continue

            if user_input.lower() in ["reindex", "index", "rebuild-index"]:
                print("🔄 Reindexing knowledge catalog and topic books...")
                catalog = rebuild_catalog_index()
                print(f"✅ Catalog index rebuilt successfully. {get_knowledge_base_telemetry()}")
                continue

            if user_input.lower() in ["defrag", "consolidate", "defrag-books"]:
                defragment_and_consolidate_books()
                continue

            if user_input.lower() in ["test", "run-tests"]:
                print(f"\n🧪 Launching Cross-Platform Subsystem Test Harness...")
                print(f"   WSL Test Artifact Target: {TEST_DATA_DIR}")
                print(f"   Windows Test Artifact Target: {WIN_TEST_DATA_DIR}")
                os.system("python3 test/test_scripts/run_all_tests.py")
                continue

            # ------------------------------------------------------------------
            # ALL-IN-ONE PIPED COMPILER SYSTEM
            # ------------------------------------------------------------------
            if user_input.lower().startswith("build:") or user_input.lower().startswith("build-isolated:"):
                is_isolated = user_input.lower().startswith("build-isolated:")
                
                target_path, run_mode, run_profile, run_constrain, project_name, task_goal = parse_all_in_one_prompt(
                    user_input, active_mode, active_profile, active_constrain
                )

                last_path = normalize_cross_platform_path(target_path)
                print(f"\n🚀 Launching Multi-Agent Workspace Builder v6.0 ({'Isolated Staging' if is_isolated else 'Direct Write'})...")
                print(f"   Project Workspace: {project_name}")
                print(f"   Target Location:   {last_path}")
                print(f"   Execution Mode:    {run_mode}")
                print(f"   Research Depth:    {run_profile}")
                print(f"   Model Constrain:   {run_constrain}")
                print(f"   Engineering Goal:  {task_goal}\n")

                supervisor = ProjectSupervisor(
                    target_destination=last_path, 
                    isolate=is_isolated,
                    project_name=project_name
                )
                supervisor.process_complete_development_cycle(
                    master_instruction=task_goal, 
                    mode_override=run_mode,
                    profile_level=run_profile,
                    constraining_profile=run_constrain
                )
                continue

            if user_input.lower().startswith("aider:"):
                raw_command = user_input.replace("aider:", "", 1).strip()
                if "|" in raw_command:
                    path_part, task_part = raw_command.split("|", 1)
                    target_path = path_part.strip()
                    task_instruction = task_part.strip()
                else:
                    target_path = get_last_env_location()
                    task_instruction = raw_command.strip()

                last_path = normalize_cross_platform_path(target_path)
                output = invoke_external_agent_tool("aider", last_path, task_instruction)
                print(f"\n[Aider Output]:\n{output}")
                continue

            if user_input.lower().startswith("roocode:") or user_input.lower().startswith("cursor:"):
                prefix = "roocode:" if user_input.lower().startswith("roocode:") else "cursor:"
                raw_command = user_input[len(prefix):].strip()
                if "|" in raw_command:
                    path_part, task_part = raw_command.split("|", 1)
                    target_path = path_part.strip()
                    task_instruction = task_part.strip()
                else:
                    target_path = get_last_env_location()
                    task_instruction = raw_command.strip()

                last_path = normalize_cross_platform_path(target_path)
                output = invoke_external_agent_tool("roocode", last_path, task_instruction)
                print(f"\n[RooCode Output]:\n{output}")
                continue

            if user_input.lower().startswith("vision:"):
                url = user_input.split("vision:", 1)[1].strip()
                print(f"\nScanning web viewport layout for: {url}...")
                analysis = vision_engine.analyze_web_page(url)
                print(f"\n{analysis}")
                continue

            if user_input.lower().startswith("n8n:"):
                task_desc = user_input.split("n8n:", 1)[1].strip()
                webhook_url = "http://localhost:5678/webhook/advance-assistant-task"
                payload = {"task": task_desc, "directory": last_path, "source": "CLI"}
                res = trigger_n8n_webhook(webhook_url, payload)
                print(f"\n[n8n Workflow Output]:\n{res}")
                continue

            print("\nProcessing via Agent Router Pipeline...")
            response = run_agent_pipeline(
                user_prompt=user_input, 
                tier="MID", 
                target_workspace=last_path, 
                mode_override=active_mode,
                profile_override=active_profile,
                constraining_profile_override=active_constrain
            )
            print(f"\n[Agent Output Response]:\n{response}\n")

        except KeyboardInterrupt:
            print("\nInterrupt signal intercepted. Exiting system safely...")
            break
        except Exception as e:
            log_action(category_or_model="GATEWAY", action_type="CRITICAL_EXCEPTION", details={"error": str(e)})
            print(f"\n❌ [Gateway Exception Intercepted]: {str(e)}\n")

if __name__ == "__main__":
    main()