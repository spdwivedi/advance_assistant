import os
import sys

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
_scripts_dir = os.path.abspath(os.path.dirname(__file__))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from test_state_guard import preserve_agent_memory

import os
import sys
import json
import time

# Ensure project root is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.token_governor import HierarchicalTokenGovernor, TokenGovernor
from src.config import PROVIDER_QUOTAS_FILE, TOKEN_LEDGER_FILE

def run_test_suite():
    print("=" * 80)
    print(" ADVANCE ASSISTANT OS v6.0 - STAGE 14.1 HIERARCHICAL GOVERNOR TEST SUITE")
    print("=" * 80)
    
    gov = HierarchicalTokenGovernor()
    passed = 0
    total = 0

    # --------------------------------------------------------------------------
    # TEST 1: Provider Quotas File Initialization
    # --------------------------------------------------------------------------
    print("\n--- TEST 1: Provider Quotas Hierarchy Initialization ---")
    total += 1
    assert os.path.exists(PROVIDER_QUOTAS_FILE), f"Missing {PROVIDER_QUOTAS_FILE}"
    with open(PROVIDER_QUOTAS_FILE, "r", encoding="utf-8") as f:
        quotas_data = json.load(f)
    
    shield = quotas_data.get("financial_shield", {})
    providers = quotas_data.get("providers", {})
    
    assert "paid_tier_locked" in shield, "Missing paid_tier_locked in shield"
    assert "daily_paid_token_cap" in shield, "Missing daily_paid_token_cap in shield"
    assert "GOOGLE" in providers and "FREE" in providers["GOOGLE"] and "PAID" in providers["GOOGLE"], "Missing GOOGLE FREE/PAID tiers"
    assert "GROQ" in providers and "FREE" in providers["GROQ"] and "PAID" in providers["GROQ"], "Missing GROQ FREE/PAID tiers"
    assert "OLLAMA" in providers and "LOCAL" in providers["OLLAMA"], "Missing OLLAMA LOCAL tier"
    
    print(f"  [PASS] Hierarchical quota seed validated across 3 providers and 5 tiers")
    passed += 1

    # --------------------------------------------------------------------------
    # TEST 2: Atomic Pre-Request Lease Acquisition & In-Flight Concurrency
    # --------------------------------------------------------------------------
    print("\n--- TEST 2: Atomic Pre-Request Lease Acquisition & In-Flight Concurrency ---")
    total += 1
    # Model: gemini-3.1-pro-preview under GOOGLE:FREE has working RPM = 4
    gov.in_flight_leases.clear()
    bucket_key = "GOOGLE:FREE:default:gemini-3.1-pro-preview"
    gov.rolling_requests[bucket_key] = []
    gov.rolling_tokens[bucket_key] = []
    gov._last_bucket_request_time[bucket_key] = 0

    lease_results = []
    for i in range(5):
        res = gov.acquire_lease(
            model_name="gemini-3.1-pro-preview",
            prompt_text="Hello reasoning swarm worker",
            tier="FREE",
            key_id="default"
        )
        lease_results.append(res)

    # First 4 must be approved with staggered delays
    for idx in range(4):
        assert lease_results[idx]["allowed"] is True, f"Expected lease {idx+1} to be allowed"
        assert "lease_id" in lease_results[idx], f"Expected lease_id in lease {idx+1}"
    
    assert lease_results[0]["pacing_delay_s"] == 0.0, f"Expected 0.0s initial pacing delay, got {lease_results[0]['pacing_delay_s']}"
    assert lease_results[1]["pacing_delay_s"] == 15.0, f"Expected 15.0s pacing delay, got {lease_results[1]['pacing_delay_s']}"
    assert lease_results[2]["pacing_delay_s"] == 30.0, f"Expected 30.0s pacing delay, got {lease_results[2]['pacing_delay_s']}"
    assert lease_results[3]["pacing_delay_s"] == 45.0, f"Expected 45.0s pacing delay, got {lease_results[3]['pacing_delay_s']}"

    # 5th request must be blocked before any execution due to working limit RPM=4
    assert lease_results[4]["allowed"] is False, "Expected 5th lease request to be rejected due to RPM cap"
    assert lease_results[4]["reason"] == "RPM_LIMIT_EXCEEDED", f"Expected RPM_LIMIT_EXCEEDED, got {lease_results[4]['reason']}"
    print(f"  [PASS] 4 leases approved with staggered delays (0s, 15s, 30s, 45s); 5th blocked atomically")
    passed += 1

    # Cleanup the 4 acquired leases
    for idx in range(4):
        gov.release_lease(lease_results[idx]["lease_id"])
    assert len(gov.in_flight_leases) == 0, "In-flight leases not cleanly cleared"

    # --------------------------------------------------------------------------
    # TEST 3: Post-Request Exact Token Reconciliation
    # --------------------------------------------------------------------------
    print("\n--- TEST 3: Post-Request Exact Token Reconciliation (commit_lease) ---")
    total += 1
    acq = gov.acquire_lease(
        model_name="gemini-2.5-flash",
        prompt_text="Write a python quicksort",
        tier="FREE",
        key_id="default"
    )
    assert acq["allowed"] is True
    lid = acq["lease_id"]

    commit_res = gov.commit_lease(
        lease_id=lid,
        model_name="gemini-2.5-flash",
        actual_input_tokens=150,
        actual_output_tokens=420,
        actual_thinking_tokens=75,
        tier="FREE",
        key_id="default",
        project_name="stage14_cert",
        success=True
    )
    assert commit_res["reconciled"] is True
    assert commit_res["tokens_charged"] == (150 + 420 + 75)
    assert lid not in gov.in_flight_leases

    flash_bucket = "GOOGLE:FREE:default:gemini-2.5-flash"
    b_stat = gov.ledger["bucket_usage"][flash_bucket]
    assert b_stat["input_tokens_today"] >= 150
    assert b_stat["output_tokens_today"] >= 420
    assert b_stat["thinking_tokens_today"] >= 75
    assert b_stat["total_tokens_today"] >= 645

    m_stat = gov.ledger["model_usage"]["gemini-2.5-flash"]
    assert m_stat["input_tokens_today"] >= 150
    assert m_stat["output_tokens_today"] >= 420
    assert m_stat["thinking_tokens_today"] >= 75
    assert m_stat["tokens_today"] >= 645

    print(f"  [PASS] Reconciled exact tokens: In=150, Out=420, Think=75 (Total=645)")
    passed += 1

    # --------------------------------------------------------------------------
    # TEST 4: Financial Shield Locking
    # --------------------------------------------------------------------------
    print("\n--- TEST 4: Financial Shield Paid Tier Lock & Fallback Isolation ---")
    total += 1
    # Lock paid tier
    gov.update_financial_shield(paid_tier_locked=True)
    
    # 1. Paid request should be rejected immediately
    paid_req = gov.acquire_lease(model_name="gemini-3.1-pro-preview", tier="PAID")
    assert paid_req["allowed"] is False
    assert paid_req["reason"] == "PAID_TIER_LOCKED_BY_SHIELD"

    # 2. Free and Local requests should still succeed
    free_req = gov.acquire_lease(model_name="gemini-2.5-flash", tier="FREE")
    assert free_req["allowed"] is True
    gov.release_lease(free_req["lease_id"])

    local_req = gov.acquire_lease(model_name="qwen2.5-coder:32b", tier="LOCAL")
    assert local_req["allowed"] is True
    gov.release_lease(local_req["lease_id"])

    # 3. Unlock paid tier and verify paid lease works
    gov.update_financial_shield(paid_tier_locked=False)
    paid_req2 = gov.acquire_lease(model_name="gemini-3.1-pro-preview", tier="PAID")
    assert paid_req2["allowed"] is True
    gov.release_lease(paid_req2["lease_id"])

    print(f"  [PASS] Financial Shield successfully locked and unlocked PAID tier while isolating FREE & LOCAL")
    passed += 1

    # --------------------------------------------------------------------------
    # TEST 5: Dynamic Limit Updates & Hierarchy CRUD
    # --------------------------------------------------------------------------
    print("\n--- TEST 5: Dynamic Limit Updates & Hierarchy Extension ---")
    total += 1
    
    # Update existing model limits
    gov.update_model_limits(
        provider="GOOGLE",
        tier="FREE",
        model_name="gemini-2.5-flash",
        working_limits={"rpm": 14, "tpm": 220000, "rpd": 450, "max_input_tokens": 10000, "max_output_tokens": 4096, "thinking_budget": 512}
    )
    g_limits = gov.get_model_limits("GOOGLE", "FREE", "gemini-2.5-flash")
    assert g_limits["working_limits"]["rpm"] == 14
    assert g_limits["working_limits"]["tpm"] == 220000

    # Add brand new provider & model
    gov.add_or_update_provider_model(
        provider="ANTHROPIC",
        tier="PAID",
        model_name="claude-3-5-sonnet",
        strict_limits={"rpm": 50, "tpm": 100000, "rpd": 5000, "max_input_tokens": 64000, "max_output_tokens": 8192},
        working_limits={"rpm": 30, "tpm": 80000, "rpd": 3000, "max_input_tokens": 32000, "max_output_tokens": 4096, "thinking_budget": 0}
    )
    ant_limits = gov.get_model_limits("ANTHROPIC", "PAID", "claude-3-5-sonnet")
    assert ant_limits["working_limits"]["rpm"] == 30

    # Test safe concurrency calculation
    safe_conc = gov.calculate_safe_concurrency("GOOGLE", "FREE", "gemini-2.5-flash", active_keys_count=2)
    assert safe_conc == 14  # (14 * 2 / 2) = 14 workers
    
    # Check hierarchy telemetry output
    telemetry = gov.get_hierarchy_telemetry()
    assert "ANTHROPIC" in telemetry["providers"]
    assert "claude-3-5-sonnet" in telemetry["providers"]["ANTHROPIC"]["PAID"]
    
    print(f"  [PASS] Dynamic limits updated, ANTHROPIC provider registered, safe concurrency={safe_conc}")
    passed += 1

    # --------------------------------------------------------------------------
    # TEST 6: Backward Compatibility Wrappers
    # --------------------------------------------------------------------------
    print("\n--- TEST 6: Backward Compatibility Wrappers ---")
    total += 1
    
    # inspect_and_cool_allocation
    allowed_norm = gov.inspect_and_cool_allocation("gemini-3.5-flash", estimated_tokens=50000, constraining_profile="HIGH_RPM_TPM")
    assert allowed_norm is True
    
    # 85% TPM cap check
    allowed_burst = gov.inspect_and_cool_allocation("gemini-3.5-flash", estimated_tokens=1900000, constraining_profile="HIGH_RPM_TPM")
    assert allowed_burst is False

    # render_live_telemetry_snippet
    snippet = gov.render_live_telemetry_snippet("gemini-3.5-flash")
    assert "RPM:" in snippet and "TPM:" in snippet and "RPD:" in snippet
    
    # can_execute & record_execution
    assert gov.can_execute("gemini-2.5-flash-lite") is True
    rec_res = gov.record_execution("gemini-2.5-flash-lite", tokens_used=1200)
    assert rec_res["tokens_charged"] == 1200

    print(f"  [PASS] Backward-compatible inspect_and_cool_allocation, snippet, and record_execution operational")
    passed += 1

    # --------------------------------------------------------------------------
    # TEST 7: Per-Build Paid Token Cap Enforcement & Build Counter Reset
    # --------------------------------------------------------------------------
    print("\n--- TEST 7: Per-Build Paid Token Cap Enforcement & Build Counter Reset ---")
    total += 1
    gov.reset_build_counter("test_build_proj")
    assert gov.active_build_project == "test_build_proj"
    assert gov.paid_tokens_current_build == 0

    # Acquire lease for PAID tier within cap
    res = gov.acquire_lease(
        model_name="gemini-2.5-pro",
        prompt_text="test prompt",
        tier="PAID",
        key_id="default",
        requested_output_tokens=1000
    )
    assert res["allowed"] is True, f"Expected lease to succeed, got {res.get('reason')}"
    lease_id = res["lease_id"]
    gov.commit_lease(
        lease_id=lease_id,
        model_name="gemini-2.5-pro",
        actual_input_tokens=1000,
        actual_output_tokens=2000,
        actual_thinking_tokens=0,
        tier="PAID",
        success=True
    )
    assert gov.paid_tokens_current_build == 3000

    # Advance paid build tokens near cap and verify per-build cap blocks
    gov.ledger["paid_tokens_current_build"] = 145000
    res_huge = gov.acquire_lease(
        model_name="gemini-2.5-pro",
        prompt_text="Hello reasoning swarm worker",
        tier="PAID",
        key_id="default"
    )
    assert res_huge["allowed"] is False, "Expected lease to be rejected by per-build cap"
    assert res_huge["reason"] == "PER_BUILD_PAID_TOKEN_CAP_REACHED", f"Expected PER_BUILD_PAID_TOKEN_CAP_REACHED, got {res_huge.get('reason')}"

    # Reset build counter
    gov.reset_build_counter("next_proj")
    assert gov.paid_tokens_current_build == 0
    assert gov.active_build_project == "next_proj"
    print(f"  [PASS] Per-build paid token cap enforced and reset_build_counter verified")
    passed += 1
    # --------------------------------------------------------------------------
    # TEST 8: Universal Windows-to-WSL Path Normalizer
    # --------------------------------------------------------------------------
    print("\n--- TEST 8: Universal Windows-to-WSL Path Normalizer ---")
    total += 1
    from src.config import normalize_wsl_path

    p1 = normalize_wsl_path("D:/Project_Files/Assistant_Projects/TaskVault_App")
    p2 = normalize_wsl_path("C:\\Users\\ACER\\Project")
    p3 = normalize_wsl_path("/home/assistantuser/advance_assistant/D:/Project_Files/Test")
    p4 = normalize_wsl_path("")
    p5 = normalize_wsl_path(None)

    if os.name != "nt":
        assert p1 == "/mnt/d/Project_Files/Assistant_Projects/TaskVault_App", f"Unexpected p1: {p1}"
        assert p2 == "/mnt/c/Users/ACER/Project", f"Unexpected p2: {p2}"
        assert p3 == "/mnt/d/Project_Files/Test", f"Unexpected p3: {p3}"
    assert p4 == "/tmp", f"Expected /tmp for empty path, got {p4}"
    assert p5 == "/tmp", f"Expected /tmp for None, got {p5}"

    print(f"  [PASS] normalize_wsl_path successfully normalizes Windows, embedded, and empty paths")
    passed += 1

    print("\n" + "=" * 80)
    print(f" STAGE 14.1 CERTIFICATION COMPLETE: {passed}/{total} (100% PASS)")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    with preserve_agent_memory():
        run_test_suite()
