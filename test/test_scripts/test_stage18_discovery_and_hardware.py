"""
================================================================================
ADVANCE ASSISTANT OS v6.0 - STAGE 18 TEST SUITE
File: test/test_scripts/test_stage18_discovery_and_hardware.py
================================================================================
Verifies:
1. Unlimited / None Working Limits & Lease Safety (No TypeError)
2. Sub-8GB Local Model Hardware Profile (<8GB champions, 32B demoted)
3. 6 Sleek Swarm Roles & Intelligent Task Routing
4. Dual AI Studio Model Discovery & Importer Engine (Method A & Method B)
================================================================================
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPTS_DIR = os.path.abspath(os.path.dirname(__file__))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from test_state_guard import preserve_agent_memory
from src.config import (
    compute_working_limits,
    is_unlimited,
    DEFAULT_PROVIDER_QUOTAS,
    SLEEK_SWARM_ROLES,
    classify_task_to_sleek_role,
    SUB_8GB_LOCAL_MODELS
)
from src.token_governor import token_governor
from fastapi.testclient import TestClient
from src.server import app


class TestStage18DiscoveryAndHardware(unittest.TestCase):

    def test_01_compute_working_limits_unlimited_safety(self):
        """Test compute_working_limits handles Unlimited, None, -1, and 0 without TypeError."""
        strict = {
            "rpm": 1000,
            "tpm": "Unlimited",
            "rpd": None,
            "max_input_tokens": -1,
            "max_output_tokens": 0
        }
        working = compute_working_limits(strict, margin_pct=85, thinking_budget=0)
        self.assertEqual(working["rpm"], 850)
        self.assertEqual(working["tpm"], "Unlimited")
        self.assertEqual(working["rpd"], "Unlimited")
        self.assertEqual(working["max_input_tokens"], "Unlimited")
        self.assertEqual(working["max_output_tokens"], "Unlimited")

    def test_02_acquire_lease_and_telemetry_with_unlimited_models(self):
        """Test acquire_lease and telemetry formatting when limits are Unlimited."""
        token_governor.reload_state()
        
        # gemini-4-argon has Unlimited RPD in Free tier
        lease = token_governor.acquire_lease("gemini-4-argon", prompt_text="Hello Gemini Argon")
        self.assertTrue(lease.get("allowed", False))
        self.assertEqual(lease.get("model_name"), "gemini-4-argon")

        # Telemetry snippet should not crash on Unlimited TPM/RPD
        snippet = token_governor.render_live_telemetry_snippet("gemini-4-argon")
        self.assertIsInstance(snippet, str)
        self.assertIn("RPM:", snippet)
        self.assertIn("Unlimited", snippet)

        # Release lease
        token_governor.release_lease(lease["lease_id"])

    def test_03_sub_8gb_hardware_profile_and_32b_demotion(self):
        """Verify sub-8GB champions are configured and 32B models are demoted from default local orchestrator."""
        self.assertIn("qwen2.5-coder:7b", SUB_8GB_LOCAL_MODELS.values())
        self.assertIn("deepseek-r1:8b", SUB_8GB_LOCAL_MODELS.values())
        self.assertIn("qwen2.5-coder:1.5b", SUB_8GB_LOCAL_MODELS.values())
        self.assertIn("sqlcoder:7b", SUB_8GB_LOCAL_MODELS.values())

        import json
        profiles_path = os.path.join(PROJECT_ROOT, ".agent_memory", "swarm_profiles.json")
        with open(profiles_path, "r", encoding="utf-8") as f:
            profiles = json.load(f)

        orch = profiles.get("orchestrator_engine", "")
        # Should be sub-8GB (7B), NOT 32B
        self.assertIn("7b", orch.lower())
        self.assertNotIn("32b", orch.lower())

    def test_04_sleek_6_roles_and_task_classification(self):
        """Verify 6 sleek roles exist and task classification routes file tasks properly."""
        expected_roles = {"Architect", "Scaffolder", "Coder", "Database", "Healer", "Velocity"}
        self.assertEqual(set(SLEEK_SWARM_ROLES.keys()), expected_roles)

        # Scaffolder: configs, dirs, package.json
        self.assertEqual(classify_task_to_sleek_role("Create directory structure and package.json")["role"], "Scaffolder")
        # Database: SQL, schemas, migrations
        self.assertEqual(classify_task_to_sleek_role("Create PostgreSQL schema migration for users")["role"], "Database")
        # Healer: tests, bug fixes, syntax errors
        self.assertEqual(classify_task_to_sleek_role("Fix failing unit test and syntax error in auth")["role"], "Healer")
        # Velocity: docs, markdown, helpers
        self.assertEqual(classify_task_to_sleek_role("Write API documentation and markdown guide")["role"], "Velocity")
        # Coder: core feature logic
        self.assertEqual(classify_task_to_sleek_role("Implement shopping cart calculation algorithm")["role"], "Coder")
        self.assertEqual(classify_task_to_sleek_role("System design and Phase 0 decomposition")["role"], "Architect")

    def test_05_method_a_import_aistudio_rate_limits_endpoint(self):
        """Verify POST /api/governor/import-aistudio-limits parses text and applies 85% working limits."""
        client = TestClient(app)
        raw_text = """
Gemini 4 Argon\tText-out\t1,000 RPM\t2,000,000 TPM\tUnlimited RPD
Gemini 3.8 Flash\tMulti-modal\t1,000 RPM\t2,000,000 TPM\t10,000 RPD
Gemini Omni Flash\tVideo/Audio\t4 RPM\tUnlimited TPM\t20 RPD
"""
        response = client.post(
            "/api/governor/import-aistudio-limits",
            json={"raw_text": raw_text, "target_tier": "FREE"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["parsed_count"], 3)
        self.assertEqual(data["target_tier"], "FREE")

        models = {m["model_name"]: m for m in data["models"]}
        self.assertIn("gemini-4-argon", models)
        self.assertEqual(models["gemini-4-argon"]["strict_limits"]["rpm"], 1000)
        self.assertEqual(models["gemini-4-argon"]["working_limits"]["rpm"], 850)
        self.assertEqual(models["gemini-4-argon"]["strict_limits"]["rpd"], "Unlimited")
        self.assertEqual(models["gemini-4-argon"]["working_limits"]["rpd"], "Unlimited")

    def test_06_method_b_live_api_discovery_graceful_http_400(self):
        """Verify sync_live_and_offline_models handles mock/invalid keys and HTTP 400 gracefully."""
        # When sync is called, it should not raise an unhandled exception even if mock keys are present
        try:
            token_governor.sync_live_and_offline_models()
            success = True
        except Exception as e:
            success = False
        self.assertTrue(success, "sync_live_and_offline_models raised unhandled exception")


def run_tests():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestStage18DiscoveryAndHardware)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    print(f"\n({result.testsRun - len(result.failures) - len(result.errors)}/{result.testsRun} checks)")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    with preserve_agent_memory():
        code = run_tests()
        sys.exit(code)
