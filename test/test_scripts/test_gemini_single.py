import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.agent import run_agent_pipeline, governor, verify_action_result_offline
from src.permissions import execute_command, normalize_cross_platform_path
from src.config import TEST_DATA_DIR, WIN_TEST_DATA_DIR
from src.logger import log_action

def test_gemini_single_and_cross_platform_execution():
    print("\n--- 🧪 TEST 5: GEMINI SINGLE-MODEL E2E & CROSS-PLATFORM FILE I/O ---")
    test_context = {"project_name": "test_gemini_suite", "test_script": "test_gemini_single"}
    log_action("TEST_HARNESS", "TEST_GEMINI_SINGLE_START", test_context)

    wsl_workspace = os.path.join(TEST_DATA_DIR, "gemini_single_project")
    os.makedirs(wsl_workspace, exist_ok=True)
    
    prompt = "project:test_gemini_suite | Create a lightweight script named calc.py that prints a JSON object {\"status\": \"ok\", \"result\": 42}"
    
    print("1. Sending 1 Cloud request to Gemini using profile 'HIGH_RPM_TPM'...")
    response = run_agent_pipeline(
        user_prompt=prompt,
        tier="MID",
        target_workspace=wsl_workspace,
        mode_override="HYBRID_CLOUD",
        profile_override="BASIC",
        constraining_profile_override="HIGH_RPM_TPM",
        project_name="test_gemini_suite",
        test_name="test_gemini_single"
    )
    
    wsl_calc_file = os.path.join(wsl_workspace, "calc.py")
    if os.path.exists(wsl_calc_file):
        print(f"✅ Verified WSL file creation: {wsl_calc_file}")
        exec_out = execute_command(f"python3 {wsl_calc_file}", target_dir=wsl_workspace, auto_approve=True, test_name="test_gemini_single")
        print(f"   • WSL Execution Stdout: {exec_out.strip()}")

    win_workspace = normalize_cross_platform_path(WIN_TEST_DATA_DIR)
    print(f"\n2. Testing Cross-Platform Windows Drive Target ({WIN_TEST_DATA_DIR})...")
    
    win_calc_file = os.path.join(win_workspace, "win_calc.py")
    write_cmd = f"EXECUTE: WRITE_FILE: {win_calc_file} | import json\nprint(json.dumps({{\x22platform\x22: \x22windows\x22, \x22status\x22: \x22success\x22}}))"
    
    execute_command(write_cmd, target_dir=win_workspace, auto_approve=True, test_name="test_gemini_single")
    
    if os.path.exists(win_calc_file):
        print(f"✅ Verified Windows drive file creation: {win_calc_file}")
        win_exec_out = execute_command(f"python3 {win_calc_file}", target_dir=win_workspace, auto_approve=True, test_name="test_gemini_single")
        print(f"   • Windows Execution Stdout: {win_exec_out.strip()}")

    log_action("TEST_HARNESS", "TEST_GEMINI_SINGLE_COMPLETE", test_context)
    print("✅ Gemini Single-Model & Cross-Platform Test Complete!\n")

if __name__ == "__main__":
    test_gemini_single_and_cross_platform_execution()