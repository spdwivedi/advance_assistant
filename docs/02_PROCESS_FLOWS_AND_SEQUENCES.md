# ADVANCE ASSISTANT OS v6.0
## TECHNICAL SPECIFICATION 02: CORE OPERATIONAL PROCESS FLOWS & SEQUENCES

---

## 1. Process Flow 1: End-to-End Autonomous Project Build

### 1.1 Overview & Architectural Progression
An autonomous software build executes through 5 distinct sequential and parallel phases orchestrated by `src/supervisor.py`:
- **Phase 0: Master Orchestrator Decomposition**: The architectural model analyzes the prompt, inspects target workspace structure, and constructs a dependency graph of files to create and modify.
- **Phase 1: Sequential Scaffolding**: Critical infrastructure files (`package.json`, `requirements.txt`, core configurations) are created sequentially to establish the foundation.
- **Phase 2: Multi-Model Parallel Swarm Execution**: Worker threads execute concurrent file implementations using domain-specific file locking and staggered dispatching.
- **Phase 3: Verification & Automated Self-Healing**: Lints, static analysis, and syntax checkers execute against created files; errors trigger self-healing prompt rounds.
- **Phase 4: Memory Book Consolidation**: Key learnings, architectural blueprints, and recipes generated during the build are indexed into `.agent_memory/books/`.

### 1.2 Mermaid Sequence Diagram: Autonomous Project Build

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer / Frontend
    participant Server as FastAPI Server (src/server.py)
    participant Sup as Supervisor (src/supervisor.py)
    participant Lock as Domain Locker (domain_locks)
    participant Agent as Agent Pipeline (src/agent.py)
    participant Gov as Token Governor (src/token_governor.py)
    participant Provider as Model Provider (Google / Groq / Ollama)
    participant FS as Target Workspace FS

    User->>Server: POST /api/execute { prompt, workspace_path, swarm_overrides }
    Server->>Server: Validate workspace & Normalize WSL path
    Server->>Sup: Start Async Build Thread (process_complete_development_cycle)
    Server-->>User: 200 OK { status: "STARTED", build_id }

    Note over Sup: Phase 0: Master Orchestrator Decomposition
    Sup->>Agent: Run Master Orchestrator (orchestrator_engine)
    Agent->>Gov: acquire_lease(prompt, orch_model)
    Gov-->>Agent: Lease Granted (lease_id)
    Agent->>Provider: Generate Project Blueprint & File Dependency List
    Provider-->>Agent: Decomposition Plan (JSON)
    Agent->>Gov: commit_lease(lease_id, actual_usage)
    Agent-->>Sup: Validated File Plan (scaffold_files, swarm_files)

    Note over Sup: Phase 1: Sequential Scaffolding
    loop For each scaffold file (package.json, config, etc.)
        Sup->>Agent: Implement Scaffold File
        Agent->>Provider: Generate Scaffold Content
        Provider-->>Agent: Code Content
        Agent->>FS: Atomic Write File
    end

    Note over Sup: Phase 2: Multi-Model Parallel Swarm Execution
    Sup->>Sup: Slice active worker models (active_roster = worker_models[:max_models_used])
    Sup->>Sup: Spawn ThreadPoolExecutor(max_workers = max_concurrency_workers)
    
    par Worker Thread 1 (e.g., frontend/App.tsx -> gemini-2.5-flash)
        Sup->>Lock: Acquire Lock("frontend/App.tsx")
        Lock-->>Sup: Lock Granted
        Sup->>Sup: Sleep(0.15s * worker_index) [Staggered Delay]
        Sup->>Agent: execute_worker_file_task(file, model_1)
        Agent->>Gov: acquire_lease(prompt, model_1)
        Gov-->>Agent: Lease Granted (with 85% RPM/TPM check)
        Agent->>Provider: Stream / Generate Code
        Provider-->>Agent: Implementation Output
        Agent->>Gov: commit_lease(lease_id, actual_usage)
        Agent->>FS: Write File Content
        Sup->>Lock: Release Lock("frontend/App.tsx")
    and Worker Thread 2 (e.g., backend/server.py -> qwen2.5-coder:7b)
        Sup->>Lock: Acquire Lock("backend/server.py")
        Lock-->>Sup: Lock Granted
        Sup->>Sup: Sleep(0.15s * worker_index)
        Sup->>Agent: execute_worker_file_task(file, model_2)
        Agent->>Gov: acquire_lease(prompt, model_2)
        Gov-->>Agent: Lease Granted
        Agent->>Provider: Generate Code
        Provider-->>Agent: Implementation Output
        Agent->>Gov: commit_lease(lease_id, actual_usage)
        Agent->>FS: Write File Content
        Sup->>Lock: Release Lock("backend/server.py")
    end

    Note over Sup: Phase 3: Verification & Self-Healing
    Sup->>FS: Scan files for syntax / imports
    opt Syntax or Lint Error Detected
        Sup->>Agent: Run Self-Healing Repair Round
        Agent->>Provider: Fix Syntax / Error
        Provider-->>Agent: Repaired Code
        Agent->>FS: Overwrite Repaired File
    end

    Note over Sup: Phase 4: Memory Book Consolidation
    Sup->>FS: Consolidate build notes & code patterns
    Sup->>Server: Update execution_state to "COMPLETED"
    Server-->>User: WebSocket Broadcast: Build Completed Successfully
```

### 1.3 Mermaid Flowchart: Phase Progression & Domain Locks

```mermaid
flowchart TD
    Start([User Initiates POST /api/execute]) --> Init[Validate & Normalize Workspace Path]
    Init --> Staging[Initialize Staging Isolation & Backup]
    Staging --> Phase0[Phase 0: Master Orchestrator Decomposition]

    Phase0 --> CheckPlan{Valid JSON Blueprint?}
    CheckPlan -- No --> RetryOrch[Re-prompt Orchestrator with Schema Error]
    RetryOrch --> Phase0
    CheckPlan -- Yes --> Phase1[Phase 1: Sequential Base Scaffolding]

    Phase1 --> ScaffFiles[Write package.json, requirements.txt, tsconfig.json]
    ScaffFiles --> Phase2[Phase 2: Multi-Model Parallel Swarm Execution]

    subgraph SwarmExecution ["Phase 2 Swarm Concurrency"]
        SliceRoster[Slice Worker Roster by max_models_used] --> ThreadPool[Initialize ThreadPoolExecutor]
        ThreadPool --> WorkerLoop{For each pending file in plan}
        WorkerLoop --> AssignModel[Round-Robin or Quota-Weighted Model Assignment]
        AssignModel --> StaggerDelay[Inject Staggered Delay: worker_id * 0.15s]
        StaggerDelay --> AcquireLock[Acquire Domain File Lock: domain_locks[path]]
        AcquireLock --> PreFlight[Token Governor: acquire_lease & 85% Rate Check]
        PreFlight --> CallModel[Model Provider Execution: Google / Groq / Ollama]
        CallModel --> PostFlight[Token Governor: commit_lease & Usage Update]
        PostFlight --> WriteDisk[Atomic File Write & Path Verify]
        WriteDisk --> ReleaseLock[Release Domain File Lock]
    end

    Phase2 --> SwarmExecution
    SwarmExecution --> Phase3[Phase 3: Automated Verification & Self-Healing]

    Phase3 --> LintCheck{Syntax / AST / Lint Clean?}
    LintCheck -- Errors Found --> HealingRound[Phase 3.1: Targeted Self-Healing with Error Trace]
    HealingRound --> LintCheck
    LintCheck -- All Clean --> Phase4[Phase 4: Knowledge Consolidation]

    Phase4 --> IndexMem[Index Build Learnings into .agent_memory/books/]
    IndexMem --> Finish([Build Lifecycle: COMPLETED])
```

---

## 2. Process Flow 2: Continuous Iterative Pre-Flight Blueprint & Approval Gate

### 2.1 Overview & Safety Gate Mechanics
The Iterative Blueprint workflow allows developers to preview, inspect, edit, and approve individual file implementation directives *before* any worker code generation begins:
1. `POST /api/blueprint/preview` scans target workspace files and decomposes the prompt into tasks.
2. The engine automatically differentiates between `CREATE` (new files) and `MODIFY` (existing files).
3. For `MODIFY` tasks, existing file contents (up to 6,000 characters) are extracted and injected into the task context.
4. The user can modify task directives, change the target file path, or re-assign specific models from the catalog.
5. `POST /api/blueprint/execute` consumes the approved blueprint and executes only the selected tasks.

### 2.2 Mermaid Sequence Diagram: Blueprint Preview & Approval

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer (Tab 2: Iterative Blueprint)
    participant Server as FastAPI Server (src/server.py)
    participant Sup as Supervisor (src/supervisor.py)
    participant FS as Workspace Filesystem
    participant Agent as Agent Pipeline (src/agent.py)

    User->>Server: POST /api/blueprint/preview { prompt, workspace_path, worker_models, preferred_key_id }
    Server->>Sup: generate_preflight_blueprint(prompt, workspace_path, ...)
    Sup->>FS: Scan existing files (workspace_files = list_files(root))
    Sup->>Agent: Prompt Orchestrator for Structured Task Decomposition
    Agent-->>Sup: Raw Task Decomposition (file_path, action, description)

    loop For each task in decomposition
        alt File already exists in workspace
            Sup->>Sup: Mark action = "MODIFY"
            Sup->>FS: Read existing file content (up to 6,000 chars)
            Sup->>Sup: Attach existing_content_snippet to task
        else File does not exist
            Sup->>Sup: Mark action = "CREATE"
        end
        Sup->>Sup: Assign worker model from active worker_models roster
    end

    Sup->>FS: Cache blueprint in .agent_memory/blueprint_preview.json
    Sup-->>Server: Blueprint Object { blueprint_id, tasks: [...] }
    Server-->>User: 200 OK { blueprint_id, tasks, total_tasks }

    Note over User: Developer Reviews, Edits Directives & Reassigns Models in UI

    User->>Server: POST /api/blueprint/execute { blueprint_id, approved_tasks: [...] }
    Server->>Sup: execute_approved_blueprint(approved_tasks, workspace_path)
    Sup->>Sup: Execute Parallel Swarm for Approved Tasks Only
    Sup-->>Server: Build Completed
    Server-->>User: 200 OK { status: "EXECUTED", completed_tasks }
```

---

## 3. Process Flow 3: Build Lifecycle Control State Machine

### 3.1 Lifecycle States & Synchronization Events
Advance Assistant OS manages long-running builds using cooperative thread-safe events in `src/server.py` and `src/supervisor.py`:
- `build_pause_event = threading.Event()`: Set by default (`True`). Clearing it (`pause_event.clear()`) causes worker threads to pause immediately before acquiring leases. Setting it (`pause_event.set()`) resumes execution.
- `build_cancel_event = threading.Event()`: Cleared by default (`False`). Setting it (`cancel_event.set()`) instructs all active worker threads and supervisors to abort execution cleanly and release locks.

### 3.2 State Transition Diagram (Mermaid `stateDiagram-v2`)

```mermaid
stateDiagram-v2
    [*] --> IDLE : System Initialized

    IDLE --> RUNNING : POST /api/execute or /api/blueprint/execute
    
    state RUNNING {
        [*] --> Phase0_Orchestration
        Phase0_Orchestration --> Phase1_Scaffolding : Decomposition Complete
        Phase1_Scaffolding --> Phase2_SwarmExecution : Base Files Written
        Phase2_SwarmExecution --> Phase3_Verification : Workers Complete
        Phase3_Verification --> Phase4_MemoryConsolidation : Tests Pass
        Phase4_MemoryConsolidation --> [*] : Build Finalized
    }

    RUNNING --> PAUSED : POST /api/execute/pause
(build_pause_event.clear())
    PAUSED --> RUNNING : POST /api/execute/resume
(build_pause_event.set())

    RUNNING --> CANCELLED : POST /api/execute/stop
(build_cancel_event.set())
    PAUSED --> CANCELLED : POST /api/execute/stop
(build_cancel_event.set())

    RUNNING --> COMPLETED : All Phases Complete (Exit Code 0)
    RUNNING --> FAILED : Fatal Error / Unrecoverable Exception

    COMPLETED --> IDLE : Reset / Ready for New Project
    CANCELLED --> IDLE : Cleanup Staging & Reset Events
    FAILED --> IDLE : Reset / Error Logged
```

---

## 4. Process Flow 4: Two-Phase Atomic Lease & Multi-Key Failover Sequence

### 4.1 Failover & Rate Limiting Mechanics
When an agent thread attempts an API call:
1. `key_manager.resolve_key_context()` selects the best key:
   - Evaluates `preferred_key_id` if specified by the user.
   - Verifies key status is `ACTIVE` and cooldown timestamp has expired.
   - Enforces `paid_tier_locked` financial shield.
   - Applies the active routing policy (`FREE_POOL`, `BALANCED`, `ROUND_ROBIN`, `PINNED`).
2. `token_governor.acquire_lease()` checks the key's 60-second sliding window and reserves worst-case capacity.
3. If an upstream 429 occurs, `key_manager.mark_key_cooldown()` puts the key into a temporary cooldown (e.g. 60s) and rotates to the next available key or falls back to local models.

### 4.2 Mermaid Sequence Diagram: Lease Acquisition, Execution & Failover

```mermaid
sequenceDiagram
    autonumber
    participant Thread as Worker Thread (Agent)
    participant KM as Key Manager (src/key_manager.py)
    participant Gov as Token Governor (src/token_governor.py)
    participant CloudPrimary as Cloud API (Key #1)
    participant CloudBackup as Cloud API (Key #2)

    Thread->>KM: resolve_key_context(provider="GOOGLE", preferred_key_id=null)
    KM->>KM: Check Key #1: status=ACTIVE, cooldown_until=0, paid_shield=OK
    KM-->>Thread: KeyContext { key_id: "key_001", key: "AIzaSy...", tier: "FREE" }

    Thread->>Gov: acquire_lease(prompt, model="gemini-2.5-flash", key_id="key_001")
    Gov->>Gov: Calculate T_reserved = T_est_in + T_max_out
    Gov->>Gov: Verify 60s Window: RPM_eff < 12 and TPM_eff <= 212,500
    Gov->>Gov: Increment in_flight_leases["GOOGLE:FREE:key_001:gemini-2.5-flash"]
    Gov-->>Thread: Lease Granted { lease_id: "lease_9942", pace_sec: 2.5 }

    Thread->>Thread: sleep(2.5) [Staggered Pacing Delay]
    Thread->>CloudPrimary: POST /v1beta/models/gemini-2.5-flash:generateContent (using Key #1)
    
    alt Primary Key Throws HTTP 429 RESOURCE_EXHAUSTED
        CloudPrimary-->>Thread: HTTP 429 Quota Exceeded
        Thread->>KM: mark_key_cooldown("key_001", cooldown_sec=60)
        KM->>KM: Set key_001.status = "EXHAUSTED", cooldown_until = now + 60s
        Thread->>Gov: release_lease("lease_9942") [Cancel Speculative Lease]

        Note over Thread: Failover to Next Available Key in Pool
        Thread->>KM: resolve_key_context(provider="GOOGLE")
        KM->>KM: Key #1 in cooldown -> Rotate to Key #2
        KM-->>Thread: KeyContext { key_id: "key_002", key: "AIzaSyKey2...", tier: "FREE" }
        Thread->>Gov: acquire_lease(prompt, model="gemini-2.5-flash", key_id="key_002")
        Gov-->>Thread: Lease Granted { lease_id: "lease_9943", pace_sec: 0.0 }
        Thread->>CloudBackup: POST /v1beta/models/gemini-2.5-flash:generateContent (using Key #2)
        CloudBackup-->>Thread: HTTP 200 OK { candidates: [...], usage_metadata }
        Thread->>Gov: commit_lease("lease_9943", actual_usage)
        Gov->>Gov: Reconcile exact tokens & update 60s sliding window
    else Primary Call Succeeds
        CloudPrimary-->>Thread: HTTP 200 OK { candidates: [...], usage_metadata }
        Thread->>Gov: commit_lease("lease_9942", actual_usage)
        Gov->>Gov: Reconcile exact tokens & update 60s sliding window
    end
```

---

## 5. Process Flow 5: Live & Offline Model Synchronization Pipeline

### 5.1 Overview & Upstream Inspection
Triggered via `POST /api/governor/sync-models`, this pipeline queries all physical providers and local directories to build a unified catalog with mathematical 85% caps.

### 5.2 Mermaid Flowchart: Model Sync Pipeline

```mermaid
flowchart TD
    Trigger([Trigger: POST /api/governor/sync-models]) --> ParallelSync[Initiate Multi-Source Discovery]

    subgraph DiscoverySources ["Model Discovery Sources"]
        ParallelSync --> GoogleAPI[Query Google AI Studio:
GET /v1beta/models]
        ParallelSync --> GroqAPI[Query Groq Cloud LPU:
GET /v1/models]
        ParallelSync --> OllamaDaemon[Query Local Ollama Daemon:
GET /api/tags]
        ParallelSync --> LocalMatrix[Query Offline Test Matrix:
Ollama_Models_Testing]
    end

    GoogleAPI --> ParseGoogle[Filter active Gemini 2.x/3.x models
Extract RPM / TPM / RPD / Context Window]
    GroqAPI --> ParseGroq[Filter active LPU coding models
Extract 30 RPM / 6K TPM baseline]
    OllamaDaemon --> ParseOllama[Parse 76 local installed GGUF models
Match tags with capability benchmarks]
    LocalMatrix --> ParseMatrix[Attach VRAM requirement matrices
Attach coding benchmark scores]

    ParseGoogle --> Aggregate[Aggregate Raw Model Definitions]
    ParseGroq --> Aggregate
    ParseOllama --> Aggregate
    ParseMatrix --> Aggregate

    Aggregate --> Apply85[Apply compute_working_limits(strict_limits, margin=85%)]
    Apply85 --> CalcLimits[Compute:
RPM * 0.85
TPM * 0.85
RPD * 0.85
MaxInput * 0.85
MaxOutput * 0.85]
    CalcLimits --> SaveQuotas[Atomic Persist to .agent_memory/provider_quotas.json]
    SaveQuotas --> EmitToast[Return JSON Summary:
19 Google Free, 49 Google Paid,
4 Groq, 76 Local Ollama Models]
```

---

## 6. Process Flow 6: Precision Context Retrieval & Book Defragmentation

### 6.1 Context Extraction & Packing
1. The developer prompt is analyzed for tokens and programming language signatures.
2. The Memory Manager reads `.agent_memory/books/**/*.md` and extracts all `##` and `###` recipes.
3. Each recipe is scored using $S(q, s) = 3.0 \cdot 	ext{Match}_{	ext{heading}} + 2.5 \cdot 	ext{Match}_{	ext{cat}} + 1.0 \cdot 	ext{Match}_{	ext{body}} + 1.5 \cdot \mathbb{I}_{	ext{code}}$.
4. High-scoring recipes are packed into the target model's budget tier (e.g. 1,200 tokens for 7B models).
5. The compiled memory snippet block is prepended to the system prompt.

### 6.2 Flowchart: Precision Memory Lifecycle

```mermaid
flowchart TD
    Prompt[Developer Prompt] --> Tokenize[Tokenize & Extract Word Stems]
    BookDir[.agent_memory/books/**/*.md] --> ParseBooks[Parse into Discrete Sections by ## and ### Headings]
    ParseBooks --> SectionPool[Section Pool: Heading, Category, Body, Code]

    Tokenize --> ScoreEngine[Relevance Scoring Engine]
    SectionPool --> ScoreEngine

    ScoreEngine --> CalcScore["Compute S(q, s) = 3.0*Head + 2.5*Cat + 1.0*Body + 1.5*Code"]
    CalcScore --> SortRank[Sort Sections in Descending Score Order]
    SortRank --> Knapsack[Knapsack Token Budget Packing]

    ModelTier{Target Model Tier}
    ModelTier -- 1.5B Model --> Cap600[Budget Cap: 600 Tokens]
    ModelTier -- 7B/14B Model --> Cap1200[Budget Cap: 1,200 Tokens]
    ModelTier -- 32B Model --> Cap2000[Budget Cap: 2,000 Tokens]
    ModelTier -- Cloud Pro/Flash --> Cap3500[Budget Cap: 3,500 Tokens]

    Cap600 --> PackLoop[Iteratively Append Snippets until Budget Reached]
    Cap1200 --> PackLoop
    Cap2000 --> PackLoop
    Cap3500 --> PackLoop
    Knapsack --> PackLoop

    PackLoop --> CompiledContext[Compiled Markdown Memory Context Block]
    CompiledContext --> SystemPrompt[Inject into Agent System Prompt]
```

---

## 7. Process Flow 7: Real-Time Dual WebSocket Telemetry & 6-Stream Log Tailing

### 7.1 Twin WebSocket Architecture
- **`/ws/telemetry` (1.0 Hz Push)**: Emits a comprehensive JSON frame containing execution state, active swarm profile, worker assignments, provider quotas, key pool metrics, token ledger accumulators, and cloud cost calculations.
- **`/ws/logs` (Event-Driven Tail Stream)**: Broadcasts multi-stream log entries in real-time as they are written to disk, filtering by category (`supervisor`, `gatekeeper`, `governor`, `router`, etc.) or specific model logs.

### 7.2 Mermaid Sequence Diagram: WebSocket Streaming

```mermaid
sequenceDiagram
    autonumber
    participant UI as React UI (Dashboard / Log Center)
    participant WST as WebSocket /ws/telemetry
    participant WSL as WebSocket /ws/logs
    participant Server as FastAPI Server Engine
    participant LogFiles as Multi-Stream Logs (logs/**/*.log)

    UI->>WST: Connect WebSocket ws://localhost:8000/ws/telemetry
    WST-->>UI: Connection Established

    UI->>WSL: Connect WebSocket ws://localhost:8000/ws/logs?category=all
    WSL-->>UI: Connection Established
    Server->>WSL: Emit initial_batch (Last 100 log lines from master_timeline.log)
    WSL-->>UI: Frame: { type: "initial_batch", logs: [...] }

    loop Every 1.0 Second (Background Telemetry Loop)
        Server->>Server: Snapshot System State (Governor, Swarm, Keys, Memory, Costs)
        Server->>WST: Send Telemetry Frame (JSON)
        WST-->>UI: Update Live Gauges, Worker Assignments, RPM/TPM Meters
    end

    par Real-Time Log File Monitor (Background Thread)
        LogFiles->>Server: New Log Line Written (e.g., [GOVERNOR] Lease granted...)
        Server->>WSL: Broadcast Log Entry
        WSL-->>UI: Stream into Virtualized Terminal Log Console
    end
```
