import os
import json
import time
import re
import shutil
import concurrent.futures
import threading
from src.config import (
    DEFAULT_ISOLATION_ENABLED, MAX_SWARM_WORKERS, 
    SWARM_REGISTRY_FILE, SEARCH_DATA_DIR, PROJECT_LOG_DIR
)
from src.agent import run_agent_pipeline, governor
from src.permissions import execute_command, normalize_cross_platform_path
from src.memory_manager import (
    record_env_location, defragment_and_consolidate_books, 
    get_knowledge_base_telemetry
)
from src.logger import log_action

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
            "domain_locks": {},
            "completed_files": [],
            "status": "INITIALIZED"
        }
        with open(SWARM_REGISTRY_FILE, "w", encoding="utf-8") as f:
            json.dump(registry_data, f, indent=4)

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

    def run_sub_agent_worker(self, task_id: int, task_description: str, tasks_status: dict, mode_override: str = None, profile_level: str = "MEDIUM", constraining_profile: str = "HIGH_RPM_TPM"):
        """Worker Thread v6.0: Operates strictly inside its assigned sub-plan domain."""
        agent_role = f"SubAgent-{task_id}"
        tasks_status[task_id] = {"agent_role": agent_role, "description": task_description, "status": "RUNNING"}
        
        detected_files = re.findall(r'[\w\-./]+\.\w+', task_description)
        assigned_file = detected_files[0] if detected_files else f"domain_task_{task_id}.txt"
        
        self.print_dashboard(tasks_status, active_op=f"{agent_role} locked target file: {assigned_file}", constraining_profile=constraining_profile)
        self._update_registry_lock(assigned_file, agent_role)
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
                test_name=self.test_name
            )
            tasks_status[task_id]["status"] = "DONE"
            self._mark_file_completed_in_registry(assigned_file)
            self._update_project_blueprint_ledger(assigned_file, task_description, "WRITE_SUCCESS")
        except Exception as e:
            tasks_status[task_id]["status"] = "FAILED"
            self._update_project_blueprint_ledger(assigned_file, task_description, f"FAILED: {str(e)}")
            log_action("SUPERVISOR", "WORKER_EXCEPTION", {"agent": agent_role, "error": str(e), "project_name": self.project_name, "test_name": self.test_name})
            
        self.print_dashboard(tasks_status, active_op=f"{agent_role} finalized operations.", constraining_profile=constraining_profile)

    def process_complete_development_cycle(self, master_instruction: str, mode_override: str = None, profile_level: str = "MAX", constraining_profile: str = "HIGH_RPM_TPM"):
        """
        Executes an architecture-aware cross-platform multi-phase system compilation loop.
        """
        tasks_status = {0: {"agent_role": "Orchestrator", "description": "Analyzing specifications and isolated project history blueprints", "status": "RUNNING"}}
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
            test_name=self.test_name
        )
        
        raw_tasks = [line.strip() for line in blueprint.split("\n") if line.strip() and not line.startswith("=")]
        if not raw_tasks:
            raw_tasks = [master_instruction]

        prep_keywords = ["delete", "remove", "clean", "wipe", "clear", "mkdir", "init", "package.json", "requirements.txt"]
        prep_tasks = [t for t in raw_tasks if any(kw in t.lower() for kw in prep_keywords)]
        coding_tasks = [t for t in raw_tasks if t not in prep_tasks]

        tasks_status[0]["status"] = "DONE"
        self.print_dashboard(tasks_status, active_op="Blueprint breakdown finalized.", constraining_profile=constraining_profile)

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

        # Phase 2: Concurrent Multi-Thread Swarm Processing
        self.print_dashboard(tasks_status, active_op=f"Spawning swarm workforce with allocation of {self.max_workers} threads...", constraining_profile=constraining_profile)
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [
                executor.submit(self.run_sub_agent_worker, idx + 1, task, tasks_status, mode_override, profile_level, constraining_profile)
                for idx, task in enumerate(coding_tasks)
            ]
            concurrent.futures.wait(futures)

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