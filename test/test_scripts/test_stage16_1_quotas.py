"""
Unit and Integration Test Suite: Stage 16.1 Quota Engine & Model Sync
Validates:
1. Exact 85% working limit calculations across Google Free/Paid, Groq, and Ollama.
2. POST /api/governor/sync-models and POST /api/governor/recalculate-85.
3. Dedicated Per-Key Quota Isolation: Exhausting Key_1's 85% RPM on gemini-2.5-pro while Key_2 remains 100% available.
4. Per-Key Custom Limit Overrides and Quota Telemetry via POST /api/keys/{key_id}/limits & GET /api/keys/{key_id}/quotas.
5. Zero test pollution via `preserve_agent_memory()`.
"""

import os
import sys
import unittest
from pathlib import Path

# Add repo root to sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Import State Guard for Zero Test Pollution
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_state_guard import preserve_agent_memory

from fastapi.testclient import TestClient
from src.config import compute_working_limits, DEFAULT_PROVIDER_QUOTAS
from src.key_manager import key_manager
from src.token_governor import token_governor
from src.server import app


class TestStage161Quotas(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_exact_85_percent_limit_math(self):
        """Verifies exact 85% working limit calculation across all primary models."""
        # 1. gemini-2.5-pro (FREE)
        strict_25_pro = {"rpm": 5, "tpm": 250000, "rpd": 100, "max_input_tokens": 32768, "max_output_tokens": 8192}
        w_25_pro = compute_working_limits(strict_25_pro, 85, 2048)
        self.assertEqual(w_25_pro["rpm"], 4)
        self.assertEqual(w_25_pro["tpm"], 212500)
        self.assertEqual(w_25_pro["rpd"], 85)
        self.assertEqual(w_25_pro["max_input_tokens"], 27852)
        self.assertEqual(w_25_pro["max_output_tokens"], 6963)
        self.assertEqual(w_25_pro["thinking_budget"], 2048)

        # 2. gemini-3.1-pro-preview (FREE)
        strict_31_pro = {"rpm": 5, "tpm": 250000, "rpd": 50, "max_input_tokens": 32768, "max_output_tokens": 8192}
        w_31_pro = compute_working_limits(strict_31_pro, 85, 2048)
        self.assertEqual(w_31_pro["rpm"], 4)
        self.assertEqual(w_31_pro["tpm"], 212500)
        self.assertEqual(w_31_pro["rpd"], 42)
        self.assertEqual(w_31_pro["thinking_budget"], 2048)

        # 3. gemini-2.5-flash (FREE)
        strict_25_flash = {"rpm": 10, "tpm": 250000, "rpd": 250, "max_input_tokens": 32768, "max_output_tokens": 8192}
        w_25_flash = compute_working_limits(strict_25_flash, 85, 512)
        self.assertEqual(w_25_flash["rpm"], 8)
        self.assertEqual(w_25_flash["tpm"], 212500)
        self.assertEqual(w_25_flash["rpd"], 212)
        self.assertEqual(w_25_flash["thinking_budget"], 512)

        # 4. gemini-3.6-flash (FREE)
        strict_36_flash = {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192}
        w_36_flash = compute_working_limits(strict_36_flash, 85, 512)
        self.assertEqual(w_36_flash["rpm"], 12)
        self.assertEqual(w_36_flash["tpm"], 212500)
        self.assertEqual(w_36_flash["rpd"], 425)

        # 5. gemini-2.0-flash (FREE)
        strict_20_flash = {"rpm": 15, "tpm": 1000000, "rpd": 1500, "max_input_tokens": 32768, "max_output_tokens": 8192}
        w_20_flash = compute_working_limits(strict_20_flash, 85, 0)
        self.assertEqual(w_20_flash["rpm"], 12)
        self.assertEqual(w_20_flash["tpm"], 850000)
        self.assertEqual(w_20_flash["rpd"], 1275)

        # 6. gemini-2.0-flash-lite (FREE)
        strict_20_lite = {"rpm": 30, "tpm": 1000000, "rpd": 1500, "max_input_tokens": 32768, "max_output_tokens": 8192}
        w_20_lite = compute_working_limits(strict_20_lite, 85, 0)
        self.assertEqual(w_20_lite["rpm"], 25)
        self.assertEqual(w_20_lite["tpm"], 850000)
        self.assertEqual(w_20_lite["rpd"], 1275)

        # 7. gemma-3-27b-it (FREE)
        strict_gemma = {"rpm": 30, "tpm": 15000, "rpd": 14400, "max_input_tokens": 8192, "max_output_tokens": 4096}
        w_gemma = compute_working_limits(strict_gemma, 85, 0)
        self.assertEqual(w_gemma["rpm"], 25)
        self.assertEqual(w_gemma["tpm"], 12750)
        self.assertEqual(w_gemma["rpd"], 12240)
        self.assertEqual(w_gemma["max_input_tokens"], 6963)
        self.assertEqual(w_gemma["max_output_tokens"], 3481)

        # 8. gemini-2.5-pro (PAID)
        strict_paid_pro = {"rpm": 150, "tpm": 2000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192}
        w_paid_pro = compute_working_limits(strict_paid_pro, 85, 2048)
        self.assertEqual(w_paid_pro["rpm"], 127)
        self.assertEqual(w_paid_pro["tpm"], 1700000)
        self.assertEqual(w_paid_pro["rpd"], 8500)
        self.assertEqual(w_paid_pro["max_input_tokens"], 108800)
        self.assertEqual(w_paid_pro["max_output_tokens"], 6963)

        # 9. gemini-2.5-flash-lite (PAID)
        strict_paid_lite = {"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192}
        w_paid_lite = compute_working_limits(strict_paid_lite, 85, 0)
        self.assertEqual(w_paid_lite["rpm"], 3400)
        self.assertEqual(w_paid_lite["tpm"], 3400000)
        self.assertEqual(w_paid_lite["rpd"], 127500)
        self.assertEqual(w_paid_lite["max_input_tokens"], 54400)

        # 10. Local Ollama & Groq
        strict_ol_32b = {"rpm": 60, "tpm": 500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}
        w_ol_32b = compute_working_limits(strict_ol_32b, 85, 0)
        self.assertEqual(w_ol_32b["rpm"], 51)
        self.assertEqual(w_ol_32b["tpm"], 425000)

    def test_02_sync_models_and_recalculate_endpoints(self):
        """Verifies POST /api/governor/sync-models and POST /api/governor/recalculate-85."""
        # 1. Sync live & offline models
        resp_sync = self.client.post("/api/governor/sync-models")
        self.assertEqual(resp_sync.status_code, 200)
        sync_data = resp_sync.json()
        self.assertEqual(sync_data.get("status"), "success")
        self.assertGreaterEqual(sync_data.get("google_free_count", 0), 12)
        self.assertGreaterEqual(sync_data.get("google_paid_count", 0), 11)
        self.assertGreaterEqual(sync_data.get("groq_count", 0), 4)
        self.assertGreaterEqual(sync_data.get("ollama_count", 0), 8)
        self.assertEqual(sync_data.get("margin_applied_pct"), 85)

        # 2. Recalculate working limits with custom margin then reset
        resp_recalc_80 = self.client.post("/api/governor/recalculate-85", json={"margin_pct": 80})
        self.assertEqual(resp_recalc_80.status_code, 200)
        self.assertEqual(resp_recalc_80.json().get("margin_pct"), 80)

        # Reset to 85%
        resp_recalc_85 = self.client.post("/api/governor/recalculate-85", json={"margin_pct": 85})
        self.assertEqual(resp_recalc_85.status_code, 200)
        self.assertEqual(resp_recalc_85.json().get("margin_pct"), 85)
        self.assertEqual(resp_recalc_85.json()["hierarchy"]["financial_shield"]["safety_margin_percent"], 85)

    def test_03_dedicated_per_key_quota_isolation(self):
        """
        Verifies strict per-key sliding window isolation:
        Key_1 exhausts its 85% working RPM (4 RPM) on gemini-2.5-pro,
        while Key_2 still has 100% of its own 85% working RPM available.
        """
        token_governor.reload_state()

        # Register Key_1 and Key_2
        k1 = key_manager.add_key(key_str="AIzaSyKey1_IsolationTest_001", tier="FREE", label="Key_1 Isolation", provider="GOOGLE")
        k2 = key_manager.add_key(key_str="AIzaSyKey2_IsolationTest_002", tier="FREE", label="Key_2 Isolation", provider="GOOGLE")

        k1_id = k1["id"]
        k2_id = k2["id"]

        # gemini-2.5-pro has working RPM = 4
        # Key 1 acquires 4 leases: all must succeed
        leases_k1 = []
        for i in range(4):
            res = token_governor.acquire_lease(
                model_name="gemini-2.5-pro",
                prompt_text="Hello test prompt",
                provider="GOOGLE",
                tier="FREE",
                key_id=k1_id
            )
            self.assertTrue(res.get("allowed"), f"Key 1 lease {i+1} should be allowed")
            leases_k1.append(res["lease_id"])

        # Key 1 attempts 5th lease: must fail due to RPM ceiling (4)
        res_fail_k1 = token_governor.acquire_lease(
            model_name="gemini-2.5-pro",
            prompt_text="Hello overflow prompt",
            provider="GOOGLE",
            tier="FREE",
            key_id=k1_id
        )
        self.assertFalse(res_fail_k1.get("allowed"), "Key 1 should be exhausted on 5th request")
        self.assertEqual(res_fail_k1.get("reason"), "RPM_LIMIT_EXCEEDED")

        # Now test Key 2: Key 2 must NOT be impacted by Key 1's exhaustion!
        res_k2 = token_governor.acquire_lease(
            model_name="gemini-2.5-pro",
            prompt_text="Hello independent prompt",
            provider="GOOGLE",
            tier="FREE",
            key_id=k2_id
        )
        self.assertTrue(res_k2.get("allowed"), "Key 2 must have 100% of its own working RPM available")

        # Release in-flight leases
        for lid in leases_k1:
            token_governor.release_lease(lid)
        token_governor.release_lease(res_k2["lease_id"])

    def test_04_per_key_custom_limit_overrides(self):
        """Verifies setting custom per-key limits and checking quota telemetry endpoints."""
        k = key_manager.add_key(key_str="AIzaSyCustom_TestKey_003", tier="FREE", label="Key Custom Override", provider="GOOGLE")
        key_id = k["id"]

        # Set dedicated custom limit override on gemini-2.5-pro for this specific key
        custom_working = {
            "rpm": 2,
            "tpm": 100000,
            "rpd": 20,
            "max_input_tokens": 8000,
            "max_output_tokens": 2048,
            "thinking_budget": 512
        }
        resp = self.client.post(
            f"/api/keys/{key_id}/limits",
            json={
                "model_name": "gemini-2.5-pro",
                "working_limits": custom_working,
                "safety_margin_percent": 80
            }
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "success")

        # Verify through GET /api/keys/{key_id}/quotas
        resp_q = self.client.get(f"/api/keys/{key_id}/quotas")
        self.assertEqual(resp_q.status_code, 200)
        telemetry = resp_q.json().get("telemetry", {})
        self.assertEqual(telemetry.get("safety_margin_percent"), 80)
        self.assertIn("gemini-2.5-pro", telemetry.get("models", {}))

        model_tel = telemetry["models"]["gemini-2.5-pro"]
        self.assertTrue(model_tel.get("has_custom_override"))
        self.assertEqual(model_tel.get("working_limits", {}).get("rpm"), 2)

        # Verify GET /api/keys/quotas includes this key
        resp_all = self.client.get("/api/keys/quotas")
        self.assertEqual(resp_all.status_code, 200)
        self.assertIn(key_id, resp_all.json().get("keys", {}))

        # Verify GET /api/governor/hierarchy includes key_quotas
        resp_hier = self.client.get("/api/governor/hierarchy")
        self.assertEqual(resp_hier.status_code, 200)
        self.assertIn("key_quotas", resp_hier.json())
        self.assertIn(key_id, resp_hier.json()["key_quotas"].get("keys", {}))


if __name__ == "__main__":
    with preserve_agent_memory():
        unittest.main(verbosity=2)
