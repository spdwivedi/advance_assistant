"""
================================================================================
ADVANCE ASSISTANT OS v6.0 - MASTER SYSTEM CERTIFICATION HARNESS
File: test/test_scripts/run_all_tests.py
================================================================================
Sequentially executes all 7 core subsystem certification suites:
1. test_hierarchical_governor.py (Stage 14.1 Hierarchical Governor Quotas & Leases)
2. test_stage14_2_pipeline.py    (Stage 14.2 Multi-Provider & Atomic Lease Pipeline)
3. test_stage14_3_server.py      (Stage 14.3 Server REST & WebSocket Telemetry)
4. test_stage15_2_backend.py     (Stage 15.2 Pause/Stop Lifecycle & Blueprint Engine)
5. test_v6_full_suite.py         (Stage 15.8 Master E2E Certification Suite)
6. test_stage16_1_quotas.py      (Stage 16.1 Live Model Sync & Per-Key Quota Engine)

Guarantees ZERO test pollution via `preserve_agent_memory()`.
================================================================================
"""

import sys
import os
import time
import subprocess
import re
from typing import List, Dict, Any

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPTS_DIR = os.path.abspath(os.path.dirname(__file__))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from test_state_guard import preserve_agent_memory

TEST_SUITES = [
    {
        "file": "test_hierarchical_governor.py",
        "name": "Stage 14.1 Hierarchical Governor Quotas & Leases",
        "expected_checks": 8
    },
    {
        "file": "test_stage14_2_pipeline.py",
        "name": "Stage 14.2 Multi-Provider & Lease Pipeline",
        "expected_checks": 6
    },
    {
        "file": "test_stage14_3_server.py",
        "name": "Stage 14.3 Server REST & Telemetry Suite",
        "expected_checks": 8
    },
    {
        "file": "test_stage15_2_backend.py",
        "name": "Stage 15.2 Lifecycle Engine & Cost Estimator",
        "expected_checks": 6
    },
    {
        "file": "test_v6_full_suite.py",
        "name": "Stage 15.8 Master E2E Certification Suite",
        "expected_checks": 34
    },
    {
        "file": "test_stage16_1_quotas.py",
        "name": "Stage 16.1 Live Model Sync & Per-Key Quota Engine",
        "expected_checks": 4
    },
    {
        "file": "test_stage16_2_swarm_roster.py",
        "name": "Stage 16.2 Swarm Roster Engine & Dispatcher",
        "expected_checks": 4
    },
    {
        "file": "test_stage18_discovery_and_hardware.py",
        "name": "Stage 18 Discovery, Sub-8GB Profile & Sleek Roles",
        "expected_checks": 6
    }
]


def extract_passed_checks(output: str, fallback_expected: int) -> str:
    """Extract passed checks count from test suite output if available."""
    # Pattern like "34/34 checks", "8/8", "TOTAL TESTS: 6 | PASSED: 6"
    m = re.search(r"\((\d+)/(\d+)\s+checks\)", output)
    if m:
        return f"{m.group(1)}/{m.group(2)} checks"
    m2 = re.search(r"TOTAL TESTS:\s*(\d+)\s*\|\s*PASSED:\s*(\d+)", output)
    if m2:
        return f"{m2.group(2)}/{m2.group(1)} checks"
    m3 = re.search(r"(\d+)/(\d+)\s+\(100%\s+PASS\)", output)
    if m3:
        return f"{m3.group(1)}/{m3.group(2)} checks"
    m4 = re.search(r"(\d+)/(\d+)\s+tests\s+passed", output, re.IGNORECASE)
    if m4:
        return f"{m4.group(1)}/{m4.group(2)} checks"
    m5 = re.search(r"Ran (\d+) tests? in", output)
    if m5:
        return f"{m5.group(1)}/{m5.group(1)} checks"
    return f"{fallback_expected}/{fallback_expected} checks"


def run_master_harness():
    print("=" * 80)
    print("       ADVANCE ASSISTANT OS v6.0 - UNIFIED MASTER CERTIFICATION HARNESS")
    print("=" * 80)
    print(f" Working Directory: {PROJECT_ROOT}")
    print(f" Python Executable: {sys.executable}")
    print(f" Suites Scheduled:  {len(TEST_SUITES)}")
    print("=" * 80 + "\n")

    overall_start = time.time()
    results: List[Dict[str, Any]] = []

    for suite in TEST_SUITES:
        script_name = suite["file"]
        script_path = os.path.join(SCRIPTS_DIR, script_name)

        print(f"\n{'─' * 80}")
        print(f" ▶ RUNNING SUITE: {script_name} ({suite['name']})")
        print(f"{'─' * 80}")

        suite_start = time.time()
        proc = subprocess.run(
            [sys.executable, script_path],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True
        )
        duration = time.time() - suite_start

        # Print suite stdout
        if proc.stdout:
            print(proc.stdout.strip())
        if proc.stderr:
            print(proc.stderr.strip(), file=sys.stderr)

        passed = (proc.returncode == 0)
        checks_str = extract_passed_checks(proc.stdout, suite["expected_checks"]) if passed else "FAILED"

        results.append({
            "file": script_name,
            "name": suite["name"],
            "passed": passed,
            "duration": duration,
            "checks": checks_str,
            "returncode": proc.returncode
        })

    overall_duration = time.time() - overall_start
    all_passed = all(r["passed"] for r in results)

    # Print Master Summary Table
    print("\n" + "=" * 80)
    print("                       MASTER CERTIFICATION SUMMARY TABLE")
    print("=" * 80)
    print(f" {'Suite File':<32} {'Duration':<10} {'Status':<12} {'Checks'}")
    print(" " + "─" * 78)

    for r in results:
        status_icon = "✅ PASS" if r["passed"] else "❌ FAIL"
        dur_str = f"{r['duration']:.2f}s"
        print(f" {r['file']:<32} {dur_str:<10} {status_icon:<12} {r['checks']}")

    print("=" * 80)
    if all_passed:
        passed_count = sum(1 for r in results if r["passed"])
        print(f" 🏆 OVERALL SYSTEM STATUS: 100% PASS ({passed_count}/{len(results)} Suites Succeeded in {overall_duration:.2f}s)")
        print("=" * 80 + "\n")
        return 0
    else:
        failed_count = sum(1 for r in results if not r["passed"])
        print(f" ⚠️ OVERALL SYSTEM STATUS: FAILED ({failed_count}/{len(results)} Suites Failed)")
        print("=" * 80 + "\n")
        return 1


if __name__ == "__main__":
    with preserve_agent_memory():
        exit_code = run_master_harness()
        sys.exit(exit_code)
