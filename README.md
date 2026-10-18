# Advance Assistant OS v6.0
### Autonomous Multi-Agent Software Engineering Operating System

[![Status: Certified v6.0](https://img.shields.io/badge/Status-Certified_v6.0-emerald.svg)](file:///home/assistantuser/advance_assistant/ANTIGRAVITY_BUILD_LOG.md)
[![Python: 3.12+](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](file:///home/assistantuser/advance_assistant/src/README.md)
[![Frontend: React 18 / Vite / TS](https://img.shields.io/badge/Frontend-React_18_%2F_Vite_%2F_TS-indigo.svg)](file:///home/assistantuser/advance_assistant/frontend/README.md)
[![Hardware: RTX 4060 8GB GDDR6](https://img.shields.io/badge/Hardware-RTX_4060_8GB_GDDR6-green.svg)](file:///home/assistantuser/advance_assistant/docs/01_SYSTEM_ARCHITECTURE_AND_THEORY.md#section-24-nvidia-rtx-4060-vram-arbitration--co-residency-math)
[![Test Coverage: 70/70 Checks](https://img.shields.io/badge/Test_Coverage-70%2F70_Checks_(100%25_PASS)-success.svg)](file:///home/assistantuser/advance_assistant/test/README.md)
[![Security: Hardened](https://img.shields.io/badge/Security-Hardened_(Zero_Leaks)-rose.svg)](file:///home/assistantuser/advance_assistant/.env.example)

---

## 1. Executive System Overview & Dual-Mode Philosophy

**Advance Assistant OS v6.0** is an enterprise-grade autonomous software engineering operating system. It bridges ultra-fast cloud LPUs (Groq), cutting-edge cloud multimodal reasoning (Google Gemini 2.5/3.6 Flash & Pro), and private local offline models (Ollama on NVIDIA RTX 4060) into a unified, mathematically governed development machine.

The operating system operates on a **Dual-Mode Architectural Foundation**:
1. **Zero-Mutation Core CLI (`src/main.py`)**: A deterministic, zero-dependency terminal REPL and pipeline runner for headless servers, scripts, and CI environments. Under strict architectural invariants, `src/main.py` remains 100% untouched across all evolutionary stages.
2. **FastAPI & Dual WebSocket Asynchronous Gateway (`src/server.py`)**: An asynchronous core hosting 35+ REST endpoints, a 1.0 Hz full-state telemetry stream (`/ws/telemetry`), and an event-driven virtualized log stream (`/ws/logs`).
3. **8-View React 18 TypeScript Command Console (`frontend/`)**: A sleek, dark-slate single-page interface with progressive disclosure, providing full control over multi-model swarms, token governors, API keys, memory snippets, and system logs.

---

## 2. Core Breakthroughs & Architectural Pillars

### 🏛️ 1. 3-Level Hierarchical Quota Governor & 85% Working Limit Calculus
- Enforces an organizational hierarchy: `Provider -> Tier -> Model`.
- Solves HTTP 429 (`RESOURCE_EXHAUSTED`) failures by decoupling **Strict 100% Limits** from active **Working Limits** calculated at a strict 85% ceiling:

$$L_{\text{working}}(m, p, t) = \left\lfloor L_{\text{strict}}(m, p, t) \times 0.85 \right\rfloor$$

- Protects 148+ models across Google Free/Paid, Groq Free/Paid, and Local Ollama pools.

### ⚡ 2. Two-Phase Atomic Token Lease Protocol
- Prevents the multi-threaded "Thundering Herd" race condition at $t = 0.00\text{s}$.
- Pre-request `acquire_lease()` reserves worst-case input and output tokens:

$$T_{\text{reserved}} = \max\left(1, \left\lfloor \frac{\text{len}(\text{prompt})}{3.5} \right\rfloor\right) + T_{\text{max-out}} + T_{\text{think-budget}}$$

- Injects dynamic inter-request pacing sleep based on active in-flight worker density:

$$\Delta t_{\text{pace}} = \left(\frac{60}{\text{RPM}_{\text{working}}}\right) \times |\mathcal{L}_{\text{in-flight}}|$$

- Post-request `commit_lease()` reconciles speculative reservations with exact provider `usage_metadata`.

### 🛡️ 3. Paid Tier Financial Shield & Cost/Savings Telemetry
- Dedicated 1-click **Paid Lock** switch immediately halts paid API consumption upon reaching configurable caps ($C_{\text{financial}} = 150,000$ tokens).
- Automatically falls back to the Free key pool or local offline models.
- Real-time USD and INR conversion ($1\text{ USD} = 84.00\text{ INR}$) displaying actual spend alongside commercial cloud value saved.

### 🧭 4. Continuous Iterative Blueprint & Dry-Run Engine
- Workspace scanner detects `CREATE` vs `MODIFY` tasks across the project.
- Automatically preserves up to 6,000 characters of existing file context for modification tasks.
- Gives developers an approval gate to review decomposition, edit implementation directives, or reassign models before any worker code generation starts.

### 📚 5. Precision Memory Snippet Engine (Knapsack Retrieval)
- Decomposes Markdown knowledge books in `.agent_memory/books/` by `##` and `###` headings into atomic recipes.
- Scores candidates using multi-signal relevance:

$$S(q, s) = 3.0 \cdot \text{Match}_{\text{heading}} + 2.5 \cdot \text{Match}_{\text{cat-book}} + 1.0 \cdot \text{Match}_{\text{body}} + 1.5 \cdot \mathbb{I}_{\text{code}}$$

- Packs recipes into model-scale parameter tiers (600 tok for 1.5B, 1200 tok for 7B/14B, 2000 tok for 32B, 3500 tok for Cloud), providing **up to 96.4% token savings**.

### 🎮 6. NVIDIA RTX 4060 8GB VRAM Arbitrator & Scavenger
- Monitors dedicated GDDR6 VRAM across 4 hardware safety zones:
  - `SAFE_GPU` ($\le 5.2\text{ GB}$): 1.5B to 7B models (Safe for multi-threaded concurrency).
  - `HIGH_LOAD` ($5.2 - 8.0\text{ GB}$): 8B to 14B models (Single-thread batch only).
  - `PAGED_HYBRID` ($8.0 - 16.0\text{ GB}$): 32B models (PCIe CPU RAM paging).
  - `OOM_HAZARDOUS` ($> 16.0\text{ GB}$): Blocked.
- One-click idle scavenging sends `keep_alive: 0` to Ollama unload APIs, returning VRAM to 8.0 GB for host tasks.

---

## 3. Comprehensive Documentation Suite

| Document | File Path | Focus & Contents |
| :--- | :--- | :--- |
| **Interactive Visual Atlas** | [`docs/architecture_atlas.html`](file:///home/assistantuser/advance_assistant/docs/architecture_atlas.html) | Single-file offline dashboard with interactive Mermaid diagrams, DFDs, ER schemas, and searchable API directory. |
| **System Architecture & Theory** | [`docs/01_SYSTEM_ARCHITECTURE_AND_THEORY.md`](file:///home/assistantuser/advance_assistant/docs/01_SYSTEM_ARCHITECTURE_AND_THEORY.md) | Dual-mode OS theory, 85% limits calculus, Two-Phase Lease math, knapsack memory, VRAM tiers, and cost formulas. |
| **Process Flows & Sequences** | [`docs/02_PROCESS_FLOWS_AND_SEQUENCES.md`](file:///home/assistantuser/advance_assistant/docs/02_PROCESS_FLOWS_AND_SEQUENCES.md) | 7 operational workflows with Mermaid sequence diagrams, state machines, and phase progression flowcharts. |
| **DFD & ER Diagrams** | [`docs/03_DFD_AND_ER_DIAGRAMS.md`](file:///home/assistantuser/advance_assistant/docs/03_DFD_AND_ER_DIAGRAMS.md) | DFD Levels 0, 1, 2, full system ER diagram, and field-by-field schema dictionary for all 9 persistent data stores. |
| **REST & WebSocket API Spec** | [`docs/04_API_AND_WEBSOCKET_SPEC.md`](file:///home/assistantuser/advance_assistant/docs/04_API_AND_WEBSOCKET_SPEC.md) | Complete developer reference covering all 35+ REST endpoints and twin WebSocket streaming protocols. |
| **Web Console Visual Guide** | [`docs/05_WEB_CONSOLE_VISUAL_GUIDE.md`](file:///home/assistantuser/advance_assistant/docs/05_WEB_CONSOLE_VISUAL_GUIDE.md) | Visual ASCII wireframes, navigation flows, and step-by-step playbooks for all 8 Web Console views. |
| **Documentation Index** | [`docs/README.md`](file:///home/assistantuser/advance_assistant/docs/README.md) | Master documentation index with quick links and chapter summaries. |

### Localized Subdirectory Guides
- **[`src/README.md`](file:///home/assistantuser/advance_assistant/src/README.md)**: Module reference for all 15 Python engine files, lock hierarchy, and CLI zero-mutation contract.
- **[`frontend/README.md`](file:///home/assistantuser/advance_assistant/frontend/README.md)**: Guide to Vite, React 18, TypeScript, Tailwind styling, and 8-page console architecture.
- **[`.agent_memory/README.md`](file:///home/assistantuser/advance_assistant/.agent_memory/README.md)**: Persistent state JSON schemas, Markdown knowledge books, and credential safety protocols.
- **[`logs/README.md`](file:///home/assistantuser/advance_assistant/logs/README.md)**: 6-stream observability directory structure, structured log formats, and WebSocket log tailing.
- **[`test/README.md`](file:///home/assistantuser/advance_assistant/test/README.md)**: Automated certification harness, state guard isolation, and subsystem test suite execution.

---

## 4. Quick-Start & Operational Guide

### Prerequisites
- **OS**: Windows 11 with WSL2 (Ubuntu 22.04 / 24.04 LTS).
- **Python**: Python 3.12+ inside WSL (`venv` enabled).
- **Node.js**: Node.js 18+ and npm.
- **GPU (Optional for Local Models)**: NVIDIA RTX GPU with CUDA support and Ollama installed.

### 1. Launch Web Dashboard (Recommended)
```bash
# In WSL2 terminal:
cd /home/assistantuser/advance_assistant
./start_dashboard.sh
```
*Or from Windows PowerShell / CMD:*
```cmd
start_dashboard.bat
```
Navigate to **`http://localhost:5173`** in your browser.

### 2. Launch Native Legacy Terminal CLI
```bash
cd /home/assistantuser/advance_assistant
./venv/bin/python3 src/main.py
```

### 3. Open Interactive Architecture Atlas Offline
Open [`docs/architecture_atlas.html`](file:///home/assistantuser/advance_assistant/docs/architecture_atlas.html) in any browser directly from disk:
```cmd
chrome.exe docs/architecture_atlas.html
```

---

## 5. Master Certification Test Matrix

Advance Assistant OS v6.0 undergoes automated testing across all 7 subsystems using `preserve_agent_memory()` to ensure zero disk pollution:

```bash
./venv/bin/python3 test/test_scripts/run_all_tests.py
```

| Suite File | Subsystem Under Test | Status | Duration | Checks Passed |
| :--- | :--- | :---: | :---: | :---: |
| **`test_hierarchical_governor.py`** | Token Governor, 85% limits, Sliding window, Atomic leases | ✅ PASS | ~1.6s | **8 / 8** |
| **`test_stage14_2_pipeline.py`** | Agent pipeline, Multi-provider key resolution, Upstream failover | ✅ PASS | ~1.1s | **6 / 6** |
| **`test_stage14_3_server.py`** | FastAPI endpoints, Health, Config, Key matrix, Quotas | ✅ PASS | ~1.6s | **8 / 8** |
| **`test_stage15_2_backend.py`** | Blueprint generation, Task approvals, Workspace scanner, Lifecycle | ✅ PASS | ~1.3s | **6 / 6** |
| **`test_v6_full_suite.py`** | Full end-to-end certification (Health, Keys, Bridge, Swarm, Logs, Memory, Sockets) | ✅ PASS | ~1.5s | **34 / 34** |
| **`test_stage16_1_quotas.py`** | Live model discovery, Recalculate 85%, Dedicated per-key quotas | ✅ PASS | ~1.8s | **4 / 4** |
| **`test_stage16_2_swarm_roster.py`**| Unified catalog API, Swarm profile roster persistence, Task distribution | ✅ PASS | ~1.2s | **4 / 4** |
| **OVERALL SYSTEM STATUS** | **Advance Assistant OS v6.0 Master Certification** | **✅ 100% PASS** | **~10.2s** | **70 / 70** |

---

## 6. License & Security Notice

- **Security Hardened**: Raw API credentials are never written to version control. Keys in `.agent_memory/api_keys.json` are git-ignored and automatically masked across all logs and API responses (`AIzaSy...4xQ1`).
- **Core CLI Invariant**: `src/main.py` is guaranteed 100% backward compatible and immutable.
