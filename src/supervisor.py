from typing import Optional, List, Dict, Any
import os
import json
import time
import re
import shutil
import concurrent.futures
import threading
from src.config import (
    DEFAULT_ISOLATION_ENABLED, MAX_SWARM_WORKERS, 
    SWARM_REGISTRY_FILE, SEARCH_DATA_DIR, PROJECT_LOG_DIR,
    DEFAULT_EXECUTION_MODE
)
from src.agent import run_agent_pipeline, governor
from src.key_manager import key_manager
from src.permissions import execute_command, normalize_cross_platform_path
from src.memory_manager import (
    record_env_location, defragment_and_consolidate_books, 
    get_knowledge_base_telemetry
)
from src.logger import log_action

# Thread-safe lifecycle events
build_cancel_event = threading.Event()
build_pause_event = threading.Event()
build_pause_event.set()  # Initialized set so unpaused by default


def request_build_stop() -> dict:
    """
    Signals all active supervisor threads and agent pipelines to abort immediately.
    Wakes any paused threads, marks registry as CANCELLED, and clears domain locks.
    """
    build_cancel_event.set()
    build_pause_event.set()
    try:
        if os.path.exists(SWARM_REGISTRY_FILE):
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["status"] = "CANCELLED"
            data["domain_locks"] = {}
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
    except Exception:
        pass
    log_action("SUPERVISOR", "BUILD_STOP_REQUESTED", {"state": "CANCELLED"})
    return {"status": "success", "state": "CANCELLED"}


def toggle_build_pause(pause: bool = None) -> dict:
    """
    Pauses or resumes the active build cycle.
    If pause is None, toggles current pause state.
    """
    if pause is None:
        if build_pause_event.is_set():
            build_pause_event.clear()
            new_state = "PAUSED"
        else:
            build_pause_event.set()
            new_state = "RUNNING"
    elif pause:
        build_pause_event.clear()
        new_state = "PAUSED"
    else:
        build_pause_event.set()
        new_state = "RUNNING"

    try:
        if os.path.exists(SWARM_REGISTRY_FILE):
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["status"] = new_state
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
    except Exception:
        pass

    is_paused = not build_pause_event.is_set()
    log_action("SUPERVISOR", "BUILD_PAUSE_TOGGLED", {"paused": is_paused, "state": new_state})
    return {"status": "success", "paused": is_paused, "state": new_state}


def reset_build_lifecycle() -> None:
    """Clears cancel event and unpauses lifecycle controls for a fresh build."""
    build_cancel_event.clear()
    build_pause_event.set()


def check_build_lifecycle() -> bool:
    """
    Checks whether the current build should continue.
    Returns False immediately if build_cancel_event is set.
    If build_pause_event is cleared, waits in 0.25s intervals until unpaused or cancelled.
    Returns True if execution may proceed.
    """
    if build_cancel_event.is_set():
        return False
    while not build_pause_event.is_set():
        if build_cancel_event.is_set():
            return False
        time.sleep(0.25)
    return not build_cancel_event.is_set()



def _load_active_swarm_config() -> dict:
    """
    Stage 16.2: Reads .agent_memory/swarm_profiles.json to retrieve the active
    orchestrator engine, worker models roster, max models used, routing strategy,
    and preferred API key ID with safe defaults.
    """
    default_cfg = {
        "active_swarm_id": "GLOBAL_HYBRID_SWARM",
        "orchestrator_engine": "qwen2.5-coder:32b",
        "worker_models": [
            "gemini-2.5-flash",
            "gemini-2.0-flash-lite",
            "qwen-2.5-coder-32b",
            "qwen2.5-coder:7b"
        ],
        "max_models_used": 4,
        "max_concurrency_workers": 8,
        "routing_strategy": "ROUND_ROBIN",
        "preferred_key_id": "AUTO"
    }
    try:
        swarm_file = os.path.join(os.path.abspath("./.agent_memory"), "swarm_profiles.json")
        if os.path.exists(swarm_file):
            with open(swarm_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                active_id = data.get("active_swarm_id")
                swarms = data.get("swarms", [])
                active_profile = next((s for s in swarms if s.get("id") == active_id), {})
                return {
                    "active_swarm_id": active_id or default_cfg["active_swarm_id"],
                    "orchestrator_engine": active_profile.get("orchestrator") or data.get("orchestrator_engine") or default_cfg["orchestrator_engine"],
                    "worker_models": active_profile.get("worker_models") or data.get("worker_models") or default_cfg["worker_models"],
                    "max_models_used": active_profile.get("max_models_used") or data.get("max_models_used") or default_cfg["max_models_used"],
                    "max_concurrency_workers": active_profile.get("default_concurrency") or data.get("max_concurrency_workers") or default_cfg["max_concurrency_workers"],
                    "routing_strategy": active_profile.get("routing_strategy") or data.get("routing_strategy") or default_cfg["routing_strategy"],
                    "preferred_key_id": data.get("preferred_key_id") or default_cfg["preferred_key_id"]
                }
    except Exception:
        pass
    return default_cfg

class ProjectSupervisor:
    def __init__(self, target_destination: str, isolate: bool = None, max_workers: int = None, project_name: str = None, test_name: str = None):
        """
        Initializes the v6.0 Project Workspace Supervisor with Cross-Platform
        Normalization, Isolated Build Ledgers, and System Constraining support.
        """
        self._ui_lock = threading.Lock()
        self.project_name = project_name or "default_project"
        self.test_name = test_name
        
        # Cross-platform drive path translation
        clean_path = normalize_cross_platform_path(target_destination)
        self.target_destination = os.path.normpath(os.path.abspath(clean_path))
        
        requested_workers = max_workers or (MAX_SWARM_WORKERS - 1)
        self.max_workers = min(requested_workers, MAX_SWARM_WORKERS - 1)
        self.isolate = DEFAULT_ISOLATION_ENABLED if isolate is None else isolate
        
        record_env_location(self.target_destination)

        if self.isolate:
            self.active_workspace = os.path.normpath(os.path.join(self.target_destination, ".staging_temp"))
            shutil.rmtree(self.active_workspace, ignore_errors=True)
            os.makedirs(self.active_workspace, exist_ok=True)
        else:
            self.active_workspace = self.target_destination
            os.makedirs(self.active_workspace, exist_ok=True)

        self._initialize_swarm_registry()
        self._initialize_project_blueprint_ledger()

    def _initialize_swarm_registry(self):
        """Creates or resets the tracking central control state file registry."""
        registry_data = {
            "project_name": self.project_name,
            "project_root": self.target_destination,
            "active_workspace": self.active_workspace,
            "max_available_workers": self.max_workers,
            "active_orchestrator": getattr(self, "active_orchestrator", None),
            "active_worker_models": getattr(self, "active_worker_models", []),
            "worker_assignments": getattr(self, "worker_assignments", {}),
            "domain_locks": {},
            "completed_files": [],
            "status": "INITIALIZED"
        }
        with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
            json.dump(registry_data, f, indent=4)

    def _update_worker_assignment(self, file_path: str, worker_id: str, model_name: str):
        """Stage 16.2: Records per-worker model assignment in swarm_registry.json."""
        try:
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if "worker_assignments" not in data:
                data["worker_assignments"] = {}
            data["worker_assignments"][file_path] = {"worker": worker_id, "model": model_name}
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        except Exception:
            pass

    def _initialize_project_blueprint_ledger(self):
        """Initializes or loads the project-scoped workspace historical blueprint ledger."""
        clean_p_name = re.sub(r'[\W_]+', '_', str(self.project_name)).strip('_').lower()
        self.p_dir = os.path.join(PROJECT_LOG_DIR, clean_p_name)
        os.makedirs(self.p_dir, exist_ok=True)
        self.blueprint_ledger_file = os.path.join(self.p_dir, "blueprint_ledger.json")

        if not os.path.exists(self.blueprint_ledger_file):
            initial_ledger = {
                "project_name": self.project_name,
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S IST"),
                "last_modified": time.strftime("%Y-%m-%d %H:%M:%S IST"),
                "architecture_blueprint": {},
                "file_history": []
            }
            with open(self.blueprint_ledger_file, "w", encoding="utf-8") as f:
                json.dump(initial_ledger, f, indent=4)

    def _update_project_blueprint_ledger(self, file_path: str, task: str, action: str):
        """Updates the persistent blueprint ledger metadata file tracking structural updates."""
        try:
            with open(self.blueprint_ledger_file, "r", encoding="utf-8") as f:
                ledger = json.load(f)
            
            ledger["last_modified"] = time.strftime("%Y-%m-%d %H:%M:%S IST")
            ledger["architecture_blueprint"][file_path] = {
                "last_action": action,
                "associated_task": task,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S IST")
            }
            ledger["file_history"].append({
                "file": file_path,
                "action": action,
                "task": task,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S IST")
            })
            
            with open(self.blueprint_ledger_file, "w", encoding="utf-8") as f:
                json.dump(ledger, f, indent=4)
        except Exception:
            pass

    def _update_registry_lock(self, file_path: str, agent_role: str):
        """Registers a strict domain path lock onto a separate module target entry."""
        try:
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["domain_locks"][file_path] = agent_role
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        except Exception:
            pass

    def _mark_file_completed_in_registry(self, file_path: str):
        """Logs file status as verified and moves path records out of active locking flags."""
        try:
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if file_path in data["domain_locks"]:
                del data["domain_locks"][file_path]
            if file_path not in data["completed_files"]:
                data["completed_files"].append(file_path)
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        except Exception:
            pass

    def print_dashboard(self, tasks_status: dict, active_op: str = "Idle", constraining_profile: str = "HIGH_RPM_TPM"):
        """Renders a non-scrolling thread-safe real-time monitor panel with Matrix Group Telemetry."""
        with self._ui_lock:
            print("\033[H\033[J", end="")
            print("═"*78)
            print(f" 📊 v6.0 LIVE SWARM MONITOR | Workspace ID: {self.project_name.upper()}")
            print(f" Staging Isolation Mode:    [{'ENABLED' if self.isolate else 'DIRECT WRITE'}]")
            print(f" Active Constraints Filter: [{constraining_profile}]")
            print(f" Target Workspace Path:     {self.target_destination}")
            print(f" 📚 Knowledge Base Status:   {get_knowledge_base_telemetry()}")
            print("═"*78)
            print(" 🤖 COOPERATIVE SWARM WORKFORCE STATUS:")
            
            for task_id in sorted(tasks_status.keys(), key=lambda x: str(x)):
                info = tasks_status[task_id]
                status_icon = "🟢 RUNNING" if info["status"] == "RUNNING" else ("✅ DONE" if info["status"] == "DONE" else "❌ FAILED")
                print(f"  • [{info['agent_role']}] {info['description'][:38]:<40} ➜ {status_icon}")
            
            print("─"*78)
            print(" 💳 LIVE GOVERNOR MATRICES FREE TIER QUOTAS:")
            
            tracked_models = [
                "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3.6-flash", 
                "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash",
                "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", 
                "qwen2.5-coder:32b", "qwen2.5-coder:7b"
            ]
            for model in tracked_models:
                snippet = governor.render_live_telemetry_snippet(model)
                status_label = "⚡ LOCAL" if "qwen" in model else "🟢 POOL"
                print(f"  • {model:<22} ➜ {snippet} {status_label}")
                
            print("═"*78)
            print(f" ⚙️ Current Swarm Operation: {active_op[:72]}")
            print("═"*78 + "\n")

    def run_sub_agent_worker(
        self,
        task_id: int,
        task_description: str,
        tasks_status: dict,
        mode_override: str = None,
        profile_level: str = "MEDIUM",
        constraining_profile: str = "HIGH_RPM_TPM",
        explicit_model: str = None,
        fallback_models: list = None,
        preferred_key_id: str = None
    ):
        """Worker Thread v6.0: Operates strictly inside its assigned sub-plan domain with explicit model dispatcher."""
        if not check_build_lifecycle():
            tasks_status[task_id] = {"agent_role": f"SubAgent-{task_id}", "description": task_description, "status": "CANCELLED"}
            return
        agent_role = f"SubAgent-{task_id}"
        tasks_status[task_id] = {"agent_role": agent_role, "description": task_description, "status": "RUNNING"}
        
        detected_files = re.findall(r'[\w\-./]+\.\w+', task_description)
        assigned_file = detected_files[0] if detected_files else f"domain_task_{task_id}.txt"
        
        self.print_dashboard(tasks_status, active_op=f"{agent_role} locked target file: {assigned_file}", constraining_profile=constraining_profile)
        self._update_registry_lock(assigned_file, agent_role)
        self._update_worker_assignment(assigned_file, agent_role, explicit_model or "default")
        self._update_project_blueprint_ledger(assigned_file, task_description, "COMPILING")
        
        prompt = f"project:{self.project_name} | Task Directive: {task_description}. You are strictly assigned to generate content for: '{assigned_file}'. Do NOT edit other file layers."
        
        try:
            run_agent_pipeline(
                user_prompt=prompt, 
                tier="AUTO_DETECT" if mode_override == "AUTO_DETECT" else "MID", 
                target_workspace=self.active_workspace,
                mode_override=mode_override,
                profile_override=profile_level,
                constraining_profile_override=constraining_profile,
                project_name=self.project_name,
                test_name=self.test_name,
                explicit_model=explicit_model,
                fallback_models=fallback_models,
                preferred_key_id=preferred_key_id
            )
            tasks_status[task_id]["status"] = "DONE"
            self._mark_file_completed_in_registry(assigned_file)
            self._update_project_blueprint_ledger(assigned_file, task_description, "WRITE_SUCCESS")
        except Exception as e:
            tasks_status[task_id]["status"] = "FAILED"
            self._update_project_blueprint_ledger(assigned_file, task_description, f"FAILED: {str(e)}")
            log_action("SUPERVISOR", "WORKER_EXCEPTION", {"agent": agent_role, "error": str(e), "project_name": self.project_name, "test_name": self.test_name})
            
        self.print_dashboard(tasks_status, active_op=f"{agent_role} finalized operations.", constraining_profile=constraining_profile)

    def process_complete_development_cycle(
        self,
        master_instruction: str,
        mode_override: str = None,
        profile_level: str = "MAX",
        constraining_profile: str = "HIGH_RPM_TPM",
        orchestrator_model: Optional[str] = None,
        worker_models: Optional[List[str]] = None,
        max_models_used: Optional[int] = None,
        routing_strategy: str = "ROUND_ROBIN",
        preferred_key_id: Optional[str] = None
    ):
        """
        Stage 16.2: Executes an architecture-aware cross-platform multi-phase system compilation loop
        with explicit multi-model swarm distribution and atomic lease staggered queueing.
        """
        reset_build_lifecycle()
        try:
            from src.token_governor import token_governor
            token_governor.reset_build_counter(self.project_name)
        except Exception:
            pass

        active_swarm_cfg = _load_active_swarm_config()
        orch = orchestrator_model or active_swarm_cfg.get("orchestrator_engine") or "qwen2.5-coder:32b"
        roster = worker_models or active_swarm_cfg.get("worker_models") or ["gemini-2.5-flash", "qwen2.5-coder:7b"]
        limit_n = max(1, min(len(roster), int(max_models_used or active_swarm_cfg.get("max_models_used") or len(roster))))
        active_roster = roster[:limit_n]
        self.active_orchestrator = orch
        self.active_worker_models = active_roster
        self.worker_assignments = {}

        try:
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                reg_d = json.load(f)
            reg_d["active_orchestrator"] = orch
            reg_d["active_worker_models"] = active_roster
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(reg_d, f, indent=4)
        except Exception:
            pass

        tasks_status = {0: {"agent_role": "Orchestrator", "description": f"Phase 0 Orchestrator ({orch}) mapping context-aware blueprints", "status": "RUNNING"}}
        self.print_dashboard(tasks_status, active_op="Orchestrator initializing context-aware blueprint mapping...", constraining_profile=constraining_profile)

        log_action(
            category_or_model="SUPERVISOR", 
            action_type="STARTING_BUILD_CYCLE", 
            details={"workspace": self.target_destination, "isolate": self.isolate, "profile": profile_level, "project_name": self.project_name, "test_name": self.test_name}
        )

        # Append historical blueprint ledger entries if existing project modifications are requested
        try:
            with open(self.blueprint_ledger_file, "r", encoding="utf-8") as f:
                ledger = json.load(f)
            historical_context = f"\nExisting Project Blueprint Ledger Structure:\n{json.dumps(ledger.get('architecture_blueprint', {}))}"
        except Exception:
            historical_context = ""

        planning_prompt = f"""Decompose this goal into discrete tasks mapped to independent specific filenames.
Group boilerplate config files at the top and specialized business modules below.{historical_context}
Output simple instructions (one statement per line). Do NOT write bullets or numbers.

Goal: {master_instruction}"""
        
        blueprint = run_agent_pipeline(
            user_prompt=f"project:{self.project_name} | {planning_prompt}", 
            tier="HIGH", 
            target_workspace=self.active_workspace,
            mode_override=mode_override,
            profile_override=profile_level,
            constraining_profile_override=constraining_profile,
            project_name=self.project_name,
            test_name=self.test_name,
            explicit_model=orch,
            fallback_models=active_roster,
            preferred_key_id=preferred_key_id
        )
        
        raw_tasks = [line.strip() for line in blueprint.split("\n") if line.strip() and not line.startswith("=")]
        if not raw_tasks:
            raw_tasks = [master_instruction]

        prep_keywords = ["delete", "remove", "clean", "wipe", "clear", "mkdir", "init", "package.json", "requirements.txt"]
        prep_tasks = [t for t in raw_tasks if any(kw in t.lower() for kw in prep_keywords)]
        coding_tasks = [t for t in raw_tasks if t not in prep_tasks]

        tasks_status[0]["status"] = "DONE"
        self.print_dashboard(tasks_status, active_op="Blueprint breakdown finalized.", constraining_profile=constraining_profile)

        if not check_build_lifecycle():
            tasks_status[0]["status"] = "CANCELLED"
            return

        # Phase 1: Config & Boilerplate Setup
        if prep_tasks:
            for idx, prep_task in enumerate(prep_tasks):
                tasks_status[f"prep_{idx}"] = {"agent_role": "Boilerplate", "description": prep_task, "status": "RUNNING"}
                self.print_dashboard(tasks_status, active_op=f"Deploying config baseline step: {prep_task}", constraining_profile=constraining_profile)
                
                run_agent_pipeline(
                    user_prompt=f"project:{self.project_name} | {prep_task}", 
                    tier="FAST", 
                    target_workspace=self.active_workspace,
                    mode_override=mode_override,
                    profile_override=profile_level,
                    constraining_profile_override=constraining_profile,
                    project_name=self.project_name,
                    test_name=self.test_name
                )
                tasks_status[f"prep_{idx}"]["status"] = "DONE"

        if not check_build_lifecycle():
            tasks_status[0]["status"] = "CANCELLED"
            return

        # Phase 2: Concurrent Multi-Thread Swarm Processing with Limit-Aware Dynamic Scaling
        routing_status = key_manager.get_routing_status()
        active_cloud_keys = routing_status.get("active_keys", 0)

        effective_mode = mode_override or DEFAULT_EXECUTION_MODE
        if effective_mode == "OFFLINE_ONLY" or active_cloud_keys == 0:
            effective_workers = min(self.max_workers, 4)
        else:
            safe_calc = governor.calculate_safe_concurrency(
                provider="GOOGLE",
                tier="FREE",
                model_name="gemini-3.6-flash",
                active_keys_count=max(1, active_cloud_keys)
            )
            effective_workers = min(self.max_workers, safe_calc)

        effective_workers = max(1, effective_workers)

        self.print_dashboard(tasks_status, active_op=f"Spawning dynamic swarm workforce with allocation of {effective_workers} threads...", constraining_profile=constraining_profile)

        with concurrent.futures.ThreadPoolExecutor(max_workers=effective_workers) as executor:
            futures = []
            for idx, task in enumerate(coding_tasks):
                assigned_model = active_roster[idx % len(active_roster)]
                fut = executor.submit(
                    self.run_sub_agent_worker,
                    idx + 1, task, tasks_status, mode_override, profile_level, constraining_profile,
                    explicit_model=assigned_model, fallback_models=active_roster, preferred_key_id=preferred_key_id
                )
                futures.append(fut)
                time.sleep(0.15)  # Stagger worker submissions slightly so threads acquire atomic leases in orderly queue
            concurrent.futures.wait(futures)

        if not check_build_lifecycle():
            tasks_status[0]["status"] = "CANCELLED"
            return

        # Phase 3: Quality Assurance Shell Execution Validation
        self.print_dashboard(tasks_status, active_op="Initiating compilation unit validation tests...", constraining_profile=constraining_profile)
        
        if os.path.exists(os.path.join(self.active_workspace, "package.json")):
            test_out = execute_command("npm install --legacy-peer-deps", target_dir=self.active_workspace, auto_approve=True, project_name=self.project_name, test_name=self.test_name)
        else:
            test_out = execute_command("pytest || python3 -m unittest", target_dir=self.active_workspace, auto_approve=True, project_name=self.project_name, test_name=self.test_name)
        
        # Phase 4: Self-Healing Repair Loops (Skipped or logged if running inside test script suites)
        if "failed" in test_out.lower() or "error" in test_out.lower():
            if self.test_name:
                self.print_dashboard(tasks_status, active_op="Test suite structural anomaly identified. Appending log traces.", constraining_profile=constraining_profile)
                log_action("SUPERVISOR", "TEST_ANOMALY_LOGGED", {"test_out": test_out[:200], "test_name": self.test_name})
            else:
                self.print_dashboard(tasks_status, active_op="Build anomalies encountered. Deploying self-healing repair module...", constraining_profile=constraining_profile)
                log_action("SUPERVISOR", "BUILD_ERRORS_DETECTED", {"trace_snippet": test_out[:120], "project_name": self.project_name})
                
                fix_prompt = f"project:{self.project_name} | The generated files returned compilation errors:\n{test_out}\nIdentify and repair the specific broken code lines."
                run_agent_pipeline(
                    user_prompt=fix_prompt, 
                    tier="HIGH", 
                    target_workspace=self.active_workspace,
                    mode_override=mode_override,
                    profile_override=profile_level,
                    constraining_profile_override=constraining_profile,
                    project_name=self.project_name,
                    test_name=self.test_name
                )

        # Phase 5: Staging-to-Production Sync Merges
        if self.isolate and os.path.exists(self.active_workspace):
            self.print_dashboard(tasks_status, active_op="Merging verified staging workspace to target production path...", constraining_profile=constraining_profile)
            try:
                for item in os.listdir(self.active_workspace):
                    source_item = os.path.join(self.active_workspace, item)
                    dest_item = os.path.join(self.target_destination, item)
                    
                    if os.path.isdir(source_item):
                        shutil.copytree(source_item, dest_item, dirs_exist_ok=True)
                    else:
                        shutil.copy2(source_item, dest_item)
                        
                shutil.rmtree(self.active_workspace, ignore_errors=True)
                log_action("SUPERVISOR", "STAGING_MERGE_SUCCESS", {"destination": self.target_destination, "project_name": self.project_name})
            except Exception as e:
                log_action("SUPERVISOR", "STAGING_MERGE_FAILED", {"error": str(e), "project_name": self.project_name})

        # Automatic Post-Build Memory Book Defragmentation
        self.print_dashboard(tasks_status, active_op="Consolidating and defragmenting knowledge base book volumes...", constraining_profile=constraining_profile)
        try:
            defragment_and_consolidate_books()
        except Exception as e:
            log_action("SUPERVISOR", "DEFRAG_POST_BUILD_EXCEPTION", {"error": str(e), "project_name": self.project_name})

        self.print_dashboard(tasks_status, active_op=f"Build cycle complete! Core layers stored safely inside: {self.target_destination}", constraining_profile=constraining_profile)
        log_action("SUPERVISOR", "CYCLE_COMPLETE", {"workspace": self.target_destination, "project_name": self.project_name})

    # Backward compatibility alias
    execute_build_directive = process_complete_development_cycle


def generate_preflight_blueprint(
    goal: str,
    target_dir: str = "/tmp",
    project_name: str = None,
    execution_mode: str = "AUTO_DETECT",
    orchestrator_model: str = None,
    worker_models: list = None,
    max_models_used: int = None,
    routing_strategy: str = "ROUND_ROBIN",
    preferred_key_id: str = None,
    use_existing_context: bool = True
) -> dict:
    """
    Stage 15.2 Pre-Flight Blueprint Generator:
    Scans the target workspace to detect existing files, decomposes the master goal
    into discrete file tasks with action flags (CREATE vs. MODIFY), agent assignments,
    and token cost estimates WITHOUT executing or modifying any project files.
    """
    from src.agent import auto_detect_execution_plan, run_agent_pipeline, governor
    from src.config import normalize_wsl_path, classify_task_to_sleek_role

    norm_target_dir = normalize_wsl_path(target_dir)
    proj_name = project_name or os.path.basename(norm_target_dir.rstrip("/")) or "default_project"

    # Scan existing files
    existing_files = []
    ignored_dirs = {".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".staging_temp"}
    if os.path.exists(norm_target_dir):
        for root, dirs, files in os.walk(norm_target_dir):
            dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith(".")]
            for f in sorted(files):
                full_p = os.path.join(root, f)
                rel_p = os.path.relpath(full_p, norm_target_dir).replace(chr(92), "/")
                existing_files.append(rel_p)

    existing_set = set(existing_files)
    historical_context = ""
    if use_existing_context and existing_files:
        sample_files = existing_files[:30]
        historical_context = f"\nExisting Project Workspace Files:\n" + "\n".join(sample_files)

    active_swarm_cfg = _load_active_swarm_config()
    orch_model = orchestrator_model or active_swarm_cfg.get("orchestrator_engine") or "gemini-3.6-flash"
    roster = worker_models or active_swarm_cfg.get("worker_models") or ["gemini-2.5-flash", "qwen2.5-coder:7b"]
    limit_n = max(1, min(len(roster), int(max_models_used or active_swarm_cfg.get("max_models_used") or len(roster))))
    active_roster = roster[:limit_n]
    active_strategy = routing_strategy or active_swarm_cfg.get("routing_strategy", "ROUND_ROBIN")
    active_pref_key = preferred_key_id or active_swarm_cfg.get("preferred_key_id", "AUTO")

    planning_prompt = f"""Decompose this software development goal into discrete, file-specific task directives.
Assign exactly one specific target relative filename per task line (e.g., 'src/auth.py: Implement JWT authentication').
Group setup/configuration files first, followed by specialized business modules.{historical_context}
Output simple directives (one per line). Do NOT write bullets or numbers.

Goal: {goal}"""

    try:
        raw_output = run_agent_pipeline(
            user_prompt=f"project:{proj_name} | {planning_prompt}",
            tier="FAST",
            target_workspace=norm_target_dir,
            mode_override=execution_mode if execution_mode != "AUTO_DETECT" else "HYBRID_CLOUD",
            profile_override="BASIC",
            project_name=proj_name,
            explicit_model=orch_model,
            fallback_models=active_roster,
            preferred_key_id=active_pref_key
        )
    except Exception:
        raw_output = goal

    raw_lines = [l.strip() for l in (raw_output or "").splitlines() if l.strip() and not l.startswith("=") and not l.startswith("#")]
    raw_lines = [l for l in raw_lines if not l.lower().startswith("here is") and not l.lower().startswith("here are")]
    if not raw_lines:
        raw_lines = [goal]

    tasks = []
    total_est_tokens = 0

    for idx, line in enumerate(raw_lines):
        detected = re.findall(r'[\w\-./]+\.[a-zA-Z0-9]+', line)
        if detected:
            rel_file_path = detected[0].strip('`"\'').lstrip("/")
        else:
            lower = line.lower()
            if any(k in lower for k in ["package.json", "npm"]):
                rel_file_path = "package.json"
            elif any(k in lower for k in ["requirements.txt", "pip"]):
                rel_file_path = "requirements.txt"
            elif "docker" in lower:
                rel_file_path = "Dockerfile"
            elif "readme" in lower:
                rel_file_path = "README.md"
            else:
                rel_file_path = f"src/task_{idx+1}.py"

        action = "MODIFY" if rel_file_path in existing_set else "CREATE"
        plan = auto_detect_execution_plan(line, project_name=proj_name)
        role_info = classify_task_to_sleek_role(line, rel_file_path)
        sleek_role = role_info["role"]
        assigned_model = active_roster[idx % len(active_roster)]
        provider_name = governor.resolve_provider(assigned_model)
        est_in = 800 + (len(line) * 2)
        est_out = 1200
        total_est_tokens += (est_in + est_out)

        tasks.append({
            "task_id": f"task_{idx+1}",
            "target_file": rel_file_path,
            "action": action,
            "assigned_agent": sleek_role,
            "sleek_role": sleek_role,
            "role_cost_type": role_info.get("cost_type", "Cloud Free"),
            "assigned_model": assigned_model,
            "provider": provider_name,
            "target_tier": role_info.get("target_tier", plan["target_tier"]),
            "directive": line,
            "estimated_input_tokens": est_in,
            "estimated_output_tokens": est_out,
            "selected": True
        })

    blueprint = {
        "blueprint_id": f"bp_{int(time.time())}",
        "project_name": proj_name,
        "target_dir": norm_target_dir,
        "goal": goal,
        "orchestrator_model": orch_model,
        "worker_models": active_roster,
        "max_models_used": limit_n,
        "routing_strategy": active_strategy,
        "preferred_key_id": active_pref_key,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S IST"),
        "existing_files_detected": len(existing_files),
        "estimated_total_tokens": total_est_tokens,
        "tasks": tasks
    }

    try:
        mem_dir = os.path.abspath("./.agent_memory")
        os.makedirs(mem_dir, exist_ok=True)
        preview_path = os.path.join(mem_dir, "blueprint_preview.json")
        with open(preview_path, "w", encoding="utf-8") as f:
            json.dump(blueprint, f, indent=4)
    except Exception:
        pass

    return blueprint


def execute_approved_blueprint(
    tasks: list,
    target_destination: str,
    project_name: str = None,
    goal: str = "Approved Blueprint Execution",
    max_workers: int = 8,
    execution_mode: str = "HYBRID_CLOUD",
    research_profile: str = "BASIC",
    model_profile: str = "HIGH_RPM_TPM",
    isolate: bool = False,
    orchestrator_model: Optional[str] = None,
    worker_models: Optional[List[str]] = None,
    max_models_used: Optional[int] = None,
    routing_strategy: str = "ROUND_ROBIN",
    preferred_key_id: Optional[str] = None
) -> dict:
    """
    Stage 15.2 Approved Blueprint Execution:
    Executes a pre-screened list of selected file tasks in the workspace.
    For MODIFY actions on existing files, injects existing code into directives.
    Continuously monitors lifecycle stop/pause signals and updates swarm registry.
    """
    from src.config import normalize_wsl_path, classify_task_to_sleek_role
    from src.token_governor import token_governor

    norm_dest = normalize_wsl_path(target_destination)
    proj_name = project_name or os.path.basename(norm_dest.rstrip("/")) or "default_project"

    active_swarm_cfg = _load_active_swarm_config()
    orch = orchestrator_model or active_swarm_cfg.get("orchestrator_engine") or "gemini-3.6-flash"
    roster = worker_models or active_swarm_cfg.get("worker_models") or ["gemini-2.5-flash", "qwen2.5-coder:7b"]
    limit_n = max(1, min(len(roster), int(max_models_used or active_swarm_cfg.get("max_models_used") or len(roster))))
    active_roster = roster[:limit_n]

    supervisor = ProjectSupervisor(
        target_destination=norm_dest,
        isolate=isolate,
        max_workers=max_workers,
        project_name=proj_name
    )
    supervisor.active_orchestrator = orch
    supervisor.active_worker_models = active_roster
    supervisor.worker_assignments = {}

    try:
        with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
            reg_d = json.load(f)
        reg_d["active_orchestrator"] = orch
        reg_d["active_worker_models"] = active_roster
        with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
            json.dump(reg_d, f, indent=4)
    except Exception:
        pass

    reset_build_lifecycle()
    try:
        token_governor.reset_build_counter(proj_name)
    except Exception:
        pass

    selected_tasks = [t for t in tasks if t.get("selected", True)]
    tasks_status = {}
    completed_files = []

    try:
        prep_kw = ["delete", "remove", "clean", "package.json", "requirements.txt", "init", "config", "dockerfile"]
        prep_tasks = []
        coding_tasks = []

        for t in selected_tasks:
            t_file = t.get("target_file", "")
            t_dir = t.get("directive", "")
            if any(kw in t_file.lower() or kw in t_dir.lower() for kw in prep_kw):
                prep_tasks.append(t)
            else:
                coding_tasks.append(t)

        for t in selected_tasks:
            if t.get("action") == "MODIFY":
                full_f = os.path.normpath(os.path.join(supervisor.active_workspace, t.get("target_file", "")))
                if os.path.exists(full_f):
                    try:
                        with open(full_f, "r", encoding="utf-8", errors="replace") as ef:
                            existing_code = ef.read()[:6000]
                        t["directive"] = (
                            f"{t.get('directive', '')}\n\n"
                            f"--- EXISTING FILE CONTENT TO UPDATE/EXTEND ({t.get('target_file')}) ---\n"
                            f"{existing_code}\n"
                            f"--- END EXISTING FILE CONTENT ---\n"
                            f"Preserve existing functions while implementing the required updates."
                        )
                    except Exception:
                        pass

        for idx, pt in enumerate(prep_tasks):
            if not check_build_lifecycle():
                break
            task_key = f"prep_{idx}"
            task_desc = f"{pt.get('target_file')}: {pt.get('directive')}"
            tasks_status[task_key] = {"agent_role": "Boilerplate", "description": task_desc, "status": "RUNNING"}
            supervisor.print_dashboard(tasks_status, active_op=f"Executing blueprint setup: {pt.get('target_file')}")
            
            run_agent_pipeline(
                user_prompt=f"project:{proj_name} | {task_desc}",
                tier=pt.get("target_tier", "FAST"),
                target_workspace=supervisor.active_workspace,
                mode_override=execution_mode,
                profile_override=research_profile,
                constraining_profile_override=model_profile,
                project_name=proj_name
            )
            tasks_status[task_key]["status"] = "DONE"
            completed_files.append(pt.get("target_file"))

        if check_build_lifecycle() and coding_tasks:
            workers_count = min(len(coding_tasks), supervisor.max_workers)
            workers_count = max(1, workers_count)
            supervisor.print_dashboard(tasks_status, active_op=f"Running blueprint swarm on {len(coding_tasks)} tasks with {workers_count} workers...")

            with concurrent.futures.ThreadPoolExecutor(max_workers=workers_count) as executor:
                futures = []
                for idx, ct in enumerate(coding_tasks):
                    if not check_build_lifecycle():
                        break
                    t_id = idx + 1
                    t_desc = f"{ct.get('target_file')}: {ct.get('directive')}"
                    assigned_model = ct.get("assigned_model") or active_roster[idx % len(active_roster)]
                    fut = executor.submit(
                        supervisor.run_sub_agent_worker,
                        t_id, t_desc, tasks_status, execution_mode, research_profile, model_profile,
                        explicit_model=assigned_model, fallback_models=active_roster, preferred_key_id=preferred_key_id
                    )
                    futures.append((fut, ct.get("target_file")))
                    time.sleep(0.1)

                for fut, f_name in futures:
                    try:
                        fut.result()
                        completed_files.append(f_name)
                    except Exception:
                        pass

        if supervisor.isolate and os.path.exists(supervisor.active_workspace):
            try:
                for item in os.listdir(supervisor.active_workspace):
                    s_item = os.path.join(supervisor.active_workspace, item)
                    d_item = os.path.join(supervisor.target_destination, item)
                    if os.path.isdir(s_item):
                        shutil.copytree(s_item, d_item, dirs_exist_ok=True)
                    else:
                        shutil.copy2(s_item, d_item)
                shutil.rmtree(supervisor.active_workspace, ignore_errors=True)
            except Exception:
                pass

        final_status = "CANCELLED" if build_cancel_event.is_set() else "COMPLETED"
        try:
            with open(SWARM_REGISTRY_FILE, "r", encoding="utf-8") as f:
                reg = json.load(f)
            reg["status"] = final_status
            reg["domain_locks"] = {}
            with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
                json.dump(reg, f, indent=4)
        except Exception:
            pass

        return {
            "status": final_status,
            "project_name": proj_name,
            "target_dir": norm_dest,
            "total_tasks": len(selected_tasks),
            "completed_tasks": len(completed_files),
            "completed_files": completed_files
        }

    except Exception as exc:
        log_action("SUPERVISOR", "BLUEPRINT_EXEC_FAILED", {"error": str(exc), "project": proj_name})
        return {
            "status": "FAILED",
            "error": str(exc),
            "project_name": proj_name,
            "target_dir": norm_dest
        }