# ADVANCE ASSISTANT OS v6.0 — AUTOMATED TESTING & CERTIFICATION (`test/`)

## 1. Certification Architecture & Test Suite Inventory

Advance Assistant OS v6.0 enforces a comprehensive 7-suite master certification harness guaranteeing 100% test pass rates across all subsystems:

```
test/
└── test_scripts/
    ├── run_all_tests.py                 # Master Test Runner (Executes all 7 suites)
    ├── test_state_guard.py              # Zero-Pollution State Guard (preserve_agent_memory)
    ├── test_hierarchical_governor.py    # Suite 1: Token Governor & 85% Limits (8 checks)
    ├── test_stage14_2_pipeline.py       # Suite 2: Agent Pipeline & Multi-Key Failover (6 checks)
    ├── test_stage14_3_server.py         # Suite 3: FastAPI REST & WebSocket Endpoints (8 checks)
    ├── test_stage15_2_backend.py        # Suite 4: Blueprint Engine & Lifecycle (6 checks)
    ├── test_v6_full_suite.py            # Suite 5: Master E2E System Certification (34 checks)
    ├── test_stage16_1_quotas.py         # Suite 6: Live Model Sync & Per-Key Quotas (4 checks)
    ├── test_stage16_2_swarm_roster.py   # Suite 7: Swarm Roster Engine & Dispatcher (4 checks)
    └── ...                              # Auxiliary and stress testing scripts
```

---

## 2. Test Suite Summary Table (70 Checks Total)

| Suite File | Subsystem Under Test | Checks | Typical Duration |
| :--- | :--- | :---: | :---: |
| **`test_hierarchical_governor.py`** | Token Governor, 85% caps, Sliding 60s window, Atomic leases | 8 / 8 | ~1.6s |
| **`test_stage14_2_pipeline.py`** | Agent pipeline, Multi-provider key resolution, Upstream failover | 6 / 6 | ~1.1s |
| **`test_stage14_3_server.py`** | FastAPI endpoints, Health, Config, Key matrix, Quota endpoints | 8 / 8 | ~1.8s |
| **`test_stage15_2_backend.py`** | Blueprint generation, Task approvals, Workspace scanner, Lifecycle | 6 / 6 | ~1.4s |
| **`test_v6_full_suite.py`** | Full end-to-end certification (Health, Keys, Bridge, Swarm, Logs, Memory, Sockets) | 34 / 34 | ~2.5s |
| **`test_stage16_1_quotas.py`** | Live model discovery, Recalculate 85%, Dedicated per-key quotas | 4 / 4 | ~1.7s |
| **`test_stage16_2_swarm_roster.py`**| Unified catalog API, Swarm profile roster persistence, Task distribution | 4 / 4 | ~1.3s |
| **TOTAL CERTIFICATION** | **All 7 Core Subsystems** | **70 / 70** | **~11.5s** |

---

## 3. Zero Test Pollution Mandate (`test_state_guard.py`)

All tests must execute inside `preserve_agent_memory()`:
```python
from test.test_scripts.test_state_guard import preserve_agent_memory

def test_my_feature():
    with preserve_agent_memory():
        # Any modifications to .agent_memory/ or temporary keys
        # are completely reverted when this block exits.
        pass
```
This guarantees that automated test runs never leave mock keys, modified profiles, or dirty token ledgers on disk.

---

## 4. Execution Commands (WSL2 Ubuntu)

```bash
# Run the complete 70-check master certification harness
./venv/bin/python3 test/test_scripts/run_all_tests.py

# Run an individual test suite
./venv/bin/python3 test/test_scripts/test_stage16_2_swarm_roster.py
```\n