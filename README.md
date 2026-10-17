# Advance Assistant OS (v6.0)

> **Production-Grade Autonomous Multi-Agent Software Engineering Swarm & Operating System**

Advance Assistant OS is an architecture-aware, self-governing autonomous engineering operating system designed for complex, cross-platform software development across **Linux (WSL2)** and **Windows native filesystems**.

The system pairs Google Gemini cloud foundation models (Pro, Flash, and Lite tiers) and Groq LPU models (`qwen-2.5-coder-32b`, `llama-3.3-70b-versatile`) with local Ollama open-weight models (`qwen2.5-coder:32b` for architectural planning and `qwen2.5-coder:7b` for high-speed code generation). It features autonomous task decomposition, multi-threaded sub-agent swarms with mutual-exclusion file locks, a **3-Level Hierarchical Token Governor (`Provider -> Tier -> Model`)**, two-phase atomic token leases, an 85% TPM Financial Shield with 1-click paid tier lock, continuous iterative workspace blueprints, real-time code inspection, self-healing code loops, dynamic markdown topic book memory defragmentation, multimodal UI auditing, external developer tool bridges (Aider, n8n, RooCode, Antigravity, MCP), and an 8-page minimalist progressive-disclosure web console.

---

## Key Features & Capabilities

### 1. Supervisor-Worker Multi-Threaded Swarm & Iterative Blueprinting
* **5-Phase Autonomous Build Pipeline**:
  * **Phase 0 (Decomposition & Iterative Blueprinting)**: High-tier reasoning engine decomposes high-level goals into isolated tasks mapped to specific target files, guided by historical project blueprint ledgers (`blueprint_ledger.json`).
  * **Phase 1 (Config & Boilerplate Setup)**: Deterministically initializes project scaffolding (`package.json`, `requirements.txt`, directory trees) in Fast Tier.
  * **Phase 2 (Concurrent Workforce Swarm)**: Dispatches independent coding modules across a `ThreadPoolExecutor` (allocating up to 16 concurrent sub-agent threads).
  * **Phase 3 & 4 (Shell QA & Self-Healing)**: Executes automated verification tests (`pytest`, `npm test`, `python3 -m unittest`). When anomalies or tracebacks are detected, self-healing loops analyze the failure and generate targeted code repairs.
  * **Phase 5 (Staging Sync & Consolidation)**: Safely merges isolated staging sandboxes (`.staging_temp`) into production paths and triggers automatic memory defragmentation.
* **Pre-Flight Dry-Run Blueprint Generator (`/api/blueprint/preview`)**: Generates structured file task lists with `CREATE` vs. `MODIFY` flags, target files, model/sub-agent assignments, and token estimates without touching disk.
* **Continuous Iterative Blueprint Execution (`/api/blueprint/execute`)**: Executes approved tasks in the background while keeping unselected tasks isolated.
* **Live Workspace File Inspector (`/api/workspace/file`)**: Reads source code files with line numbers and language detection, shielded by path traversal and sensitive file guards.
* **Build Stop, Pause & Resume Engine (`/api/execute/pause`, `/api/execute/stop`)**: Instant 1-click pause, resume, and cancellation of running swarms.
* **Workspace Staging Isolation**: Optional `.staging_temp` isolation guarantees zero direct writes to production roots until verification checks succeed.
* **Swarm Registry & Mutual Exclusion Locks**: Real-time domain locking prevents race conditions and concurrent sub-agent collisions on the same source files.

### 2. 3-Level Hierarchical Token Governor (`Provider -> Tier -> Model`)
* **Hierarchical Multi-Provider Matrix**: Native multi-provider data model (`.agent_memory/provider_quotas.json`) supporting `GOOGLE`, `GROQ`, `OLLAMA`, and dynamic custom providers (e.g. `ANTHROPIC`) across `FREE`, `PAID`, and `LOCAL` tiers.
* **Working Limits vs. Strict API Limits**: Configures operational safety margins (e.g., Google working limit = 4 RPM / 180K TPM vs. strict API limit = 5 RPM / 250K TPM) to prevent burst throttling.
* **Two-Phase Atomic Pre/Post Token Leases**:
  * `acquire_lease(model_name, estimated_tokens, priority)`: Pre-request reservation enforcing in-flight concurrency caps and staggered delay pacing (`delay_seconds = 60.0 / working_rpm`).
  * `commit_lease(lease_id, input_tokens, output_tokens, thinking_tokens)`: Post-request exact reconciliation updating discrete token counts into rolling 60s windows and `.agent_memory/token_ledger.json`.
  * `release_lease(lease_id)`: Instant rollback upon execution failure.
* **Paid Tier Financial Shield**:
  * 1-Click Paid Spend Lock (`paid_tier_locked`): Completely locks paid cloud models and routes all tasks to free keys or local models.
  * Per-Build Paid Token Cap (`per_build_paid_token_cap`, default 150K tokens) and Daily Paid Cap (`daily_paid_token_cap`, default 500K tokens).
  * 85% TPM Circuit Breaker: Trips when approaching 85% of tier limits, cascading to local Ollama instances.
* **Real-Time Cost & Cloud Savings Estimator (`/api/governor/cost-estimate`)**: Live USD and INR metrics tracking actual paid cloud spend against estimated cloud savings from Free and Local model execution ($0.00 cost).
* **Hardware Time Synchronization & Quota Reset Anchor**: Synchronizes WSL2 clocks with hardware time (`sudo -n hwclock -s`) and resets daily quotas at **1:30 PM IST** (matching the **Midnight Pacific Time 00:00 PT** reset boundary for Google AI Studio).

### 3. Multi-Provider API Key Manager & Routing Policies
* **Multi-Provider Key Matrix (`.agent_memory/api_keys.json`)**: Manages Google AI Studio and Groq API keys with live health checks, error cooldown tracking, and usage counts.
* **4 Dynamic Routing Policies**:
  * `GLOBAL_HYBRID`: Prioritizes free keys during warm-up; dynamically promotes to paid tier for complex architectural passes.
  * `FREE_POOL`: Strict quota confinement using zero billable tokens.
  * `PAID_POOL`: Maximizes parallelism and eliminates TPM bottlenecks during burst development cycles.
  * `SINGLE_PINNED`: Pins execution exclusively to an administrator-selected key ID.

### 4. State & Knowledge Base Management
* **Categorized Topic Books**: Hierarchical Markdown knowledge store in `.agent_memory/books/` spanning 9 core engineering categories: `coding`, `frameworks`, `tools`, `cloud`, `tech_stack`, `environment`, `history`, `cs_fundamentals`, and `design_patterns`.
* **Dynamic Catalog Indexing**: `catalog_index.json` maintains real-time index metadata, file sizes, and paths for rapid context retrieval.
* **Autonomous Book Defragmentation (`POST /api/memory/defrag`)**: Scans for micro-fragment notes (`domain_task_*.txt.md`, `temp_*.md`, files < 800 bytes), maps them to master topic books, appends consolidated entries, and unlinks fragments.
* **Precision Context Snippet Engine & Simulator (`/knowledge`)**: Splits books into discrete sections, scores them by TF/keyword heuristics, fits snippets to model token capacities (600 for 1.5B, 1200 for 7B, 2000 for 32B, 3500 for Gemini), delivering 85%+ token savings.

### 5. Local Model Inference & Dual-Tier Fallback
* **Local Orchestrator (`qwen2.5-coder:32b`)**: Handles complex architectural planning, schema matching, capability routing, and semantic delta evaluations.
* **Local Worker Bee (`qwen2.5-coder:7b`)**: Delivers fast, low-latency local code writes, boilerplate drafting, syntax verification, and targeted file repairs.
* **Pure Offline Mode**: Full capability to operate completely air-gapped without external cloud API access.

### 6. Cross-Platform Gatekeeper & Execution Security
* **Universal WSL Path Normalizer**: Translates Windows drive notation (`D:\Project_Files` or `D:/...`) to WSL mount points (`/mnt/d/...`) across all tools, routes, and tests.
* **Staging Isolation Guard**: Isolates active development and test suites from production directories and memory stores.
* **Command Execution Gatekeeper**: Intercepts high-risk shell commands (destructive deletion, infinite loops, unauthorized daemons).
* **Path Traversal Shield**: Blocks relative directory traversal (`../..`) and protects sensitive credential files (`api_keys.json`, `.env`, SSH keys).

### 7. Multimodal Vision, Voice & External Tool Bridges
* **Vision Engine**: Playwright headless Chromium viewport capture (1280x800) coupled with Gemini 2.5 Flash multimodal inspection for UI layout, border margin, and CSS auditing.
* **Voice Engine**: CUDA-accelerated `faster-whisper` (float16) with lazy-loaded weights to conserve VRAM, paired with `espeak-ng` text-to-speech feedback.
* **External Adapters**: Aider CLI, n8n Automation Webhook, RooCode / Cursor Directives, Antigravity Sandbox, and Model Context Protocol (MCP).

---

## System Architecture

```mermaid
flowchart TD
    User([User CLI / Web UI]) --> Gateway[FastAPI Web Bridge & CLI Gateway<br/>src/server.py & src/main.py]
    
    subgraph Core Orchestration
        Gateway --> Supervisor[ProjectSupervisor<br/>src/supervisor.py]
        Supervisor -->|Phase 0: Decompose & Blueprint| BlueprintEngine[Pre-Flight Blueprint Engine<br/>generate_preflight_blueprint]
        Supervisor -->|Phase 1: Config| AgentPipeline[run_agent_pipeline<br/>src/agent.py]
        Supervisor -->|Phase 2: Swarm Pool| SwarmExecutor[ThreadPoolExecutor<br/>Max 16 Workers]
        SwarmExecutor --> Worker[SubAgent Worker]
        Worker --> AgentPipeline
        Supervisor -->|Phase 3-4: QA & Heal| ShellExec[execute_command<br/>src/permissions.py]
        Supervisor -->|Phase 5: Sync| StagingMerge[Staging ➔ Production Sync]
    end

    subgraph Hierarchical Governance & Routing
        AgentPipeline --> Governor[Hierarchical Token Governor<br/>src/token_governor.py]
        Governor --> QuotaTree[.agent_memory/provider_quotas.json<br/>Provider ➔ Tier ➔ Model]
        Governor --> KeyMgr[Multi-Provider Key Manager<br/>src/key_manager.py]
        KeyMgr --> KeyMatrix[.agent_memory/api_keys.json<br/>GOOGLE, GROQ Matrix]
        Governor --> LeaseEngine[Two-Phase Atomic Lease Engine<br/>acquire_lease / commit_lease]
        Governor --> FinancialShield{Financial Shield Active?<br/>Paid Locked or >85% Cap}
        FinancialShield -->|Yes (Free / Local)| FreeOrLocal[Free Keys Pool / Local Ollama]
        FinancialShield -->|No (Permitted)| CloudProviders[Google Cloud / Groq LPU]
    end

    subgraph State & Knowledge Base
        AgentPipeline <--> MemoryMgr[MemoryManager<br/>src/memory_manager.py]
        MemoryMgr <--> TopicBooks[Categorized Topic Books<br/>.agent_memory/books/]
        MemoryMgr <--> CatalogIndex[.agent_memory/catalog_index.json]
        Supervisor -->|Post-Build| Defrag[defragment_and_consolidate_books]
    end

    subgraph Safety & Tooling
        AgentPipeline --> Gatekeeper[Permissions & Path Normalizer<br/>src/permissions.py]
        Gatekeeper --> FileSystem[(Filesystem & Workspace)]
        AgentPipeline --> ToolBridge[External Tool Bridge<br/>src/tool_bridge.py]
        ToolBridge --> AiderCLI[Aider CLI]
        ToolBridge --> N8NBridge[n8n Webhook]
        ToolBridge --> RooCodeBridge[RooCode / Cursor]
        ToolBridge --> AntigravityBridge[Antigravity Sandbox]
        ToolBridge --> VisionModule[Playwright Vision Engine]
        ToolBridge --> VoiceModule[CUDA Faster-Whisper Voice]
    end
```

---

## Repository Layout

```
advance_assistant/
├── .agent_memory/                  # Persistent brain & long-term memory store
│   ├── books/                      # Categorized Markdown Knowledge Books (9 categories)
│   ├── ARCHITECTURE.md             # High-level architectural invariants
│   ├── api_keys.json               # Multi-provider key pool (GOOGLE, GROQ)
│   ├── blueprint_preview.json      # Cached pre-flight iterative blueprint
│   ├── catalog_index.json          # Indexed catalogue of all active topic books
│   ├── env_history.json            # History of recent project workspace paths
│   ├── execution_profiles.json     # Saved auto-detected strategy execution plans
│   ├── LEARNINGS.md                # Cross-session accumulated insights
│   ├── provider_quotas.json        # 3-level hierarchical quotas (Provider -> Tier -> Model)
│   ├── sub_agents.json             # 11-model sub-agent capability registry
│   ├── swarm_registry.json         # Active project locks and file mutexes
│   ├── TASKS.md                    # Active task queue and milestone tracking
│   └── token_ledger.json           # Persistent token counts, RPD, RPM, and TPM
├── .search_data/                   # Staging cache for raw web documentation scrapes
├── frontend/                       # Modern React + TypeScript Web Dashboard (v6.0)
│   ├── src/
│   │   ├── components/             # Reusable UI components (Layout.tsx, Sidebar.tsx)
│   │   ├── pages/                  # 8 Minimalist Progressive-Disclosure Consoles
│   │   │   ├── ExecutionStudio.tsx # Execution Studio (/)
│   │   │   ├── SwarmMonitor.tsx    # Swarm Monitor (/swarm)
│   │   │   ├── AgentHub.tsx        # Agent Hub (/agents)
│   │   │   ├── KnowledgeBase.tsx   # Knowledge Base (/knowledge)
│   │   │   ├── TokenGovernor.tsx   # Token Governor (/governor)
│   │   │   ├── ApiKeyManager.tsx   # API Key Manager (/keys)
│   │   │   ├── LogCenter.tsx       # Log Center (/logs)
│   │   │   └── ToolBridges.tsx     # Tool Bridges & Gatekeeper (/tools)
│   │   ├── App.tsx                 # Main application routes & theme provider
│   │   └── main.tsx                # Frontend entrypoint
│   └── vite.config.ts              # Vite configuration with proxy to FastAPI
├── logs/                           # Multi-stream logging targets
│   ├── categories/                 # Categorical logs (models, tools, gatekeeper)
│   ├── daily/                      # Daily operational logs (YYYY-MM-DD.log)
│   ├── projects/                   # Project execution traces & blueprint ledgers
│   └── master_timeline.log         # Global system-wide execution trace
├── src/                            # Core engine source code
│   ├── agent.py                    # Intelligence router, model cascading, execution loop
│   ├── config.py                   # Model registry, rate limits, tier pools, profiles
│   ├── key_manager.py              # Multi-provider API key matrix & routing policies
│   ├── logger.py                   # Multi-stream thread-safe logger
│   ├── main.py                     # Master CLI gateway (100% UNTOUCHED)
│   ├── memory_manager.py           # Knowledge base indexing, defrag, precision snippets
│   ├── permissions.py              # Path normalizer, code sanitizer, gatekeeper
│   ├── server.py                   # FastAPI REST API & WebSocket telemetry bridge
│   ├── supervisor.py               # Swarm orchestrator, blueprint engine, lifecycle controls
│   ├── testing_bridge.py           # Read-only model capability evaluator & VRAM arbitrator
│   ├── token_governor.py           # Hierarchical governor, atomic leases, financial shield
│   ├── tool_bridge.py              # Aider, n8n, RooCode, Antigravity, MCP bridges
│   ├── tools.py                    # DuckDuckGo scraper & Gemini Search Grounding
│   ├── vision.py                   # Playwright headless viewport capture & vision audit
│   └── voice.py                    # CUDA Faster-Whisper STT & espeak-ng TTS
├── test/                           # Test harness & benchmark suite
│   ├── test_data/                  # Isolated mock projects and temporary test workspaces
│   ├── test_logs/                  # Mirror execution logs per test script
│   └── test_scripts/               # Subsystem verification and stress benchmarks
│       ├── run_all_tests.py        # Master certification harness (5 suites, 62 checks)
│       ├── test_hierarchical_governor.py # Stage 14.1 Hierarchical Governor suite
│       ├── test_stage14_2_pipeline.py    # Stage 14.2 Multi-provider & lease pipeline suite
│       ├── test_stage14_3_server.py      # Stage 14.3 FastAPI REST & WebSocket suite
│       ├── test_stage15_2_backend.py     # Stage 15.2 Pause/Stop lifecycle & blueprint suite
│       ├── test_v6_full_suite.py         # Stage 15.8 Master 34-check E2E suite
│       └── test_state_guard.py           # Zero test pollution context manager
├── all_file_paths.txt              # Complete flat repository file list
├── generate_tree.py                # Tree generator script
├── project_tree.txt                # Full ASCII repository directory tree
├── start_dashboard.bat             # 1-Click Windows dashboard launcher
├── start_dashboard.sh              # 1-Click Linux / WSL2 dashboard launcher
└── venv/                           # Python 3.10+ Virtual Environment
```

---

## Prerequisites & Setup

### 1. System Requirements
* **Operating System**: Linux (Ubuntu 22.04+ on WSL2) or native Linux.
* **NVIDIA GPU (CUDA)**: Recommended for CUDA float16 Faster-Whisper and GPU acceleration in Ollama.
* **System RAM**: Recommended 32GB+ system RAM to support offloading `qwen2.5-coder:32b`.
* **System Packages**:
  ```bash
  sudo apt-get update && sudo apt-get install -y       python3 python3-venv python3-pip       espeak-ng util-linux
  ```

### 2. Local Model Setup (Ollama)
Ensure [Ollama](https://ollama.com) is installed and running:
```bash
# Pull the dual-model system configurations
ollama pull qwen2.5-coder:32b    # Deep reasoning, blueprinting, delta deduplication
ollama pull qwen2.5-coder:7b     # High-speed code writer, syntax validation, repair
```

### 3. Environment & Virtualenv Setup
```bash
# Clone and enter the repository
cd /home/assistantuser/advance_assistant

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install core Python dependencies
pip install --upgrade pip
pip install google-genai ollama playwright faster-whisper beautifulsoup4             requests httpx fastapi uvicorn pydantic pillow pytest torch

# Install Playwright browser binaries
playwright install chromium

# Install frontend dependencies
cd frontend && npm install && cd ..
```

---

## Environment Configuration

Create a `.env` file or export the following environment variables in your shell profile:

| Variable | Required | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` | **Yes** (for Cloud) | `AIzaSy...` | Google AI Studio API key for Gemini 2.x/3.x models, search grounding, and vision. |
| `GROQ_API_KEY` | Optional | `gsk_...` | Groq LPU API key for high-throughput Qwen 2.5 Coder and Llama 3.3 execution. |
| `OLLAMA_HOST` | No | `http://127.0.0.1:11434` | Ollama daemon host address. |
| `N8N_WEBHOOK_URL` | No | `http://localhost:5678/webhook/advance-assistant-task` | Local n8n automation webhook endpoint. |
| `MCP_SERVER_URL` | No | `http://localhost:8080/mcp` | Base URL for active Model Context Protocol daemon. |

---

## Launch Instructions

### 1. Unified Web Dashboard Launcher (Linux / Ubuntu WSL2)
```bash
chmod +x ./start_dashboard.sh
./start_dashboard.sh
```
*Activates the virtual environment, launches the FastAPI backend on port 8000, and spawns the Vite development server on port 5173.*

### 2. Windows 1-Click Gateway
Double-click `start_dashboard.bat` from Windows File Explorer.
*Verifies WSL availability, automatically opens your default Windows web browser to `http://localhost:5173`, and initializes background services.*

### 3. Native Master CLI Mode (100% UNTOUCHED)
The original CLI command-line interface remains 100% functional and backward-compatible:
```bash
source venv/bin/activate
python3 src/main.py
```

---

## The 8 Production Consoles (v6.0 Minimalist Progressive-Disclosure)

Advance Assistant OS v6.0 delivers a unified minimalist web console designed with progressive disclosure, eliminating visual clutter through sleek collapsed cards, top dropdown controls, fast cross-console navigation, and click-to-expand details:

| Route | Console Name | Minimalist Architecture & Primary Functionality |
| :--- | :--- | :--- |
| `/` | **Execution Studio** | **3-Tab Layout**: `Execution & Blueprint Studio`, `Generated Code Inspector`, `Model Quotas`. Features workspace scanner (`/api/workspace/scan`), pre-flight dry-run blueprint preview with task checkboxes (`/api/blueprint/preview`), selective task execution, live code inspection with syntax gutter, and 1-click build Pause/Stop controls. |
| `/swarm` | **Swarm Monitor** | **3-Tab Layout**: `Live Sub-Agent Swarm`, `Generated Code Inspector`, `Model Quotas`. Renders 16-worker thread cards, live domain file lock mutexes, workspace file scan selector, code viewer, and provider/tier filtered model gauges. |
| `/agents` | **Agent Hub** | 11 Sub-Agent cards with provider badges (`GOOGLE`, `GROQ`, `OLLAMA`), click-to-expand bounds (Input, Output, Thinking), custom bound editor (`POST /api/governor/sub-agents`), 85-model read-only testing bridge, and RTX 4060 VRAM Arbitrator with idle weight scavenging. |
| `/knowledge` | **Knowledge Base** | **3-Tab Layout**: `Book Explorer & Recipes`, `Raw Markdown Editor`, `Precision Context Simulator`. Features compact book list with token counters, collapsible `#section_id` cards with code badges, inline `+ Append Recipe` form, raw editor, and precision context injection simulator for Ollama, Groq, and Gemini models. |
| `/governor` | **Token Governor** | **3-Tab Layout**: `Model Quotas`, `Sub-Agent Role Bounds`, `Cost & Cloud Savings`. Compact top control bar with Provider and Tier quick-dropdowns, 1-click Paid Spend Lock (`paid_tier_locked`), daily and per-build cap editors, working vs. strict limit comparisons, and real-time USD/INR spend vs. savings metrics. |
| `/keys` | **API Key Manager** | Multi-provider key matrix (`GOOGLE`, `GROQ`), Provider and Tier filters, routing policies (`GLOBAL_HYBRID`, `FREE_POOL`, `PAID_POOL`, `SINGLE_PINNED`), batch pool selection buttons, masked key copy, and key latency tester (`POST /api/keys/test`). |
| `/logs` | **Log Center** | High-clarity monospace telemetry stream with 6-stream switcher (Master, Daily, Categories, Models, Projects, Benchmark Tests), live WebSocket tail (`/ws/logs`), severity pills with facet counts, 1-click `🚀 Studio` and `⚡ Swarm` quick-return buttons, collapsible export tray, and minimizable JSON inspector panel. |
| `/tools` | **Tool Bridges & Security** | **2-Tab Layout**: `External Tool & Agentic Bridges` and `Gatekeeper & Workspace Security`. Collapsed 4-item adapter cards (Aider CLI, RooCode, n8n, Antigravity, Vision, Voice) with click-to-expand config drawers, category filters, and active Gatekeeper guardrails. |

---

## Testing & Master Certification Suite

Advance Assistant OS v6.0 includes an automated, zero-pollution Master Certification Harness executing all 5 subsystem test suites:

```bash
# Run the complete master certification harness
./venv/bin/python3 test/test_scripts/run_all_tests.py
```

### Certification Summary Table

```text
================================================================================
                       MASTER CERTIFICATION SUMMARY TABLE
================================================================================
 Suite File                       Duration   Status       Checks
 ──────────────────────────────────────────────────────────────────────────────
 test_hierarchical_governor.py    1.48s      ✅ PASS       8/8 checks
 test_stage14_2_pipeline.py       1.09s      ✅ PASS       6/6 checks
 test_stage14_3_server.py         1.59s      ✅ PASS       8/8 checks
 test_stage15_2_backend.py        1.26s      ✅ PASS       6/6 checks
 test_v6_full_suite.py            1.56s      ✅ PASS       34/34 checks
================================================================================
 🏆 OVERALL SYSTEM STATUS: 100% PASS (5/5 Suites Succeeded in 6.98s)
================================================================================
```

### Individual Subsystem Suites

1. **Hierarchical Governor & Leases (`test_hierarchical_governor.py`)**:
   Validates 3-provider 5-tier quota tree, atomic pre-request reservations, staggered pacing delays, post-request exact token reconciliation, 1-click paid tier lock, and per-build paid token caps.
   ```bash
   ./venv/bin/python3 test/test_scripts/test_hierarchical_governor.py
   ```

2. **Multi-Provider & Lease Pipeline (`test_stage14_2_pipeline.py`)**:
   Verifies 11-agent capability bounds, Groq velocity coder, zero-cloud-cost deterministic task classifier, and dynamic limit-aware supervisor concurrency.
   ```bash
   ./venv/bin/python3 test/test_scripts/test_stage14_2_pipeline.py
   ```

3. **FastAPI REST & WebSocket Telemetry (`test_stage14_3_server.py`)**:
   Certifies all Stage 14 REST endpoints (`/api/governor/hierarchy`, `/api/governor/limits`, `/api/governor/provider-model`, `/api/governor/shield`, `/api/governor/sub-agents`, `/api/keys`) and WebSocket telemetry streaming.
   ```bash
   ./venv/bin/python3 test/test_scripts/test_stage14_3_server.py
   ```

4. **Lifecycle Engine & Iterative Blueprinting (`test_stage15_2_backend.py`)**:
   Certifies build pause/resume/stop lifecycle controls, workspace scanning, pre-flight dry-run blueprinting, and the real-time cost and cloud savings estimator.
   ```bash
   ./venv/bin/python3 test/test_scripts/test_stage15_2_backend.py
   ```

5. **Master End-to-End System Suite (`test_v6_full_suite.py`)**:
   Executes 34 comprehensive checks covering Core Health & Config, Multi-Key Matrix & Routing, Testing Bridge & VRAM Arbitrator, Swarm Scaling, Multi-Stream Logs & Path Traversal Guards, Memory Snippets & Book CRUD Roundtrip, Dual WebSockets, and Stage 14/15 Hierarchical Governor & Blueprint Lifecycle APIs.
   ```bash
   ./venv/bin/python3 test/test_scripts/test_v6_full_suite.py
   ```

---

## Core CLI Preservation Audit

To maintain 100% backward compatibility:
* `src/main.py` is **100% UNTOUCHED**.
* All original CLI commands, terminal flags, offline modes, and manual builds operate identically.
* All test runs are isolated with `with preserve_agent_memory():` to prevent memory and log pollution.

---

## License

Advance Assistant OS is open-source software licensed under the Apache 2.0 License.
