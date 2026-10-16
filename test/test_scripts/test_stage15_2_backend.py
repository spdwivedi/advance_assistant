import os
import sys
import json
import time
import shutil
from unittest.mock import MagicMock, patch

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
_scripts_dir = os.path.abspath(os.path.dirname(__file__))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from test_state_guard import preserve_agent_memory
from fastapi.testclient import TestClient
from src.server import app
from src.token_governor import token_governor
from src.permissions import execute_command
from src.supervisor import (
    request_build_stop, toggle_build_pause, reset_build_lifecycle,
    check_build_lifecycle, build_cancel_event, build_pause_event
)

client = TestClient(app)

PASSED = 0
FAILED = 0


def record_pass(test_name: str, detail: str = ""):
    global PASSED
    PASSED += 1
    print(f"  [PASS] {test_name}: {detail}")


def record_fail(test_name: str, error: str):
    global FAILED
    FAILED += 1
    print(f"  [FAIL] {test_name}: {error}")


def run_stage15_2_verification():
    print("=" * 80)
    print(" ADVANCE ASSISTANT OS v6.0 - STAGE 15.2 BACKEND LIFECYCLE & BLUEPRINT SUITE")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # 1. Testing Build Stop, Pause & Resume Lifecycle
    # --------------------------------------------------------------------------
    print("\n--- 1. Testing Build Stop, Pause & Resume Lifecycle Controls ---")
    try:
        reset_build_lifecycle()
        assert check_build_lifecycle() is True, "Expected unpaused and uncancelled initial lifecycle state"

        # Pause via REST
        res_pause = client.post("/api/execute/pause", json={"paused": True})
        assert res_pause.status_code == 200, f"Pause request failed: {res_pause.text}"
        data_pause = res_pause.json()
        assert data_pause.get("paused") is True, f"Expected paused=True, got {data_pause}"
        assert data_pause.get("state") == "PAUSED"
        assert not build_pause_event.is_set(), "build_pause_event should be cleared when paused"

        # Resume via REST
        res_resume = client.post("/api/execute/pause", json={"paused": False})
        assert res_resume.status_code == 200
        data_resume = res_resume.json()
        assert data_resume.get("paused") is False
        assert data_resume.get("state") == "RUNNING"
        assert build_pause_event.is_set()

        # Stop via REST
        res_stop = client.post("/api/execute/stop")
        assert res_stop.status_code == 200, f"Stop request failed: {res_stop.text}"
        data_stop = res_stop.json()
        assert data_stop.get("status") == "success"
        assert data_stop.get("state") == "CANCELLED"
        assert build_cancel_event.is_set()
        assert check_build_lifecycle() is False, "check_build_lifecycle should return False when stopped"

        # Clean reset for subsequent tests
        reset_build_lifecycle()
        assert check_build_lifecycle() is True
        record_pass("POST /api/execute/pause & stop", "Verified thread-safe pause, resume, and stop transitions")
    except Exception as exc:
        record_fail("Lifecycle Controls", str(exc))

    # --------------------------------------------------------------------------
    # 2. Testing Continuous Iterative Workspace Scanner
    # --------------------------------------------------------------------------
    print("\n--- 2. Testing Continuous Workspace Scanner ---")
    try:
        # Scan current project workspace
        res_scan = client.get("/api/workspace/scan?path=.")
        assert res_scan.status_code == 200, f"Scan failed: {res_scan.text}"
        data_scan = res_scan.json()
        assert data_scan.get("status") == "success"
        assert data_scan.get("exists") is True
        assert data_scan.get("file_count") > 0
        assert len(data_scan.get("files", [])) > 0
        assert ".py" in data_scan.get("language_breakdown", {})
        sample_file = data_scan["files"][0]
        assert "rel_path" in sample_file and "size_bytes" in sample_file and "ext" in sample_file

        # Scan non-existent directory
        res_scan_missing = client.get("/api/workspace/scan?path=/tmp/non_existent_folder_stage15_2_test")
        assert res_scan_missing.status_code == 200
        data_missing = res_scan_missing.json()
        assert data_missing.get("exists") is False
        assert data_missing.get("file_count") == 0

        record_pass("GET /api/workspace/scan", f"Discovered {data_scan['file_count']} files, language breakdown: {list(data_scan['language_breakdown'].keys())[:4]}")
    except Exception as exc:
        record_fail("GET /api/workspace/scan", str(exc))

    # --------------------------------------------------------------------------
    # 3. Testing Pre-Flight Blueprint Generator
    # --------------------------------------------------------------------------
    print("\n--- 3. Testing Pre-Flight Blueprint Generator & Preview ---")
    test_preview_ws = "/tmp/test_stage15_2_preview_ws"
    os.makedirs(test_preview_ws, exist_ok=True)
    existing_file = os.path.join(test_preview_ws, "src", "existing.py")
    os.makedirs(os.path.dirname(existing_file), exist_ok=True)
    with open(existing_file, "w", encoding="utf-8") as f:
        f.write("# existing code\ndef old_func(): pass\n")

    try:
        preview_payload = {
            "goal": "Build authentication with src/auth.py, update src/existing.py, and setup requirements.txt",
            "target_dir": test_preview_ws,
            "project_name": "preview_cert_project",
            "use_existing_context": True
        }

        mock_decomposition = (
            "Setup requirements.txt with pyjwt and cryptography\n"
            "Build src/auth.py with JWT verification middleware\n"
            "Update src/existing.py with token refresh handlers\n"
        )

        with patch("src.agent.run_agent_pipeline", return_value=mock_decomposition):
            res_prev = client.post("/api/blueprint/preview", json=preview_payload)

        assert res_prev.status_code == 200, f"Preview failed: {res_prev.text}"
        data_prev = res_prev.json()
        assert data_prev.get("status") == "success"
        bp = data_prev.get("blueprint", {})
        assert "blueprint_id" in bp
        assert bp.get("existing_files_detected") >= 1
        assert bp.get("estimated_total_tokens") > 0
        tasks = bp.get("tasks", [])
        assert len(tasks) == 3, f"Expected 3 tasks, got {len(tasks)}"

        actions_map = {t["target_file"]: t["action"] for t in tasks}
        assert actions_map.get("src/existing.py") == "MODIFY", f"Expected MODIFY for src/existing.py, got {actions_map}"
        assert actions_map.get("src/auth.py") == "CREATE", f"Expected CREATE for src/auth.py, got {actions_map}"
        assert actions_map.get("requirements.txt") == "CREATE"

        for t in tasks:
            assert "task_id" in t and "target_file" in t and "assigned_agent" in t
            assert "estimated_input_tokens" in t and "estimated_output_tokens" in t
            assert t.get("selected") is True

        # Test GET /api/blueprint/preview
        res_get_prev = client.get("/api/blueprint/preview")
        assert res_get_prev.status_code == 200
        get_bp = res_get_prev.json().get("blueprint", {})
        assert get_bp.get("blueprint_id") == bp.get("blueprint_id")

        record_pass("POST & GET /api/blueprint/preview", f"Generated blueprint '{bp['blueprint_id']}' with {len(tasks)} tasks (MODIFY: src/existing.py, CREATE: src/auth.py)")
    except Exception as exc:
        record_fail("POST /api/blueprint/preview", str(exc))
    finally:
        shutil.rmtree(test_preview_ws, ignore_errors=True)

    # --------------------------------------------------------------------------
    # 4. Testing Approved Blueprint Execution
    # --------------------------------------------------------------------------
    print("\n--- 4. Testing Approved Blueprint Execution ---")
    test_exec_ws = "/tmp/test_stage15_2_exec_ws"
    os.makedirs(test_exec_ws, exist_ok=True)
    existing_target = os.path.join(test_exec_ws, "src", "utils.py")
    os.makedirs(os.path.dirname(existing_target), exist_ok=True)
    with open(existing_target, "w", encoding="utf-8") as f:
        f.write("# existing base\ndef base(): return 1\n")

    try:
        from src.supervisor import execute_approved_blueprint

        test_tasks = [
            {
                "task_id": "task_1",
                "target_file": "src/config.txt",
                "action": "CREATE",
                "directive": "EXECUTE: WRITE_FILE: src/config.txt | API_ENV=cert_test_123",
                "selected": True
            },
            {
                "task_id": "task_2",
                "target_file": "src/utils.py",
                "action": "MODIFY",
                "directive": "EXECUTE: WRITE_FILE: src/utils.py | # existing base\ndef base(): return 1\ndef new_helper(): return 2\n",
                "selected": True
            },
            {
                "task_id": "task_3",
                "target_file": "src/ignored.txt",
                "action": "CREATE",
                "directive": "EXECUTE: WRITE_FILE: src/ignored.txt | should_not_exist",
                "selected": False
            }
        ]

        def mock_agent_exec(user_prompt, target_workspace=None, **kwargs):
            if "WRITE_FILE:" in user_prompt:
                raw = user_prompt[user_prompt.find("WRITE_FILE:"):]
                if "--- EXISTING FILE CONTENT" in raw:
                    raw = raw.split("--- EXISTING FILE CONTENT")[0].strip()
                execute_command(raw, target_dir=target_workspace, auto_approve=True)
            return "SUCCESS"

        with patch("src.supervisor.run_agent_pipeline", side_effect=mock_agent_exec), \
             patch("src.agent.run_agent_pipeline", side_effect=mock_agent_exec):
            exec_res = execute_approved_blueprint(
                tasks=test_tasks,
                target_destination=test_exec_ws,
                project_name="bp_exec_cert",
                goal="Execute approved blueprint",
                max_workers=2,
                execution_mode="HYBRID_CLOUD"
            )

        assert exec_res.get("status") == "COMPLETED", f"Blueprint execution failed: {exec_res}"
        assert exec_res.get("completed_tasks") >= 2

        # Verify files on disk
        cfg_path = os.path.join(test_exec_ws, "src", "config.txt")
        utils_path = os.path.join(test_exec_ws, "src", "utils.py")
        ignored_path = os.path.join(test_exec_ws, "src", "ignored.txt")

        assert os.path.exists(cfg_path), "src/config.txt was not created"
        with open(cfg_path, "r", encoding="utf-8") as f:
            assert "API_ENV=cert_test_123" in f.read()

        assert os.path.exists(utils_path), "src/utils.py was not updated"
        with open(utils_path, "r", encoding="utf-8") as f:
            content = f.read()
            assert "new_helper" in content

        assert not os.path.exists(ignored_path), "Unselected task src/ignored.txt was executed unexpectedly"

        record_pass("execute_approved_blueprint", "Executed approved tasks, preserved unselected task isolation, updated existing files")
    except Exception as exc:
        import traceback; traceback.print_exc(); record_fail("execute_approved_blueprint", repr(exc))

    # --------------------------------------------------------------------------
    # 5. Testing Live Workspace File Inspector
    # --------------------------------------------------------------------------
    print("\n--- 5. Testing Live Workspace File Inspector ---")
    try:
        # Valid read of created config file
        res_file = client.get(f"/api/workspace/file?workspace_dir={test_exec_ws}&file_path=src/config.txt")
        assert res_file.status_code == 200, f"File inspection failed: {res_file.text}"
        data_f = res_file.json()
        assert data_f.get("status") == "success"
        assert data_f.get("file_path") == "src/config.txt"
        assert "API_ENV=cert_test_123" in data_f.get("content", "")
        assert data_f.get("language") == "plaintext"
        assert data_f.get("line_count") >= 1
        assert data_f.get("size_bytes") > 0

        # Valid read of python utils file
        res_py = client.get(f"/api/workspace/file?workspace_dir={test_exec_ws}&file_path=src/utils.py")
        assert res_py.status_code == 200
        assert res_py.json().get("language") == "python"

        # Security check: Path traversal blocked (HTTP 400)
        res_trav = client.get(f"/api/workspace/file?workspace_dir={test_exec_ws}&file_path=../../etc/passwd")
        assert res_trav.status_code == 400, f"Expected 400 for path traversal, got {res_trav.status_code}"

        # Security check: Sensitive file blocked (HTTP 403)
        res_sec = client.get(f"/api/workspace/file?workspace_dir={test_exec_ws}&file_path=.env")
        assert res_sec.status_code == 403, f"Expected 403 for sensitive file, got {res_sec.status_code}"

        # Non-existent file (HTTP 404)
        res_404 = client.get(f"/api/workspace/file?workspace_dir={test_exec_ws}&file_path=missing_module.py")
        assert res_404.status_code == 404, f"Expected 404 for missing file, got {res_404.status_code}"

        record_pass("GET /api/workspace/file", "Inspected plaintext & python files, verified 400 traversal, 403 sensitive, 404 missing guards")
    except Exception as exc:
        record_fail("GET /api/workspace/file", str(exc))
    finally:
        shutil.rmtree(test_exec_ws, ignore_errors=True)

    # --------------------------------------------------------------------------
    # 6. Testing Real-Time Cost & Cloud Savings Estimator
    # --------------------------------------------------------------------------
    print("\n--- 6. Testing Real-Time Cost & Cloud Savings Estimator ---")
    try:
        res_cost = client.get("/api/governor/cost-estimate")
        assert res_cost.status_code == 200, f"Cost estimate failed: {res_cost.text}"
        cost_data = res_cost.json().get("cost_estimate", {})
        assert "actual_paid_spend_usd" in cost_data
        assert "actual_paid_spend_inr" in cost_data
        assert "estimated_savings_usd" in cost_data
        assert "estimated_savings_inr" in cost_data
        assert "paid_tokens_today" in cost_data
        assert "paid_tokens_current_build" in cost_data
        assert "free_and_local_tokens_today" in cost_data
        assert "breakdown_by_provider" in cost_data

        # Check inclusion in /api/governor/hierarchy
        res_hier = client.get("/api/governor/hierarchy")
        assert res_hier.status_code == 200
        assert "cost_estimate" in res_hier.json()

        # Calculation test with simulated token allocations
        with patch.dict(token_governor.ledger, {
            "paid_tokens_today": 10000,
            "paid_tokens_current_build": 5000,
            "bucket_usage": {
                "GOOGLE:PAID:test_key:gemini-2.5-pro": {
                    "input_tokens_today": 1000000,
                    "output_tokens_today": 100000,
                    "thinking_tokens_today": 0,
                    "total_tokens_today": 1100000
                },
                "GOOGLE:FREE:test_free:gemini-3.6-flash": {
                    "input_tokens_today": 2000000,
                    "output_tokens_today": 200000,
                    "thinking_tokens_today": 0,
                    "total_tokens_today": 2200000
                }
            }
        }):
            sim_calc = token_governor.get_cost_and_savings_estimate()
            # 1M pro in ($1.25) + 0.1M pro out ($0.50) = $1.75
            assert sim_calc["actual_paid_spend_usd"] == 1.75
            assert sim_calc["actual_paid_spend_inr"] == round(1.75 * 84.0, 2)
            # 2M flash in ($0.30) + 0.2M flash out ($0.12) = $0.42
            assert sim_calc["estimated_savings_usd"] == 0.42
            assert sim_calc["estimated_savings_inr"] == round(0.42 * 84.0, 2)

        record_pass("GET /api/governor/cost-estimate", f"Verified USD/INR rates, hierarchy attachment, and exact rate calculations ($1.75 spend, $0.42 savings)")
    except Exception as exc:
        record_fail("Cost Estimator", str(exc))

    print("\n" + "=" * 80)
    print(f" TOTAL TESTS: {PASSED + FAILED} | PASSED: {PASSED} | FAILED: {FAILED}")
    print("=" * 80 + "\n")
    if FAILED > 0:
        sys.exit(1)


if __name__ == "__main__":
    with preserve_agent_memory():
        run_stage15_2_verification()
