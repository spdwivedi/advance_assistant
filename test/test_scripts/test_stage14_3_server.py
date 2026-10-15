#!/usr/bin/env python3
"""
Advance Assistant OS v6.0 - Stage 14.3 Automated Verification Suite
Verifies:
1. GET /api/governor/hierarchy (Provider trees: GOOGLE, GROQ, OLLAMA, financial_shield, sub_agents, key_pool)
2. POST /api/governor/limits (Model working and strict limits updates & persistence)
3. POST /api/governor/provider-model (Dynamic provider/tier/model registration)
4. POST /api/governor/shield (Financial shield toggle, paid_tier_locked, daily_paid_token_cap)
5. GET & POST /api/governor/sub-agents (Role bounds: input/output/thinking caps, rpm/tpm/rpd)
6. POST /api/keys & GET /api/keys (Multi-provider key registration for GOOGLE and GROQ, cleanup)
7. GET /api/telemetry & WebSocket /ws/telemetry (Enriched hierarchy and key_pool streaming)
"""

import sys
import os
import json
import time

# Ensure project root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastapi.testclient import TestClient
from src.server import app

client = TestClient(app)

PASSED = 0
FAILED = 0


def record_pass(test_name: str, detail: str = ""):
    global PASSED
    PASSED += 1
    print(f" [PASS] {test_name}: {detail}")


def record_fail(test_name: str, error: str):
    global FAILED
    FAILED += 1
    print(f" [FAIL] {test_name}: {error}")


def test_1_governor_hierarchy_endpoint():
    print("\n--- 1. Testing GET /api/governor/hierarchy ---")
    try:
        res = client.get("/api/governor/hierarchy")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        assert data.get("status") == "success", "status should be 'success'"
        
        # Verify hierarchy structure
        hierarchy = data.get("hierarchy", {})
        assert "providers" in hierarchy, "hierarchy must contain 'providers'"
        providers = hierarchy["providers"]
        assert "GOOGLE" in providers, "GOOGLE provider tree missing"
        assert "GROQ" in providers, "GROQ provider tree missing"
        assert "OLLAMA" in providers, "OLLAMA provider tree missing"
        assert "financial_shield" in hierarchy, "financial_shield missing in hierarchy"
        
        # Verify sub_agents
        sub_agents = data.get("sub_agents", {})
        assert isinstance(sub_agents, dict) and len(sub_agents) > 0, "sub_agents should be non-empty dict"
        assert "Enterprise_Architect_Agent" in sub_agents, "Enterprise_Architect_Agent missing in sub_agents"
        assert "Groq_Velocity_Coder_Agent" in sub_agents, "Groq_Velocity_Coder_Agent missing in sub_agents"
        
        # Verify key_pool in hierarchy response
        key_pool = data.get("key_pool", {})
        assert "google_keys" in key_pool, "google_keys count missing in key_pool"
        assert "groq_keys" in key_pool, "groq_keys count missing in key_pool"
        assert "active_free" in key_pool, "active_free missing in key_pool"
        assert "active_paid" in key_pool, "active_paid missing in key_pool"
        assert "paid_tier_locked" in key_pool, "paid_tier_locked missing in key_pool"
        
        record_pass(
            "GET /api/governor/hierarchy",
            f"Providers: {list(providers.keys())}, Sub-Agents: {len(sub_agents)}, Google Keys: {key_pool['google_keys']}, Groq Keys: {key_pool['groq_keys']}"
        )
    except Exception as exc:
        record_fail("GET /api/governor/hierarchy", str(exc))


def test_2_model_limits_update_and_persistence():
    print("\n--- 2. Testing POST /api/governor/limits ---")
    try:
        # Get original limits first
        res = client.get("/api/governor/hierarchy")
        assert res.status_code == 200
        data = res.json()
        orig_limits = data["hierarchy"]["providers"]["GOOGLE"]["FREE"]["gemini-2.5-flash"]["working_limits"]
        
        # Update working limits
        new_working = dict(orig_limits)
        new_working["rpm"] = 14
        new_working["tpm"] = 900000
        new_working["max_input_tokens"] = 95000
        
        update_payload = {
            "provider": "GOOGLE",
            "tier": "FREE",
            "model_name": "gemini-2.5-flash",
            "working_limits": new_working
        }
        
        post_res = client.post("/api/governor/limits", json=update_payload)
        assert post_res.status_code == 200, f"Expected 200, got {post_res.status_code}: {post_res.text}"
        post_data = post_res.json()
        assert post_data.get("status") == "success", "Expected status: success"
        assert post_data.get("updated") is True, "Expected updated: True"
        
        # Verify persistence via GET /api/governor/hierarchy
        verify_res = client.get("/api/governor/hierarchy")
        v_data = verify_res.json()
        curr_working = v_data["hierarchy"]["providers"]["GOOGLE"]["FREE"]["gemini-2.5-flash"]["working_limits"]
        assert curr_working["rpm"] == 14, f"Expected RPM 14, got {curr_working['rpm']}"
        assert curr_working["tpm"] == 900000, f"Expected TPM 900000, got {curr_working['tpm']}"
        
        # Restore original limits
        restore_payload = {
            "provider": "GOOGLE",
            "tier": "FREE",
            "model_name": "gemini-2.5-flash",
            "working_limits": orig_limits
        }
        client.post("/api/governor/limits", json=restore_payload)
        
        record_pass(
            "POST /api/governor/limits",
            "Successfully updated working limits, verified persistence, and restored original defaults"
        )
    except Exception as exc:
        record_fail("POST /api/governor/limits", str(exc))


def test_3_dynamic_provider_model_registration():
    print("\n--- 3. Testing POST /api/governor/provider-model ---")
    try:
        new_provider_payload = {
            "provider": "ANTHROPIC",
            "tier": "PAID",
            "model_name": "claude-3-7-sonnet",
            "strict_limits": {
                "rpm": 50,
                "tpm": 100000,
                "rpd": 10000,
                "max_input_tokens": 200000,
                "max_output_tokens": 8192,
                "thinking_budget": 32000
            },
            "working_limits": {
                "rpm": 40,
                "tpm": 80000,
                "rpd": 8000,
                "max_input_tokens": 160000,
                "max_output_tokens": 8192,
                "thinking_budget": 24000
            }
        }
        
        post_res = client.post("/api/governor/provider-model", json=new_provider_payload)
        assert post_res.status_code == 200, f"Expected 200, got {post_res.status_code}: {post_res.text}"
        post_data = post_res.json()
        assert post_data.get("status") == "success", "Expected status: success"
        assert post_data.get("registered") is True, "Expected registered: True"
        assert post_data.get("provider") == "ANTHROPIC"
        assert post_data.get("model") == "claude-3-7-sonnet"
        
        # Verify in hierarchy
        get_res = client.get("/api/governor/hierarchy")
        h_data = get_res.json()["hierarchy"]
        assert "ANTHROPIC" in h_data["providers"], "Newly registered ANTHROPIC provider missing in hierarchy"
        assert "claude-3-7-sonnet" in h_data["providers"]["ANTHROPIC"]["PAID"], "claude-3-7-sonnet model missing"
        model_meta = h_data["providers"]["ANTHROPIC"]["PAID"]["claude-3-7-sonnet"]
        assert model_meta["working_limits"]["rpm"] == 40
        assert model_meta["strict_limits"]["rpm"] == 50
        
        record_pass(
            "POST /api/governor/provider-model",
            "Dynamically registered ANTHROPIC/PAID/claude-3-7-sonnet with strict and working limits"
        )
    except Exception as exc:
        record_fail("POST /api/governor/provider-model", str(exc))


def test_4_financial_shield_endpoint():
    print("\n--- 4. Testing POST /api/governor/shield ---")
    try:
        # Get original shield status
        get_res = client.get("/api/governor/hierarchy")
        orig_shield = get_res.json()["hierarchy"]["financial_shield"]
        orig_locked = orig_shield.get("paid_tier_locked", False)
        orig_cap = orig_shield.get("daily_paid_token_cap", 50000000)
        
        # Toggle lock on and set daily cap
        shield_payload = {
            "paid_tier_locked": True,
            "daily_paid_token_cap": 25000000,
            "safety_margin_percent": 20
        }
        post_res = client.post("/api/governor/shield", json=shield_payload)
        assert post_res.status_code == 200, f"Expected 200, got {post_res.status_code}: {post_res.text}"
        post_data = post_res.json()
        assert post_data.get("status") == "success"
        assert post_data.get("updated") is True
        assert post_data["financial_shield"]["paid_tier_locked"] is True
        assert post_data["financial_shield"]["daily_paid_token_cap"] == 25000000
        assert post_data["financial_shield"]["safety_margin_percent"] == 20
        
        # Verify hierarchy reflection
        verify_res = client.get("/api/governor/hierarchy")
        v_data = verify_res.json()
        assert v_data["hierarchy"]["financial_shield"]["paid_tier_locked"] is True
        assert v_data["key_pool"]["paid_tier_locked"] is True
        
        # Restore original shield state
        restore_payload = {
            "paid_tier_locked": orig_locked,
            "daily_paid_token_cap": orig_cap,
            "safety_margin_percent": orig_shield.get("safety_margin_percent", 15)
        }
        client.post("/api/governor/shield", json=restore_payload)
        
        record_pass(
            "POST /api/governor/shield",
            "Updated paid_tier_locked and daily_paid_token_cap, verified in hierarchy, restored state"
        )
    except Exception as exc:
        record_fail("POST /api/governor/shield", str(exc))


def test_5_sub_agent_bounds_endpoints():
    print("\n--- 5. Testing GET & POST /api/governor/sub-agents ---")
    try:
        # GET sub-agents
        get_res = client.get("/api/governor/sub-agents")
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data.get("status") == "success"
        sub_agents = get_data.get("sub_agents", {})
        assert "Groq_Velocity_Coder_Agent" in sub_agents
        
        orig_agent = dict(sub_agents["Groq_Velocity_Coder_Agent"])
        
        # Update bounds for Groq_Velocity_Coder_Agent
        update_payload = {
            "agent_name": "Groq_Velocity_Coder_Agent",
            "max_input_tokens": 12500,
            "max_output_tokens": 3500,
            "thinking_budget": 512,
            "rpm": 28,
            "tpm": 26000
        }
        post_res = client.post("/api/governor/sub-agents", json=update_payload)
        assert post_res.status_code == 200, f"Expected 200, got {post_res.status_code}: {post_res.text}"
        post_data = post_res.json()
        assert post_data.get("status") == "success"
        agent = post_data.get("agent", {})
        assert agent["max_input_tokens"] == 12500
        assert agent["max_output_tokens"] == 3500
        assert agent["thinking_budget"] == 512
        assert agent["rpm"] == 28
        assert agent["tpm"] == 26000
        
        # Verify persistence via GET /api/governor/sub-agents
        verify_res = client.get("/api/governor/sub-agents")
        v_sub = verify_res.json()["sub_agents"]["Groq_Velocity_Coder_Agent"]
        assert v_sub["max_input_tokens"] == 12500
        assert v_sub["rpm"] == 28
        
        # Restore original agent bounds
        restore_payload = {
            "agent_name": "Groq_Velocity_Coder_Agent",
            "max_input_tokens": orig_agent.get("max_input_tokens", 8000),
            "max_output_tokens": orig_agent.get("max_output_tokens", 4096),
            "thinking_budget": orig_agent.get("thinking_budget", 0),
            "rpm": orig_agent.get("rpm", 30),
            "tpm": orig_agent.get("tpm", 30000)
        }
        client.post("/api/governor/sub-agents", json=restore_payload)
        
        record_pass(
            "GET & POST /api/governor/sub-agents",
            "Successfully updated input/output/thinking bounds and verified persistence"
        )
    except Exception as exc:
        record_fail("GET & POST /api/governor/sub-agents", str(exc))


def test_6_multi_provider_keys_endpoints():
    print("\n--- 6. Testing Multi-Provider Key Pool (GOOGLE, GROQ) ---")
    try:
        # Register a Google key
        google_payload = {
            "key": "AIzaSyTestStage14_3_GoogleKey_abcdef123456",
            "tier": "FREE",
            "label": "Stage 14.3 Test Google Key",
            "provider": "GOOGLE",
            "is_selected": True
        }
        res_g = client.post("/api/keys", json=google_payload)
        assert res_g.status_code == 200, f"Google key registration failed: {res_g.text}"
        g_data = res_g.json()
        assert g_data.get("status") == "success"
        google_key_id = g_data["key"]["id"]
        assert g_data["key"].get("provider") == "GOOGLE"
        
        # Register a Groq key
        groq_payload = {
            "key": "gsk_teststage14_3_groqkey_1234567890abcdef1234",
            "tier": "FREE",
            "label": "Stage 14.3 Test Groq Key",
            "provider": "GROQ",
            "is_selected": True
        }
        res_gr = client.post("/api/keys", json=groq_payload)
        assert res_gr.status_code == 200, f"Groq key registration failed: {res_gr.text}"
        gr_data = res_gr.json()
        assert gr_data.get("status") == "success"
        groq_key_id = gr_data["key"]["id"]
        assert gr_data["key"].get("provider") == "GROQ"
        
        # Verify both appear in GET /api/keys
        list_res = client.get("/api/keys")
        assert list_res.status_code == 200
        keys_list = list_res.json().get("keys", [])
        
        found_g = any(k["id"] == google_key_id and k.get("provider") == "GOOGLE" for k in keys_list)
        found_gr = any(k["id"] == groq_key_id and k.get("provider") == "GROQ" for k in keys_list)
        assert found_g, "Newly registered GOOGLE key not found in GET /api/keys"
        assert found_gr, "Newly registered GROQ key not found in GET /api/keys"
        
        # Test key endpoint accepts provider
        test_payload = {
            "key": "gsk_teststage14_3_groqkey_1234567890abcdef1234",
            "provider": "GROQ"
        }
        test_res = client.post("/api/keys/test", json=test_payload)
        assert test_res.status_code == 200
        assert "valid" in test_res.json()
        
        # Cleanup test keys
        del_g = client.delete(f"/api/keys/{google_key_id}")
        assert del_g.status_code == 200, f"Failed to delete test google key: {del_g.text}"
        del_gr = client.delete(f"/api/keys/{groq_key_id}")
        assert del_gr.status_code == 200, f"Failed to delete test groq key: {del_gr.text}"
        
        record_pass(
            "Multi-Provider POST /api/keys & GET /api/keys",
            f"Successfully registered GOOGLE ({google_key_id}) and GROQ ({groq_key_id}) keys and verified cleanup"
        )
    except Exception as exc:
        record_fail("Multi-Provider POST /api/keys & GET /api/keys", str(exc))


def test_7_telemetry_rest_and_websocket_stream():
    print("\n--- 7. Testing Telemetry REST and WebSocket Streaming ---")
    try:
        # 7.1 GET /api/telemetry
        res = client.get("/api/telemetry")
        assert res.status_code == 200
        data = res.json()
        assert "models" in data
        assert "reset_schedule" in data or "reset_Schedule" in data
        assert "shield_threshold" in data
        assert "key_pool" in data
        assert "hierarchy" in data, "hierarchy missing in GET /api/telemetry"
        assert "financial_shield" in data["hierarchy"]
        assert "providers" in data["hierarchy"]
        assert "google_keys" in data["key_pool"]
        assert "groq_keys" in data["key_pool"]
        record_pass("GET /api/telemetry", "Verified models, key_pool with provider counts, and hierarchy block")
        
        # 7.2 WebSocket /ws/telemetry
        with client.websocket_connect("/ws/telemetry") as ws:
            frame = ws.receive_json()
            assert "execution_state" in frame
            assert "swarm_registry" in frame
            assert "quotas" in frame
            assert "knowledge_telemetry" in frame
            assert "key_pool" in frame
            assert "google_keys" in frame["key_pool"]
            assert "groq_keys" in frame["key_pool"]
            assert "hierarchy" in frame, "hierarchy missing in WebSocket /ws/telemetry frame"
            assert "providers" in frame["hierarchy"]
            assert "financial_shield" in frame["hierarchy"]
            assert "timestamp" in frame
            record_pass("WebSocket /ws/telemetry", f"Enriched live frame with hierarchy ({list(frame['hierarchy']['providers'].keys())}) and key_pool")
    except Exception as exc:
        record_fail("Telemetry REST and WebSocket Streaming", str(exc))


def main():
    print("=" * 80)
    print(" ADVANCE ASSISTANT OS v6.0 - STAGE 14.3 FASTAPI REST & TELEMETRY SUITE")
    print("=" * 80)
    
    test_1_governor_hierarchy_endpoint()
    test_2_model_limits_update_and_persistence()
    test_3_dynamic_provider_model_registration()
    test_4_financial_shield_endpoint()
    test_5_sub_agent_bounds_endpoints()
    test_6_multi_provider_keys_endpoints()
    test_7_telemetry_rest_and_websocket_stream()
    
    print("\n" + "=" * 80)
    print(f" TOTAL TESTS: {PASSED + FAILED} | PASSED: {PASSED} | FAILED: {FAILED}")
    print("=" * 80)
    
    if FAILED > 0:
        sys.exit(1)
    else:
        print("\n ALL STAGE 14.3 SERVER ENDPOINTS PASSED CERTIFICATION 100%!")


if __name__ == "__main__":
    main()
