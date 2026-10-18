# ADVANCE ASSISTANT OS v6.0
## TECHNICAL SPECIFICATION 01: SYSTEM ARCHITECTURE & THEORETICAL FOUNDATIONS

---

## 1. Executive System Overview & Hybrid OS Philosophy

### 1.1 Dual-Mode Architecture & The Legacy Preservation Mandate
Advance Assistant OS v6.0 is an enterprise-grade autonomous software engineering and multi-agent development operating system. It operates on a dual-mode execution foundation:
1. **Untouched Legacy CLI Engine (`src/main.py`)**: A deterministic, zero-dependency, command-line direct interface designed for headless server runners, CI/CD automated loops, and air-gapped terminal environments. Per strict architectural invariants, `src/main.py` remains 100% untouched across all evolutionary stages.
2. **FastAPI & Dual WebSocket Asynchronous Gateway (`src/server.py`)**: An asynchronous high-performance server exposing 35+ RESTful endpoints and twin WebSockets (`/ws/telemetry` at 1.0 Hz and `/ws/logs` event-driven tailing).
3. **8-View React 18 TypeScript Command Console (`frontend/src/`)**: A rich, responsive UI built with Vite, Tailwind CSS, Lucide icons, and interactive canvas components supporting direct build execution, iterative blueprint dry-runs, swarm profiling, token governance, API key lifecycle management, memory exploration, bridge arbitration, and live system logging.

The core philosophy of Advance Assistant OS is **Cooperative Multi-Model Hybrid Intelligence**: seamlessly uniting ultra-fast cloud LPUs (Groq), state-of-the-art cloud multimodal reasoning (Google Gemini 2.5/3.6), and local, private hardware-bounded models (Ollama on NVIDIA RTX 4060) under a single mathematical governance ceiling.

---

### 1.2 System Architecture Diagram (Mermaid `graph TB`)

```mermaid
graph TB
    subgraph ClientLayer ["Client & Interface Layer"]
        Browser["User Browser (React 18 TypeScript Console)"]
        CLI["Legacy CLI Terminal (src/main.py)"]
        ViteProxy["Vite Dev/Prod Reverse Proxy (:5173)"]
    end

    subgraph ServerLayer ["Server & Gateway Layer (src/server.py :8000)"]
        FastAPIGateway["FastAPI Core Application"]
        RestEndpoints["35+ RESTful APIs (/api/*)"]
        WSTelemetry["WebSocket Telemetry Engine (/ws/telemetry)"]
        WSLogs["WebSocket Log Streamer (/ws/logs)"]
        LifecycleManager["Build Lifecycle Controller (Pause / Resume / Cancel)"]
    end

    subgraph CoreOrchestration ["Core Orchestration & Execution Engine"]
        Supervisor["Project Supervisor (src/supervisor.py)"]
        BlueprintEngine["Iterative Pre-Flight Blueprint Engine"]
        AgentPipeline["Multi-Model Agent Pipeline (src/agent.py)"]
        DomainLock["Fine-Grained Domain File Locker (threading.Lock)"]
    end

    subgraph GovernanceSecurity ["Governance, Security & State Layers"]
        TokenGovernor["Hierarchical Token Governor (src/token_governor.py)"]
        KeyManager["Multi-Provider Key Manager (src/key_manager.py)"]
        MemoryManager["Precision Memory Manager (src/memory_manager.py)"]
        TestingBridge["VRAM Arbitrator & Testing Bridge (src/testing_bridge.py)"]
        MultiStreamLogger["Multi-Stream Category Logger (src/logger.py)"]
    end

    subgraph DataPersistence [".agent_memory/ Persistent JSON Stores"]
        D1["provider_quotas.json"]
        D2["api_keys.json (Ignored)"]
        D3["token_ledger.json"]
        D4["swarm_profiles.json"]
        D5["sub_agents.json"]
        D6["swarm_registry.json"]
        D7["catalog_index.json & books/"]
    end

    subgraph ExecutionProviders ["Execution Providers & Hardware"]
        GoogleCloud["Google AI Studio Cloud (Gemini 2.5 / 3.6 Flash / Pro)"]
        GroqCloud["Groq Cloud LPU (Qwen 2.5 Coder 32B / Llama 3.3 70B)"]
        LocalOllama["Local Ollama Daemon (:11434)"]
        RTX4060["NVIDIA GeForce RTX 4060 (8.0 GB GDDR6)"]
        TargetFS["Target Project Filesystem"]
    end

    Browser -->|HTTP / JSON| ViteProxy
    Browser <-->|WebSocket Stream| ViteProxy
    ViteProxy -->|Reverse Proxy /api| FastAPIGateway
    ViteProxy <-->|Reverse Proxy /ws| FastAPIGateway
    CLI -->|Direct Pipeline| AgentPipeline
    CLI -->|Direct Supervision| Supervisor

    FastAPIGateway --> RestEndpoints
    FastAPIGateway --> WSTelemetry
    FastAPIGateway --> WSLogs
    FastAPIGateway --> LifecycleManager

    RestEndpoints --> Supervisor
    RestEndpoints --> TokenGovernor
    RestEndpoints --> KeyManager
    RestEndpoints --> MemoryManager
    RestEndpoints --> TestingBridge

    Supervisor --> BlueprintEngine
    Supervisor --> DomainLock
    Supervisor --> AgentPipeline

    AgentPipeline --> KeyManager
    AgentPipeline --> TokenGovernor
    AgentPipeline --> MemoryManager
    AgentPipeline --> TestingBridge

    KeyManager --> D2
    TokenGovernor --> D1
    TokenGovernor --> D3
    Supervisor --> D4
    Supervisor --> D6
    MemoryManager --> D7

    AgentPipeline -->|gRPC / REST (Free / Paid Keys)| GoogleCloud
    AgentPipeline -->|HTTPS REST (LPU Keys)| GroqCloud
    AgentPipeline -->|HTTP /api/generate| LocalOllama
    TestingBridge -->|GPU Memory Telemetry| RTX4060
    Supervisor -->|Staged Atomic Writes| TargetFS
```

---

### 1.3 ASCII System Block Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                 USER CLIENT & CONTROL SURFACES                                    |
|   +-------------------------------------------------------+   +-------------------------------+   |
|   |         React 18 TypeScript Single-Page App           |   |       Legacy Terminal CLI     |   |
|   |     (Execution Studio, Governor, Keys, Memory, Logs)  |   |          (src/main.py)        |   |
|   +---------------------------+---------------------------+   +---------------+---------------+   |
+-------------------------------|-----------------------------------------------|-------------------+
                                | HTTP :5173 / Proxy                            | Direct Python Import
                                v                                               |
+-------------------------------------------------------------------------------+-------------------+
|                        FASTAPI CORE APPLICATION (:8000) (src/server.py)                           |
|   +-----------------------------------+   +---------------------------------------------------+   |
|   |    RESTful Endpoints (/api/*)     |   |      Dual Real-Time WebSockets                     |   |
|   |  - /api/execute, /api/blueprint   |   |      - /ws/telemetry (1 Hz JSON System Frame)     |   |
|   |  - /api/governor, /api/keys       |   |      - /ws/logs (Event-Driven Tail Broadcast)     |   |
|   |  - /api/models/catalog, /api/swarms   +---------------------------------------------------+   |
+-------------------+-------------------------------------------------------------------------------+
                    | Dispatches Requests
                    v
+---------------------------------------------------------------------------------------------------+
|                                   PROJECT SUPERVISOR (src/supervisor.py)                          |
|   +-----------------------------------+   +---------------------------------------------------+   |
|   |  Phase 0: Master Orchestrator     |   |  Phase 2: Multi-Model Parallel Swarm Dispatcher   |   |
|   |  - Architectural Decomposition    |   |  - Thread Pool Executor (max_concurrency_workers) |   |
|   +-----------------------------------+   |  - Domain File Locks (domain_locks: dict[str,Lock]|   |
|   +-----------------------------------+   |  - Staggered Launch Delay (0.15s per worker)      |   |
|   |  Phase 1: Sequential Scaffolding  |   +---------------------------------------------------+   |
|   |  - Critical Base File Generation  |   +---------------------------------------------------+   |
|   +-----------------------------------+   |  Phase 3 & 4: Self-Healing & Memory Consolidation |   |
+-------------------+-----------------------+---------------------------------------------------+---+
                    | Drives Individual File Tasks
                    v
+---------------------------------------------------------------------------------------------------+
|                                  AGENT PIPELINE (src/agent.py)                                    |
|   1. Context Synthesis (src/memory_manager.py: Precision Knapsack Memory Snippets)                |
|   2. Key Resolution (src/key_manager.py: Preferred Key -> Routing Policy -> Fallback)             |
|   3. Pre-Flight Token Lease Acquisition (src/token_governor.py: Two-Phase Atomic Lock)            |
|   4. Execution Dispatch (Google AI Studio / Groq LPU Cloud / Local Ollama)                        |
|   5. Post-Flight Lease Commitment & Usage Reconciliation                                          |
+---------+----------------------------------+------------------------------------+-----------------+
          |                                  |                                    |
          v                                  v                                    v
+-----------------------+  +----------------------------------+  +----------------------------------+
|    GOOGLE AI STUDIO   |  |          GROQ CLOUD LPU          |  |       LOCAL OLLAMA DAEMON        |
| - Gemini 2.5 Flash    |  | - Qwen 2.5 Coder 32B             |  | - qwen2.5-coder:7b / 14b / 32b   |
| - Gemini 3.6 Flash    |  | - Llama 3.3 70B Versatile        |  | - deepseek-r1:8b / 14b           |
| - Gemini 2.5 Pro      |  | - 85% Rate Limiting on LPU Pool  |  | - NVIDIA RTX 4060 VRAM Arbitrated|
+-----------------------+  +----------------------------------+  +----------------------------------+
```

---

## 2. Theoretical & Mathematical Foundations

### 2.1 Hierarchical Quota Model & 85% Working Limit Calculus

The system enforces a 3-tier organizational hierarchy for all model execution quotas:
$$\text{Provider} \longrightarrow \text{Tier} \longrightarrow \text{Model}$$

Where:
- $\text{Provider} \in \{\text{GOOGLE}, \text{GROQ}, \text{OLLAMA}\}$
- $\text{Tier} \in \{\text{FREE}, \text{PAID}, \text{LOCAL}\}$
- $\text{Model} \in \mathcal{M}_{p,t}$ represents the discrete model identifier.

#### The 85% Safety Margin Formula
Provider-published rate limits are strict ceilings. Operating at 100% of these limits guarantees HTTP 429 (`RESOURCE_EXHAUSTED` / `Too Many Requests`) failures due to network jitter, out-of-order packet arrivals, clock skew, and cloud-side token estimation discrepancies.

To eliminate 429 errors completely, the governor computes **Working Limits** as a mathematical discount of strict limits using a configurable safety factor $\gamma$ (default $\gamma = 85\%$):

$$L_{\text{working}}(m, p, t) = \left\lfloor L_{\text{strict}}(m, p, t) \times \frac{\gamma}{100} \right\rfloor$$

Specifically, for each metric:

$$\text{RPM}_{\text{working}} = \max\left(1, \left\lfloor \text{RPM}_{\text{strict}} \times 0.85 \right\rfloor\right)$$

$$\text{TPM}_{\text{working}} = \max\left(1000, \left\lfloor \text{TPM}_{\text{strict}} \times 0.85 \right\rfloor\right)$$

$$\text{RPD}_{\text{working}} = \max\left(1, \left\lfloor \text{RPD}_{\text{strict}} \times 0.85 \right\rfloor\right)$$

$$\text{MaxInput}_{\text{working}} = \max\left(1024, \left\lfloor \text{MaxInput}_{\text{strict}} \times 0.85 \right\rfloor\right)$$

$$\text{MaxOutput}_{\text{working}} = \max\left(512, \left\lfloor \text{MaxOutput}_{\text{strict}} \times 0.85 \right\rfloor\right)$$

#### Comparative Reference Table: Strict (100%) vs. Working (85%) Limits

| Provider | Tier | Model Identifier | Strict RPM | Working RPM (85%) | Strict TPM | Working TPM (85%) | Strict RPD | Working RPD (85%) | Max Input Tok | Max Output Tok |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **GOOGLE** | `FREE` | `gemini-2.5-flash` | 15 | **12** | 250,000 | **212,500** | 500 | **425** | 32,768 | 8,192 |
| **GOOGLE** | `FREE` | `gemini-3.6-flash` | 15 | **12** | 250,000 | **212,500** | 500 | **425** | 32,768 | 8,192 |
| **GOOGLE** | `FREE` | `gemini-2.5-pro` | 2 | **1** | 32,000 | **27,200** | 50 | **42** | 65,536 | 8,192 |
| **GOOGLE** | `PAID` | `gemini-2.5-flash` | 1,000 | **850** | 4,000,000 | **3,400,000** | 100,000 | **85,000** | 128,000 | 16,384 |
| **GOOGLE** | `PAID` | `gemini-3.6-flash` | 2,000 | **1,700** | 4,000,000 | **3,400,000** | 100,000 | **85,000** | 128,000 | 16,384 |
| **GOOGLE** | `PAID` | `gemini-2.5-pro` | 360 | **306** | 2,000,000 | **1,700,000** | 50,000 | **42,500** | 256,000 | 16,384 |
| **GROQ** | `FREE` | `qwen-2.5-coder-32b` | 30 | **25** | 6,000 | **5,100** | 14,400 | **12,240** | 32,768 | 8,192 |
| **GROQ** | `FREE` | `llama-3.3-70b-versatile` | 30 | **25** | 6,000 | **5,100** | 14,400 | **12,240** | 32,768 | 8,192 |
| **GROQ** | `PAID` | `qwen-2.5-coder-32b` | 60 | **51** | 100,000 | **85,000** | 100,000 | **85,000** | 65,536 | 8,192 |
| **OLLAMA** | `LOCAL`| `qwen2.5-coder:7b` | 120 | **102** | 500,000 | **425,000** | 100,000 | **85,000** | 32,768 | 4,096 |
| **OLLAMA** | `LOCAL`| `qwen2.5-coder:32b` | 30 | **25** | 200,000 | **170,000** | 50,000 | **42,500** | 32,768 | 4,096 |

---

### 2.2 Two-Phase Atomic Token Lease Protocol

#### The "Thundering Herd" Failure of Post-Hoc Rate Tracking
Traditional naive rate limiting tracks token usage *after* an API call returns (`on_response(tokens)`). Under multi-threaded concurrent agent execution (e.g., 6 worker threads simultaneously initializing tasks at $t = 0.00\text{s}$), each worker observes:

$$\text{Consumed Tokens}_{t=0} = 0$$

All 6 workers launch requests concurrently. When the calls complete at $t = 2.50\text{s}$, the total consumed tokens instantly surge to $6 \times 35,000 = 210,000\text{ tokens}$, violently bursting through the 212,500 TPM threshold and causing cascade 429 failures across the pool.

#### Two-Phase Atomic Protocol Mechanics
Advance Assistant OS solves this with a **Two-Phase Atomic Lease Protocol** implemented inside `src/token_governor.py`:

```
 Thread 1                                   Token Governor                                 Provider API
    |                                              |                                             |
    |---- 1. acquire_lease(prompt, model) ------->|                                             |
    |                                              |-- Verify 60s Sliding Window + In-Flight --| |
    |                                              |-- Reserve T_est_in + T_max_out + Think ----| |
    |                                              |-- Atomic Increment: |L_in_flight| += 1 ----| |
    |<--- 2. Lease Granted (lease_id, pace_sec) ---|                                             |
    |                                              |                                             |
    |==== 3. Staggered Pacing Sleep (pace_sec) ====|                                             |
    |                                              |                                             |
    |---- 4. Execute Remote/Local API Call ----------------------------------------------------->|
    |                                              |                                             |
    |<--- 5. Response + usage_metadata ----------------------------------------------------------|
    |                                              |                                             |
    |---- 6. commit_lease(lease_id, actual_usage)->|                                             |
    |                                              |-- Release Reserved Allocation -------------| |
    |                                              |-- Add Exact Actual Usage to Window -------| |
    |                                              |-- Decrement: |L_in_flight| -= 1 -----------| |
    |<--- 7. Lease Closed -------------------------|                                             |
```

#### Pre-Flight Reservation Mathematics
Before a thread can dispatch a request, it must estimate its input token footprint based on character density and reserve worst-case generation tokens:

$$T_{\text{est\_in}} = \max\left(1, \left\lfloor \frac{\text{len}(\text{prompt})}{3.5} \right\rfloor\right)$$

$$T_{\text{reserved}} = T_{\text{est\_in}} + T_{\text{max\_out}} + T_{\text{think\_budget}}$$

Where:
- $\text{len}(\text{prompt}) / 3.5$: Conservative token-to-character ratio across UTF-8 English and programming source code.
- $T_{\text{max\_out}}$: Max completion tokens configured for the target model.
- $T_{\text{think\_budget}}$: Dedicated reasoning token budget (e.g., Gemini 2.5 Thinking / DeepSeek R1).

#### Sliding 60-Second Window Verification
For a given key and model bucket $B = \{p, t, k, m\}$, the Governor queries the sliding window $\mathcal{W}_{60\text{s}}$ containing all timestamps $t_i > (t_{\text{now}} - 60.0\text{s})$, and the active in-flight lease set $\mathcal{L}_{\text{in\_flight}}$:

$$\text{RPM}_{\text{effective}} = |\mathcal{W}_{60\text{s}}| + |\mathcal{L}_{\text{in\_flight}}| < \text{RPM}_{\text{working}}$$

$$\text{TPM}_{\text{effective}} = \sum_{e \in \mathcal{W}_{60\text{s}}} T_{\text{actual}}(e) + \sum_{l \in \mathcal{L}_{\text{in\_flight}}} T_{\text{reserved}}(l) + T_{\text{reserved}}(\text{new}) \le \text{TPM}_{\text{working}}$$

If either condition is violated, `acquire_lease()` blocks until the oldest window entry expires or an active in-flight lease commits, preventing rate limit breaches.

#### Staggered Request Pacing Formula
To prevent micro-burst packet aggregation at upstream provider load balancers, the Governor injects a dynamic inter-request delay proportional to the current in-flight concurrency:

$$\Delta t_{\text{pace}} = \text{round}\left(\frac{60.0}{\max(1, \text{RPM}_{\text{working}})}, 2\right) \times |\mathcal{L}_{\text{in\_flight}}|$$

For example, on Google Free (`RPM_working = 12`):

$$\text{Base Pace} = \frac{60.0}{12} = 5.0\text{ seconds}$$

If 2 workers are already in-flight, worker 3 pauses for:

$$\Delta t_{\text{pace}} = 5.0 \times 2 = 10.0\text{ seconds}$$

#### Post-Request Reconciliation
Upon receiving the API response, `commit_lease(lease_id, actual_usage)` replaces the speculative $T_{\text{reserved}}$ with exact tokens parsed from `usage_metadata`:

$$T_{\text{committed}} = T_{\text{actual\_in}} + T_{\text{actual\_out}} + T_{\text{actual\_think}}$$

The difference $\Delta T = T_{\text{reserved}} - T_{\text{committed}}$ is immediately returned to the governor's available pool, enabling other workers to proceed without artificial delay.

---

### 2.3 Precision Memory Snippet Engine & Relevance Scoring

#### Fragmented Recipe Architecture
Standard retrieval-augmented generation (RAG) suffers from token bloat by injecting entire files into prompts. The Precision Memory Manager (`src/memory_manager.py`) decomposes Markdown books in `.agent_memory/books/**/*.md` into discrete structural recipes based on level 2 (`## `) and level 3 (`### `) headings.

Each extracted snippet retains:
- `category`: Knowledge domain (e.g., `coding`, `architecture`, `debugging`).
- `book_name`: Source file name (e.g., `fastapi_patterns.md`).
- `heading`: Specific section title.
- `body`: Instruction narrative and rules.
- `code_blocks`: Isolated executable snippets (` ```python ... ``` `).
- `token_count`: Estimated snippet token weight.

#### Weighted Relevance Scoring Function
When an agent prepares to execute a task, its prompt query $q$ is tokenized into word stems. Each candidate snippet $s$ is evaluated using a weighted multi-signal scoring function:

$$S(q, s) = 3.0 \cdot \text{Match}_{\text{heading}}(q, s) + 2.5 \cdot \text{Match}_{\text{cat/book}}(q, s) + 1.0 \cdot \text{Match}_{\text{body}}(q, s) + 1.5 \cdot \mathbb{I}_{\text{code}}(q, s)$$

Where:
- $\text{Match}_{\text{heading}}(q, s) = \sum_{w \in q} \mathbb{I}(w \in \text{heading}(s))$: Exact word hits in section headings.
- $\text{Match}_{\text{cat/book}}(q, s) = \sum_{w \in q} \mathbb{I}(w \in \text{category}(s) \cup \text{book\_name}(s))$: Domain alignment hits.
- $\text{Match}_{\text{body}}(q, s) = \sum_{w \in q} \mathbb{I}(w \in \text{body}(s))$: Keyword hits in explanation text.
- $\mathbb{I}_{\text{code}}(q, s) \in \{0, 1\}$: Binary bonus indicator indicating whether the snippet provides actionable code implementations.

#### Model-Scale Aware Knapsack Token Budget Tiers
Snippets are sorted in descending order of $S(q, s)$ and packed into prompt context using a greedy 0/1 knapsack algorithm bounded by the target model's parameter scale:

| Model Parameter Tier | Example Models | Memory Token Budget | Typical Injected Snippets | Full Book Size | Token Savings Ratio |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Small Local (1.5B – 3B)** | `qwen2.5-coder:1.5b` | **600 tokens** | 4 – 6 snippets | ~16,800 tokens | **96.4% Saved** |
| **Standard Local (7B – 14B)**| `qwen2.5-coder:7b`, `14b` | **1,200 tokens** | 8 – 12 snippets | ~16,800 tokens | **92.8% Saved** |
| **Large Local (32B)** | `qwen2.5-coder:32b` | **2,000 tokens** | 14 – 18 snippets | ~16,800 tokens | **88.1% Saved** |
| **Cloud Models (Pro / Flash)**| `gemini-2.5-flash`, `pro` | **3,500 tokens** | 20 – 28 snippets | ~16,800 tokens | **79.2% Saved** |

This guarantees that small local models are never flooded with irrelevant text, preserving their limited attention windows for generation.

---

### 2.4 NVIDIA RTX 4060 VRAM Arbitration & Co-Residency Math

#### Hardware Profile
The local bridge runtime (`src/testing_bridge.py`) monitors and arbitrates VRAM on an **NVIDIA GeForce RTX 4060 Laptop GPU** with **8.0 GB GDDR6 Dedicated VRAM** running on Windows host and WSL2 pass-through.

#### The 4 Hardware Safety Tiers
To prevent Windows Desktop Manager (DWM) stuttering and CUDA Out-Of-Memory (OOM) fatal crashes, models are categorized into four VRAM residency zones:

```
  0 GB              5.2 GB             8.0 GB                                16.0 GB+
  +--------------------+------------------+--------------------------------------+---->
  |     SAFE_GPU       |    HIGH_LOAD     |             PAGED_HYBRID             | OOM_HAZARDOUS
  |   (<= 5.2 GB)      |  (5.2 - 8.0 GB)  |            (8.0 - 16.0 GB)           | (> 16.0 GB)
  | 1.5B to 7B Q4/Q5   |   8B, 14B Q4     |  32B Q4 (Partial CPU RAM Paging)     | 70B+ Dense
  +--------------------+------------------+--------------------------------------+---->
```

1. **`SAFE_GPU` ($\le 5.2\text{ GB}$)**: Models fit entirely within GPU VRAM with $\ge 2.8\text{ GB}$ head-room reserved for Windows display buffers and WSL2 virtualization overhead. Safe for continuous multi-threaded execution.
2. **`HIGH_LOAD` ($5.2\text{ GB} - 8.0\text{ GB}$)**: Models fully saturate GPU VRAM. Permitted only for single-threaded batch execution.
3. **`PAGED_HYBRID` ($8.0\text{ GB} - 16.0\text{ GB}$)**: Models exceed physical GDDR6 capacity. Ollama offloads upper layers to host system RAM via PCIe. Inference throughput drops from ~65 tok/s to ~12 tok/s.
4. **`OOM_HAZARDOUS` ($> 16.0\text{ GB}$)**: Severe thrashing and system unresponsiveness. Blocked by governor arbitration.

#### KV-Cache Overhead Calculation
VRAM consumption is not static; it scales with context window length $L_{\text{ctx}}$:

$$\text{VRAM}_{\text{total}} = \text{VRAM}_{\text{weights}} + \text{VRAM}_{\text{KV\_cache}}(L_{\text{ctx}}) + \text{VRAM}_{\text{CUDA\_overhead}}$$

$$\text{VRAM}_{\text{KV\_cache}} = 2 \times n_{\text{layers}} \times n_{\text{heads\_kv}} \times d_{\text{head}} \times L_{\text{ctx}} \times \text{bytes\_per\_elem}$$

For `qwen2.5-coder:7b` at $L_{\text{ctx}} = 32,768$ in 16-bit float:

$$\text{VRAM}_{\text{KV}} \approx 2 \times 28 \times 4 \times 128 \times 32768 \times 2 \approx 1.87\text{ GB}$$

Thus, base weights ($4.7\text{ GB}$) + KV-cache ($1.87\text{ GB}$) = $6.57\text{ GB}$, pushing into `HIGH_LOAD`. The governor automatically trims local model context when running concurrent workloads to keep total VRAM $< 5.2\text{ GB}$.

#### Idle VRAM Scavenging
When switching from local model execution to cloud tasks, `src/testing_bridge.py` immediately issues an explicit unload request to Ollama:
```http
POST http://127.0.0.1:11434/api/generate
{ "model": "active_model", "keep_alive": 0 }
```
This forces the CUDA runtime to release all weights and KV caches, returning available VRAM to $8.0\text{ GB}$ for local developer tools and host GPU tasks.

---

### 2.5 Real-Time Cloud Cost & Savings Valuation Model

The system maintains real-time financial telemetry tracking actual dollar expenditures against commercial cloud value saved.

#### Pricing Matrix (Google Cloud & Commercial API Baseline)

| Provider & Model | Input Price per 1M Tokens (USD) | Output Price per 1M Tokens (USD) | Effective Blended USD / 1M |
| :--- | :---: | :---: | :---: |
| **Gemini 2.5 Flash** | $0.075 | $0.300 | $0.131 |
| **Gemini 3.6 Flash** | $0.075 | $0.300 | $0.131 |
| **Gemini 2.5 Pro** | $1.250 | $5.000 | $2.187 |
| **Groq Llama 3.3 70B**| $0.590 | $0.790 | $0.640 |
| **Local Ollama (Any)**| $0.000 | $0.000 | $0.000 (Hardware Bound) |

#### Financial Valuation Formulas
Let $T_{\text{in}}(m, k)$ and $T_{\text{out}}(m, k)$ denote input and output tokens consumed on model $m$ using key $k$:

1. **Actual Paid Expenditure**:

$$\text{Spend}_{\text{USD}} = \sum_{k \in \mathcal{K}_{\text{PAID}}} \sum_{m} \left( \frac{T_{\text{in}}(m, k)}{10^6} \cdot P_{\text{in}}(m) + \frac{T_{\text{out}}(m, k)}{10^6} \cdot P_{\text{out}}(m) \right)$$

2. **Cloud Value Saved (Via Free Tier Pool & Local Ollama)**:

$$\text{Savings}_{\text{USD}} = \sum_{k \in \mathcal{K}_{\text{FREE}}} \sum_{m} \left( \frac{T_{\text{in}}(m, k)}{10^6} \cdot P_{\text{in}}(m) + \frac{T_{\text{out}}(m, k)}{10^6} \cdot P_{\text{out}}(m) \right) + \sum_{m \in \mathcal{M}_{\text{local}}} \left( \frac{T_{\text{in}}(m)}{10^6} \cdot P_{\text{in}}(\text{equiv}) + \frac{T_{\text{out}}(m)}{10^6} \cdot P_{\text{out}}(\text{equiv}) \right)$$

3. **Currency Conversion to Indian Rupee (INR)**:
   Using fixed benchmark conversion rate ($1\text{ USD} = 84.00\text{ INR}$):

$$\text{Spend}_{\text{INR}} = \text{Spend}_{\text{USD}} \times 84.00$$

$$\text{Savings}_{\text{INR}} = \text{Savings}_{\text{USD}} \times 84.00$$

4. **Financial Shield Limit Enforcement**:
   The `TokenGovernor` enforces a user-defined hard cap on total session tokens ($C_{\text{financial}}$, default 150,000 tokens for paid builds). When total accumulated session tokens exceed $C_{\text{financial}}$, all paid keys are automatically locked (`paid_tier_locked = true`), forcing the multi-model dispatcher to fall back to the Free pool or local offline execution.
