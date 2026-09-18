import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.token_governor import TokenGovernor
from src.logger import log_action

def test_governor_limits():
    print("\n--- 🧪 TEST 1: TOKEN GOVERNOR & FINANCIAL SHIELD ---")
    gov = TokenGovernor()
    test_model = "gemini-3.5-flash"
    test_context = {"project_name": "test_system_suite", "test_script": "test_governor"}
    
    print(f"Testing initial allocation for {test_model}...")
    allowed_1 = gov.inspect_and_cool_allocation(test_model, estimated_tokens=100000, constraining_profile="HIGH_RPM_TPM")
    print(f"Result 1 (Normal Request): {'✅ ALLOWED' if allowed_1 else '❌ DENIED'}")
    
    print(f"Testing 85% TPM Financial Shield Cap trigger...")
    allowed_2 = gov.inspect_and_cool_allocation(test_model, estimated_tokens=1900000, constraining_profile="HIGH_RPM_TPM")
    print(f"Result 2 (Huge Token Burst): {'✅ ALLOWED' if allowed_2 else '🛡️ BLOCKED BY FINANCIAL SHIELD (EXPECTED)'}")
    
    telemetry = gov.render_live_telemetry_snippet(test_model)
    print(f"Telemetry Status: {telemetry}")
    
    log_action("TEST_HARNESS", "GOVERNOR_TEST_COMPLETE", {
        "model": test_model, 
        "blocked_properly": not allowed_2,
        "test_script": "test_governor"
    })
    print("✅ Token Governor Test Complete!\n")

if __name__ == "__main__":
    test_governor_limits()