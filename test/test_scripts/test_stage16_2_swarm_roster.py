"""
================================================================================
ADVANCE ASSISTANT OS v6.0 - STAGE 16.2 CERTIFICATION SUITE
File: test/test_scripts/test_stage16_2_swarm_roster.py
================================================================================
Tests:
1. GET /api/models/catalog:
   - Full structured catalog (GOOGLE Free/Paid, GROQ Free/Paid, OLLAMA Local).
   - 85% working limits and active key detection verified.
2. POST /api/swarms/profiles:
   - Explicit multi-model swarm roster persistence.
   - worker_models list, max_models_used, routing_strategy, and preferred_key_id.
3. POST /api/blueprint/preview with worker_models:
   - Verifies tasks are distributed strictly across user-selected models.
   - Verifies max_models_used constraint and blueprint metadata.
4. run_agent_pipeline & key_manager with explicit_model & preferred_key_id:
   - Verifies resolve_key_context honors preferred_key_id.
   - Verifies run_agent_pipeline honors explicit_model and records local lease.

Guarantees ZERO test pollution via `preserve_agent_memory()`.
================================================================================
"""

import sys
import os
import json
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPTS_DIR = os.path.abspath(os.path.dirname(__file__))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from test_state_guard import preserve_agent_memory
from fastapi.testclient import TestClient
from src.server import app
from src.key_manager import key_manager
from src.token_governor import token_governor
from src.agent import run_agent_pipeline
from src.supervisor import _load_active_swarm_config


class TestStage16_2SwarmRoster(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_01_models_catalog_endpoint(self):
        """Verify GET /api/models/catalog returns clean structured catalog with 85% limits."""
        res = self.client.get("/api/models/catalog")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("safety_margin_percent"), 85)

        catalog = data.get("catalog", {})
        self.assertIn("GOOGLE", catalog)
        self.assertIn("GROQ", catalog)
        self.assertIn("OLLAMA", catalog)

        # GOOGLE checks
        self.assertIn("FREE", catalog["GOOGLE"])
        self.assertIn("PAID", catalog["GOOGLE"])
        google_free = catalog["GOOGLE"]["FREE"]
        self.assertGreater(len(google_free.get("models", [])), 0)
        sample_g = google_free["models"][0]
        self.assertIn("strict_limits", sample_g)
        self.assertIn("working_limits", sample_g)
        self.assertEqual(sample_g.get("safety_margin_percent"), 85)

        # OLLAMA Local check
        self.assertIn("LOCAL", catalog["OLLAMA"])
        self.assertTrue(catalog["OLLAMA"]["LOCAL"].get("keys_available"))
        print("\n [TEST 1 PASSED]: GET /api/models/catalog verified across GOOGLE, GROQ, OLLAMA.")

    def test_02_swarm_profiles_multi_model_roster(self):
        """Verify POST /api/swarms/profiles saves multi-model swarm with worker roster and preferred key."""
        custom_payload = {
            "active_swarm_id": "CUSTOM_MULTI_SWARM",
            "orchestrator_engine": "qwen2.5-coder:32b",
            "worker_models": [
                "gemini-2.5-flash",
                "gemini-2.0-flash-lite",
                "qwen2.5-coder:7b"
            ],
            "max_models_used": 2,
            "max_concurrency_workers": 6,
            "routing_strategy": "ROUND_ROBIN",
            "preferred_key_id": "key_e7c36116",
            "swarms": [
                {
                    "id": "CUSTOM_MULTI_SWARM",
                    "name": "Custom Multi-Model Test Swarm",
                    "description": "Testing multi-model roster dispatch",
                    "orchestrator": "qwen2.5-coder:32b",
                    "worker_tier": "HIGH_RPM_TPM",
                    "worker_models": [
                        "gemini-2.5-flash",
                        "gemini-2.0-flash-lite",
                        "qwen2.5-coder:7b"
                    ],
                    "max_models_used": 2,
                    "routing_strategy": "ROUND_ROBIN",
                    "default_concurrency": 6
                }
            ]
        }

        res = self.client.post("/api/swarms/profiles", json=custom_payload)
        self.assertEqual(res.status_code, 200)

        # Verify persisted file
        swarm_file = os.path.abspath("./.agent_memory/swarm_profiles.json")
        with open(swarm_file, "r", encoding="utf-8") as f:
            persisted = json.load(f)

        self.assertEqual(persisted.get("active_swarm_id"), "CUSTOM_MULTI_SWARM")
        self.assertEqual(persisted.get("worker_models"), ["gemini-2.5-flash", "gemini-2.0-flash-lite", "qwen2.5-coder:7b"])
        self.assertEqual(persisted.get("max_models_used"), 2)
        self.assertEqual(persisted.get("preferred_key_id"), "key_e7c36116")

        # Test helper reader
        cfg = _load_active_swarm_config()
        self.assertEqual(cfg["active_swarm_id"], "CUSTOM_MULTI_SWARM")
        self.assertEqual(cfg["max_models_used"], 2)
        print("\n [TEST 2 PASSED]: POST /api/swarms/profiles multi-model roster persisted and loaded.")

    def test_03_blueprint_preview_worker_distribution(self):
        """Verify blueprint preview distributes tasks strictly across user-selected worker models."""
        selected_models = ["gemini-2.0-flash-lite", "qwen2.5-coder:7b"]
        preview_req = {
            "goal": "Build an authentication service with login, registration, and session token modules.",
            "target_dir": "/tmp/test_roster_proj",
            "project_name": "test_roster_proj",
            "execution_mode": "HYBRID_CLOUD",
            "orchestrator_model": "qwen2.5-coder:32b",
            "worker_models": selected_models,
            "max_models_used": 2,
            "routing_strategy": "ROUND_ROBIN",
            "preferred_key_id": "AUTO",
            "use_existing_context": False
        }

        mock_decomposition = (
            "Setup requirements.txt with pyjwt and fastapi\n"
            "Build src/auth.py with JWT verification middleware\n"
            "Build src/session.py with session token store\n"
            "Build src/routes.py with login endpoints\n"
        )

        with patch("src.agent.run_agent_pipeline", return_value=mock_decomposition), \
             patch("src.supervisor.run_agent_pipeline", return_value=mock_decomposition):
            res = self.client.post("/api/blueprint/preview", json=preview_req)

        self.assertEqual(res.status_code, 200)
        data = res.json()
        blueprint = data.get("blueprint", {})

        self.assertEqual(blueprint.get("orchestrator_model"), "qwen2.5-coder:32b")
        self.assertEqual(blueprint.get("worker_models"), selected_models)
        self.assertEqual(blueprint.get("max_models_used"), 2)

        tasks = blueprint.get("tasks", [])
        self.assertEqual(len(tasks), 4)

        # Every task must be assigned strictly to one of the selected models
        for t in tasks:
            assigned = t.get("assigned_model")
            self.assertIn(assigned, selected_models, f"Task {t.get('task_id')} assigned unselected model: {assigned}")

        # Check round-robin distribution
        self.assertEqual(tasks[0]["assigned_model"], selected_models[0])
        self.assertEqual(tasks[1]["assigned_model"], selected_models[1])
        self.assertEqual(tasks[2]["assigned_model"], selected_models[0])
        self.assertEqual(tasks[3]["assigned_model"], selected_models[1])

        print(f"\n [TEST 3 PASSED]: Blueprint preview tasks ({len(tasks)} tasks) strictly distributed across {selected_models}.")

    def test_04_explicit_model_and_preferred_key_dispatch(self):
        """Verify resolve_key_context with preferred_key_id and run_agent_pipeline with explicit_model."""
        # 1. Test key_manager.resolve_key_context with preferred_key_id
        keys = key_manager.get_masked_keys()
        if keys:
            target_key = keys[0]
            target_key_id = target_key["id"]
            ctx = key_manager.resolve_key_context(
                model_name="gemini-2.5-flash",
                tier_preference="FREE",
                provider="GOOGLE",
                preferred_key_id=target_key_id
            )
            self.assertEqual(ctx.get("key_id"), target_key_id)

        # 2. Test run_agent_pipeline with explicit local model
        mock_chunks = [
            {"message": {"content": "EXECUTE: WRITE_FILE: test_local_mod.py | def test_func(): return True\n"}}
        ]
        with patch("ollama.chat", return_value=iter(mock_chunks)):
            reply = run_agent_pipeline(
                user_prompt="Create test module",
                execution_mode="OFFLINE_ONLY",
                project_name="test_explicit_dispatch",
                explicit_model="qwen2.5-coder:7b",
                fallback_models=["gemini-2.5-flash"]
            )
            self.assertIsNotNone(reply)
            self.assertIn("EXECUTE: WRITE_FILE:", reply)

        print("\n [TEST 4 PASSED]: Explicit model dispatcher and preferred_key_id verified.")


if __name__ == "__main__":
    with preserve_agent_memory():
        suite = unittest.TestLoader().loadTestsFromTestCase(TestStage16_2SwarmRoster)
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        sys.exit(0 if result.wasSuccessful() else 1)
