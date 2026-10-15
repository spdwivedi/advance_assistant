"""
================================================================================
ADVANCE ASSISTANT OS v6.0 - END-TO-END CERTIFICATION TEST SUITE
File: test/test_scripts/test_v6_full_suite.py
================================================================================
Comprehensive test suite certifying every subsystem across Stages 1 through 13:
1. Core Health & Configuration Endpoints
2. Multi-Key Matrix & Routing Policies
3. Testing Bridge Adapter & VRAM Arbitrator
4. Swarm Profiles & Concurrency Scaling
5. Multi-Stream Log Center & Path Traversal Guard
6. Precision Memory Snippet Engine & Book CRUD Roundtrip
7. Dual WebSocket Streams (/ws/telemetry & /ws/logs)
================================================================================
"""

import sys
import os
import time
import threading
from typing import Dict, Any

# Ensure project root is on Python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
os.chdir(PROJECT_ROOT)

import src.key_manager
src.key_manager._KEY_LOCK = threading.RLock()

from fastapi.testclient import TestClient
from src.server import app

client = TestClient(app)

TOTAL_ASSERTIONS = 0
PASSED_ASSERTIONS = 0


def record_pass(test_name: str, detail: str = ""):
    global TOTAL_ASSERTIONS, PASSED_ASSERTIONS
    TOTAL_ASSERTIONS += 1
    PASSED_ASSERTIONS += 1
    msg = f"  [PASS] {test_name}"
    if detail:
        msg += f" -> {detail}"
    print(msg)


def record_fail(test_name: str, error: str):
    global TOTAL_ASSERTIONS
    TOTAL_ASSERTIONS += 1
    print(f"  [FAIL] {test_name} -> {error}")
    raise AssertionError(f"{test_name} FAILED: {error}")


def test_core_health_and_config():
    print("\n--- 1. Testing Core Health & Configuration Endpoints ---")
    
    # 1.1 GET /api/health
    res = client.get("/api/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data.get("status") == "healthy", f"Status not healthy: {data}"
    assert data.get("service") == "advance_assistant_web_bridge"
    assert data.get("version") == "6.0.0"
    assert "orchestrator_model" in data and data["orchestrator_model"]
    assert "worker_model" in data and data["worker_model"]
    assert "active_swarm_id" in data
    assert "max_concurrency_workers" in data
    assert "key_pool" in data and "total_keys" in data["key_pool"]
    record_pass("GET /api/health", f"active_swarm={data['active_swarm_id']}, orch={data['orchestrator_model']}, workers={data['max_concurrency_workers']}")

    # 1.2 GET /api/config
    res = client.get("/api/config")
    assert res.status_code == 200
    cfg = res.json()
    assert "execution_modes" in cfg and len(cfg["execution_modes"]) >= 5
    assert "research_profiles" in cfg
    assert "tier_pools" in cfg
    assert "models" in cfg and len(cfg["models"]) > 0
    assert "defaults" in cfg and "max_swarm_workers" in cfg["defaults"]
    record_pass("GET /api/config", f"{len(cfg['execution_modes'])} modes, {len(cfg['models'])} models registered")

    # 1.3 GET /api/history
    res = client.get("/api/history")
    assert res.status_code == 200
    hist = res.json()
    assert "history" in hist
    assert "last_location" in hist
    assert "knowledge_telemetry" in hist
    record_pass("GET /api/history", f"last_loc='{hist['last_location']}'")

    # 1.4 GET /api/telemetry
    res = client.get("/api/telemetry")
    assert res.status_code == 200
    telem = res.json()
    assert "models" in telem and len(telem["models"]) > 0
    assert "snippets" in telem
    record_pass("GET /api/telemetry", f"{len(telem['models'])} telemetry models monitored")


def test_multi_key_matrix_and_policies():
    print("\n--- 2. Testing Multi-Key Matrix & Routing Policies ---")

    # 2.1 GET /api/keys
    res = client.get("/api/keys")
    assert res.status_code == 200
    kdata = res.json()
    assert "keys" in kdata and isinstance(kdata["keys"], list)
    policy = kdata.get("routing_policy") or kdata.get("routing_status", {}).get("routing_policy")
    assert policy is not None
    record_pass("GET /api/keys", f"{len(kdata['keys'])} keys in matrix, policy={policy}")

    # 2.2 GET /api/keys/policy
    res = client.get("/api/keys/policy")
    assert res.status_code == 200
    pdata = res.json()
    original_policy = pdata.get("routing_policy", "GLOBAL_HYBRID")
    assert pdata.get("status") == "success"
    record_pass("GET /api/keys/policy", f"initial policy={original_policy}")

    # 2.3 POST /api/keys/policy (Switch to FREE_POOL and revert)
    res_set = client.post("/api/keys/policy", json={"policy": "FREE_POOL"})
    assert res_set.status_code == 200
    assert res_set.json().get("policy") == "FREE_POOL"
    record_pass("POST /api/keys/policy", "Switched to FREE_POOL")

    # Revert to original
    res_revert = client.post("/api/keys/policy", json={"policy": original_policy})
    assert res_revert.status_code == 200
    assert res_revert.json().get("policy") == original_policy
    record_pass("POST /api/keys/policy (Revert)", f"Reverted to {original_policy}")


def test_testing_bridge_and_vram_arbitrator():
    print("\n--- 3. Testing Bridge Adapter & VRAM Arbitrator ---")

    # 3.1 GET /api/bridge/status
    res = client.get("/api/bridge/status")
    assert res.status_code == 200
    bdata = res.json()
    assert bdata.get("status") == "success"
    assert "connected" in bdata and bdata["connected"] is True
    assert "root_path" in bdata and bdata["root_path"]
    record_pass("GET /api/bridge/status", f"connected={bdata['connected']}, root={bdata['root_path']}")

    # 3.2 GET /api/bridge/models
    res = client.get("/api/bridge/models")
    assert res.status_code == 200
    mdata = res.json()
    assert mdata.get("status") == "success"
    models = mdata.get("models", [])
    assert len(models) >= 10, f"Expected at least 10 model profiles, got {len(models)}"
    assert "best_in_class" in mdata
    assert "cloud_quotas" in mdata
    record_pass("GET /api/bridge/models", f"{len(models)} model profiles loaded with capability matrices")

    # 3.3 GET /api/bridge/vram
    res = client.get("/api/bridge/vram")
    assert res.status_code == 200
    vdata = res.json()
    assert vdata.get("status") == "success"
    vram = vdata.get("vram", {})
    assert "budget_gb" in vram and "used_gb" in vram and "available_gb" in vram
    record_pass("GET /api/bridge/vram", f"Budget: {vram.get('budget_gb')}GB, Used: {vram.get('used_gb')}GB, Free: {vram.get('available_gb')}GB")

    # 3.4 GET /api/bridge/ollama/tags
    res = client.get("/api/bridge/ollama/tags")
    assert res.status_code == 200
    tdata = res.json()
    assert "models" in tdata and isinstance(tdata["models"], list)
    record_pass("GET /api/bridge/ollama/tags", f"{len(tdata['models'])} offline installed tags discovered")


def test_swarm_profiles_and_concurrency_scaling():
    print("\n--- 4. Testing Swarm Profiles & Concurrency Scaling ---")

    # 4.1 GET /api/swarms/profiles
    res = client.get("/api/swarms/profiles")
    assert res.status_code == 200
    original_swarms = res.json()
    assert "active_swarm_id" in original_swarms
    assert "orchestrator_engine" in original_swarms
    assert "max_concurrency_workers" in original_swarms
    orig_workers = original_swarms["max_concurrency_workers"]
    record_pass("GET /api/swarms/profiles", f"active_swarm={original_swarms['active_swarm_id']}, workers={orig_workers}")

    # 4.2 POST /api/swarms/profiles with 12-worker burst test
    burst_payload = dict(original_swarms)
    burst_payload["max_concurrency_workers"] = 12
    res_burst = client.post("/api/swarms/profiles", json=burst_payload)
    assert res_burst.status_code == 200
    assert res_burst.json().get("status") == "success"

    # Verify /api/health reflects 12 workers
    res_h = client.get("/api/health")
    assert res_h.status_code == 200
    assert res_h.json().get("max_concurrency_workers") == 12
    record_pass("POST /api/swarms/profiles (12-Worker Burst)", "Verified health telemetry scaled to 12 workers")

    # 4.3 Restore original swarm configuration
    res_restore = client.post("/api/swarms/profiles", json=original_swarms)
    assert res_restore.status_code == 200
    res_h2 = client.get("/api/health")
    assert res_h2.json().get("max_concurrency_workers") == orig_workers
    record_pass("POST /api/swarms/profiles (Restoration)", f"Restored max workers to {orig_workers}")


def test_multi_stream_log_center_and_security():
    print("\n--- 5. Testing Multi-Stream Log Center & Path Traversal Guard ---")

    # 5.1 GET /api/logs/sources
    res = client.get("/api/logs/sources")
    assert res.status_code == 200
    sdata = res.json()
    assert sdata.get("status") == "success"
    sources = sdata.get("sources", {})
    assert "master" in sources
    assert "categories" in sources
    assert "models" in sources
    record_pass("GET /api/logs/sources", f"{len(sources.get('categories', []))} category streams, {len(sources.get('models', []))} model logs")

    # 5.2 GET /api/logs/query with limits
    res_q = client.get("/api/logs/query", params={"source_type": "master", "limit": 20})
    assert res_q.status_code == 200
    qdata = res_q.json()
    assert "entries" in qdata and isinstance(qdata["entries"], list)
    assert "facets" in qdata
    record_pass("GET /api/logs/query (Master Stream)", f"Retrieved {len(qdata['entries'])} entries, total={qdata.get('total')}")

    # 5.3 GET /api/logs/query with severity filter
    res_sev = client.get("/api/logs/query", params={"source_type": "master", "severity": "INFO", "limit": 10})
    assert res_sev.status_code == 200
    s_entries = res_sev.json().get("entries", [])
    for entry in s_entries:
        assert entry.get("severity") == "INFO"
    record_pass("GET /api/logs/query (Severity Filter)", f"All {len(s_entries)} entries matched severity='INFO'")

    # 5.4 Path Traversal Guard (Must return HTTP 400 for ../../etc/passwd)
    res_traversal1 = client.get("/api/logs/query", params={"source_type": "projects", "source_name": "../../etc/passwd"})
    assert res_traversal1.status_code == 400, f"Expected 400, got {res_traversal1.status_code}"
    assert "Path traversal forbidden" in res_traversal1.text

    res_traversal2 = client.get("/api/logs/query", params={"source_type": "master", "source_name": "../../etc/passwd"})
    assert res_traversal2.status_code == 400, f"Expected 400, got {res_traversal2.status_code}"
    assert "Path traversal forbidden" in res_traversal2.text
    record_pass("Security Guard: Path Traversal Rejected", "Both query sources rejected '../../etc/passwd' with HTTP 400")


def test_precision_memory_snippet_engine_and_crud():
    print("\n--- 6. Testing Precision Memory Snippet Engine & Book CRUD ---")

    # 6.1 GET /api/memory/books
    res = client.get("/api/memory/books")
    assert res.status_code == 200
    bdata = res.json()
    assert bdata.get("status") == "success"
    assert "books" in bdata and len(bdata["books"]) >= 1
    assert "total_tokens" in bdata and bdata["total_tokens"] > 0
    record_pass("GET /api/memory/books", f"{bdata['total_books']} books loaded, {bdata['total_tokens']} total estimated tokens")

    # 6.2 POST /api/memory/simulate-injection
    sim_payload = {
        "prompt": "Build an async FastAPI service with SQLAlchemy asyncpg and JWT authentication",
        "model_name": "qwen2.5-coder:7b",
        "token_budget": 1200
    }
    res_sim = client.post("/api/memory/simulate-injection", json=sim_payload)
    assert res_sim.status_code == 200
    sim = res_sim.json()
    assert sim.get("status") == "success"
    assert sim.get("injected_tokens", 0) <= 1200
    assert len(sim.get("matched_snippets", [])) > 0
    assert sim.get("tokens_saved", 0) > 0
    record_pass("POST /api/memory/simulate-injection", f"Injected {sim['injected_tokens']}/1200 tok, {len(sim['matched_snippets'])} snippets, saved {sim['tokens_saved']} tok ({sim.get('token_savings_percent')})")

    # 6.3 Non-Destructive Book CRUD Roundtrip
    test_cat = "coding"
    test_bname = "cert_test_suite_book.md"

    # Step A: Create Book
    create_payload = {
        "category": test_cat,
        "book_name": test_bname,
        "content": "# E2E Certification Book\n\n## Section 1: Architecture\nOperational guidelines for multi-agent swarm.\n\n```python\ndef get_cert_status():\n    return 'CERTIFIED_V6'\n```\n",
        "tags": ["certification", "e2e_test"]
    }
    res_create = client.post("/api/memory/book", json=create_payload)
    assert res_create.status_code == 200
    assert res_create.json().get("status") == "success"
    record_pass("POST /api/memory/book (Create)", f"Created '{test_bname}' in category '{test_cat}'")

    # Step B: Read Book and inspect parsed sections
    res_read = client.get(f"/api/memory/book/{test_cat}/{test_bname}")
    assert res_read.status_code == 200
    book_obj = res_read.json().get("book", res_read.json())
    sections = book_obj.get("sections", [])
    assert len(sections) >= 1
    assert any(s.get("has_code") is True for s in sections)
    record_pass("GET /api/memory/book/{cat}/{bname} (Read)", f"Parsed {len(sections)} discrete sections with code block detection")

    # Step C: Append Operation Recipe
    recipe_payload = {
        "category": test_cat,
        "book_name": test_bname,
        "title": "E2E Automated Verification Recipe",
        "insight": "Run all testClient checks before production release.",
        "code_snippet": "pytest.main(['-q', 'test_v6_full_suite.py'])",
        "tags": ["verification", "recipe"]
    }
    res_recipe = client.post("/api/memory/book/recipe", json=recipe_payload)
    assert res_recipe.status_code == 200
    assert res_recipe.json().get("status") == "success"
    record_pass("POST /api/memory/book/recipe (Append)", "Appended operational recipe block")

    # Step D: Delete Book
    res_del = client.delete(f"/api/memory/book/{test_cat}/{test_bname}")
    assert res_del.status_code == 200
    assert res_del.json().get("status") == "success"
    record_pass("DELETE /api/memory/book/{cat}/{bname} (Delete)", "Deleted temporary certification book")

    # Step E: Verify deletion (404)
    res_404 = client.get(f"/api/memory/book/{test_cat}/{test_bname}")
    assert res_404.status_code == 404
    record_pass("Verify Deletion (404 Not Found)", "Clean removal verified from catalog and disk")


def test_dual_websocket_streams():
    print("\n--- 7. Testing Dual WebSocket Streams ---")

    # 7.1 WebSocket /ws/telemetry
    try:
        with client.websocket_connect("/ws/telemetry") as ws:
            frame = ws.receive_json()
            assert "execution_state" in frame
            assert "swarm_registry" in frame
            assert "quotas" in frame
            assert "knowledge_telemetry" in frame
            assert "key_pool" in frame
            assert "timestamp" in frame
            record_pass("WebSocket /ws/telemetry", f"Received initial telemetry frame: {list(frame.keys())}")
    except Exception as exc:
        record_fail("WebSocket /ws/telemetry", str(exc))

    # 7.2 WebSocket /ws/logs
    try:
        with client.websocket_connect("/ws/logs?source_type=master") as ws:
            frame = ws.receive_json()
            assert frame.get("type") in ["initial_batch", "heartbeat"]
            if frame.get("type") == "initial_batch":
                assert "entries" in frame
                assert "total_file_lines" in frame or "total_lines" in frame
                record_pass("WebSocket /ws/logs", f"Received '{frame.get('type')}' frame with {len(frame.get('entries', []))} initial log entries")
            else:
                record_pass("WebSocket /ws/logs", f"Received '{frame.get('type')}' frame")
    except Exception as exc:
        record_fail("WebSocket /ws/logs", str(exc))


def main():
    print("=" * 80)
    print(" ADVANCE ASSISTANT OS v6.0 - AUTOMATED E2E SYSTEM CERTIFICATION SUITE")
    print("=" * 80)
    start_time = time.time()

    test_core_health_and_config()
    test_multi_key_matrix_and_policies()
    test_testing_bridge_and_vram_arbitrator()
    test_swarm_profiles_and_concurrency_scaling()
    test_multi_stream_log_center_and_security()
    test_precision_memory_snippet_engine_and_crud()
    test_dual_websocket_streams()

    duration = time.time() - start_time
    print("\n" + "=" * 80)
    print(f" CERTIFICATION COMPLETE: 100% PASS ({PASSED_ASSERTIONS}/{TOTAL_ASSERTIONS} checks) in {duration:.2f}s")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
