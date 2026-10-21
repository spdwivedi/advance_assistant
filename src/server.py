import os
import re
import sys
import time
import json
import asyncio
import threading
from typing import Optional, Dict, Any, List

# Ensure parent directory is on system path for module imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from src.logger import log_action
from src.token_governor import TokenGovernor, token_governor
from src.supervisor import (ProjectSupervisor, request_build_stop, toggle_build_pause, reset_build_lifecycle, check_build_lifecycle, generate_preflight_blueprint, execute_approved_blueprint)
from src.memory_manager import (
    get_last_env_location,
    get_knowledge_base_telemetry,
    defragment_and_consolidate_books,
    list_all_books_detailed,
    read_book_content,
    save_book_content,
    append_book_recipe,
    delete_book,
    get_precision_context,
    _load_json,
    _save_json,
    ENV_HISTORY_FILE
)
from src.testing_bridge import testing_bridge
from src.key_manager import key_manager
import src.key_manager
src.key_manager._KEY_LOCK = threading.RLock()
from src.config import (
    normalize_wsl_path,
    DEFAULT_EXECUTION_MODE,
    DEFAULT_RESEARCH_PROFILE,
    DEFAULT_MODEL_CONSTRAINING_PROFILE,
    RESEARCH_PROFILES,
    MODEL_CONSTRAINING_PROFILES,
    TIER_POOLS,
    MODEL_REGISTRY,
    LOCAL_ORCHESTRATOR_MODEL,
    LOCAL_WORKER_MODEL,
    SWARM_REGISTRY_FILE,
    DEFAULT_ISOLATION_ENABLED,
    MAX_SWARM_WORKERS,
    PROJECT_LOG_DIR
)

# Initialize application and token governor
app = FastAPI(
    title="Advance Assistant OS v6.0 - Web Bridge API",
    description="High-throughput FastAPI and WebSocket bridge for system telemetry, swarm control, and background execution.",
    version="6.0.0"
)

# CORS configured for all origins (*) to allow cross-platform Windows browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

governor = token_governor
TokenGovernorInstance = governor

# Global thread-safe execution state
execution_lock = threading.Lock()
execution_state: Dict[str, Any] = {
    "is_running": False,
    "is_paused": False,
    "status": "IDLE",
    "current_phase": "IDLE",
    "project_name": None,
    "target_path": None,
    "goal": None,
    "mode": None,
    "profile": None,
    "constrain": None,
    "isolate": None,
    "start_time": None,
    "end_time": None,
    "error": None
}

VALID_EXECUTION_MODES = [
    "AUTO_DETECT",
    "OFFLINE_ONLY",
    "HYBRID_CLOUD",
    "OFFLINE_AGENTIC",
    "HYBRID_AGENTIC"
]


class ExecutePayload(BaseModel):
    target_path: Optional[str] = None
    project_name: Optional[str] = "default_project"
    goal: str
    mode: Optional[str] = None
    profile: Optional[str] = None
    constrain: Optional[str] = None
    isolate: Optional[bool] = None
    max_workers: Optional[int] = None
    orchestrator_model: Optional[str] = None
    worker_models: Optional[List[str]] = None
    max_models_used: Optional[int] = None
    routing_strategy: Optional[str] = None
    preferred_key_id: Optional[str] = None


class ModelLimitsUpdateRequest(BaseModel):
    provider: str
    tier: str
    model_name: str
    working_limits: Dict[str, int]
    strict_limits: Optional[Dict[str, int]] = None


class AddProviderModelRequest(BaseModel):
    provider: str
    tier: str
    model_name: str
    strict_limits: Dict[str, int]
    working_limits: Dict[str, int]


class FinancialShieldUpdateRequest(BaseModel):
    paid_tier_locked: Optional[bool] = None
    daily_paid_token_cap: Optional[int] = None
    per_build_paid_token_cap: Optional[int] = None
    enforce_working_limits: Optional[bool] = None
    safety_margin_percent: Optional[int] = None


class ImportAiStudioLimitsRequest(BaseModel):
    raw_text: str
    target_tier: str = "FREE"  # "FREE" | "PAID"
    project_id: Optional[str] = None


class RecalculateWorkingLimitsRequest(BaseModel):
    margin_pct: Optional[int] = 85


class KeyLimitsUpdateRequest(BaseModel):
    model_name: Optional[str] = None
    working_limits: Optional[Dict[str, int]] = None
    strict_limits: Optional[Dict[str, int]] = None
    safety_margin_percent: Optional[int] = None


class PausePayload(BaseModel):
    paused: Optional[bool] = None


class BlueprintPreviewRequest(BaseModel):
    goal: str
    target_dir: str = "/tmp"
    project_name: Optional[str] = None
    execution_mode: str = "AUTO_DETECT"
    orchestrator_model: Optional[str] = None
    worker_models: Optional[List[str]] = None
    max_models_used: Optional[int] = None
    routing_strategy: Optional[str] = None
    preferred_key_id: Optional[str] = None
    use_existing_context: bool = True


class BlueprintExecuteRequest(BaseModel):
    target_dir: str
    project_name: Optional[str] = None
    goal: str = "Approved Blueprint Execution"
    tasks: List[Dict[str, Any]]
    max_workers: int = 8
    execution_mode: str = "HYBRID_CLOUD"
    research_profile: str = "BASIC"
    model_profile: str = "HIGH_RPM_TPM"
    orchestrator_model: Optional[str] = None
    worker_models: Optional[List[str]] = None
    max_models_used: Optional[int] = None
    routing_strategy: Optional[str] = None
    preferred_key_id: Optional[str] = None


class SubAgentUpdateRequest(BaseModel):
    agent_name: str
    model: Optional[str] = None
    provider: Optional[str] = None
    complexity_level: Optional[str] = None
    max_input_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None
    thinking_budget: Optional[int] = None
    rpm: Optional[int] = None
    tpm: Optional[int] = None
    rpd: Optional[int] = None
    strengths: Optional[List[str]] = None
    weaknesses: Optional[List[str]] = None
    ideal_for: Optional[List[str]] = None


class KeyRegisterRequest(BaseModel):
    key: str
    tier: Optional[str] = "FREE"
    label: Optional[str] = ""
    is_selected: Optional[bool] = True
    provider: Optional[str] = "GOOGLE"

# Backward compatibility alias
AddKeyPayload = KeyRegisterRequest


class KeyTestRequest(BaseModel):
    key: Optional[str] = None
    id: Optional[str] = None
    provider: Optional[str] = "GOOGLE"

# Backward compatibility alias
TestKeyPayload = KeyTestRequest


class TierModePayload(BaseModel):
    mode: str


class SetPolicyPayload(BaseModel):
    policy: str
    pinned_key_id: Optional[str] = None


class ToggleSelectionPayload(BaseModel):
    key_id: str
    is_selected: bool


class SaveBookPayload(BaseModel):
    category: str
    book_name: str
    content: str
    tags: Optional[List[str]] = None


class AppendRecipePayload(BaseModel):
    category: str
    book_name: str
    title: str
    insight: str
    code_snippet: Optional[str] = ""
    tags: Optional[List[str]] = None


class SimulateInjectionPayload(BaseModel):
    prompt: str
    model_name: Optional[str] = "qwen2.5-coder:7b"
    max_tokens: Optional[int] = None


def get_detailed_key_telemetry() -> Dict[str, Any]:
    """
    Constructs comprehensive key_pool telemetry block from key_manager
    for live REST telemetry endpoints and WebSocket broadcasting.
    """
    status = key_manager.get_routing_status()
    masked_keys = key_manager.get_masked_keys()
    shield = getattr(governor, "quotas", {}).get("financial_shield", {})
    paid_tier_locked = bool(shield.get("paid_tier_locked", False))
    return {
        "routing_policy": status.get("routing_policy", "GLOBAL_HYBRID"),
        "pinned_key_id": status.get("pinned_key_id"),
        "total_keys": status.get("total_keys", 0),
        "selected_keys": status.get("selected_keys", 0),
        "active_free": status.get("selected_free_keys", 0),
        "active_paid": status.get("selected_paid_keys", 0),
        "active_keys": status.get("active_keys", 0),
        "exhausted_keys": status.get("exhausted_keys", 0),
        "active_tier_mode": status.get("routing_policy", "GLOBAL_HYBRID"),
        "google_keys": status.get("google_keys", 0),
        "groq_keys": status.get("groq_keys", 0),
        "selected_google_keys": status.get("selected_google_keys", 0),
        "selected_groq_keys": status.get("selected_groq_keys", 0),
        "paid_tier_locked": paid_tier_locked,
        "keys_summary": masked_keys
    }


SUB_AGENTS_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".agent_memory", "sub_agents.json"))


def _load_sub_agents() -> Dict[str, Any]:
    """Loads configured sub-agent profiles from .agent_memory/sub_agents.json."""
    if os.path.exists(SUB_AGENTS_FILE):
        try:
            with open(SUB_AGENTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_sub_agents(data: Dict[str, Any]) -> bool:
    """Persists updated sub-agent profiles to .agent_memory/sub_agents.json."""
    try:
        os.makedirs(os.path.dirname(SUB_AGENTS_FILE), exist_ok=True)
        with open(SUB_AGENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception:
        return False


SWARM_PROFILES_FILE = os.path.join(os.path.dirname(SWARM_REGISTRY_FILE), "swarm_profiles.json")

DEFAULT_SWARM_PROFILES = {
    "active_swarm_id": "GLOBAL_HYBRID_SWARM",
    "orchestrator_engine": "qwen2.5-coder:32b",
    "worker_models": [
        "gemini-2.5-flash",
        "gemini-2.0-flash-lite",
        "qwen-2.5-coder-32b",
        "qwen2.5-coder:7b"
    ],
    "max_models_used": 4,
    "max_concurrency_workers": 8,
    "routing_strategy": "ROUND_ROBIN",
    "preferred_key_id": "AUTO",
    "swarms": [
        {
            "id": "GLOBAL_HYBRID_SWARM",
            "name": "Global Hybrid Adaptive Swarm",
            "description": "Cloud Pro/Ollama 32B for Architecture; Cloud Flash, Groq & Local 7B for Parallel Workers.",
            "orchestrator": "qwen2.5-coder:32b",
            "worker_tier": "HIGH_RPM_TPM",
            "worker_models": [
                "gemini-2.5-flash",
                "gemini-2.0-flash-lite",
                "qwen-2.5-coder-32b",
                "qwen2.5-coder:7b"
            ],
            "max_models_used": 4,
            "routing_strategy": "ROUND_ROBIN",
            "default_concurrency": 8
        },
        {
            "id": "FULLSTACK_CLOUD_SWARM",
            "name": "High-Throughput Cloud Swarm",
            "description": "Gemini 2.5 Pro Orchestrator paired with Gemini Flash, Flash-Lite & Groq Workers.",
            "orchestrator": "gemini-2.5-pro",
            "worker_tier": "HIGHEST_RPM_TPM",
            "worker_models": [
                "gemini-2.5-flash",
                "gemini-2.5-flash-lite",
                "gemini-2.0-flash",
                "gemini-2.0-flash-lite"
            ],
            "max_models_used": 4,
            "routing_strategy": "QUOTA_WEIGHTED",
            "default_concurrency": 12
        },
        {
            "id": "AIR_GAPPED_LOCAL_SWARM",
            "name": "Air-Gapped Private Local Swarm",
            "description": "Zero external API calls. Runs exclusively on Ollama local weights.",
            "orchestrator": "qwen2.5-coder:32b",
            "worker_tier": "OFFLINE_PURE",
            "worker_models": [
                "qwen2.5-coder:7b",
                "qwen2.5-coder:1.5b",
                "deepseek-r1:8b",
                "sqlcoder:7b"
            ],
            "max_models_used": 2,
            "routing_strategy": "ROUND_ROBIN",
            "default_concurrency": 4
        }
    ]
}


def _get_or_init_swarm_profiles() -> Dict[str, Any]:
    """
    Retrieves swarm profile configurations or initializes with production defaults.
    Ensures backward compatible presence of multi-model roster fields.
    """
    import copy
    if not os.path.exists(SWARM_PROFILES_FILE):
        try:
            _save_json(SWARM_PROFILES_FILE, DEFAULT_SWARM_PROFILES)
        except Exception:
            pass
        return copy.deepcopy(DEFAULT_SWARM_PROFILES)
    data = _load_json(SWARM_PROFILES_FILE, DEFAULT_SWARM_PROFILES)
    for k, v in DEFAULT_SWARM_PROFILES.items():
        if k not in data:
            data[k] = v
    return data


@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    """
    Returns service health status, local orchestrator model name,
    worker model name, current background execution state, and live key pool telemetry.
    """
    with execution_lock:
        state_copy = dict(execution_state)

    swarm_conf = _get_or_init_swarm_profiles()
    active_orch = swarm_conf.get("orchestrator_engine", LOCAL_ORCHESTRATOR_MODEL)

    return {
        "status": "healthy",
        "service": "advance_assistant_web_bridge",
        "version": "6.0.0",
        "orchestrator_model": active_orch,
        "worker_model": LOCAL_WORKER_MODEL,
        "active_swarm_id": swarm_conf.get("active_swarm_id", "GLOBAL_HYBRID_SWARM"),
        "max_concurrency_workers": swarm_conf.get("max_concurrency_workers", 8),
        "execution_state": state_copy,
        "key_pool": get_detailed_key_telemetry()
    }


@app.get("/api/config")
def get_config() -> Dict[str, Any]:
    """
    Returns available execution modes, research profiles, model constraining
    profiles, tier pools, registered model limits, and system defaults.
    """
    swarm_conf = _get_or_init_swarm_profiles()
    active_orch = swarm_conf.get("orchestrator_engine", LOCAL_ORCHESTRATOR_MODEL)
    active_max_workers = swarm_conf.get("max_concurrency_workers", MAX_SWARM_WORKERS)

    return {
        "execution_modes": VALID_EXECUTION_MODES,
        "default_mode": DEFAULT_EXECUTION_MODE,
        "research_profiles": RESEARCH_PROFILES,
        "default_research_profile": DEFAULT_RESEARCH_PROFILE,
        "model_constraining_profiles": MODEL_CONSTRAINING_PROFILES,
        "default_constraining_profile": DEFAULT_MODEL_CONSTRAINING_PROFILE,
        "tier_pools": TIER_POOLS,
        "models": list(MODEL_REGISTRY.keys()),
        "model_registry": MODEL_REGISTRY,
        "active_swarm_id": swarm_conf.get("active_swarm_id", "GLOBAL_HYBRID_SWARM"),
        "defaults": {
            "isolation_enabled": DEFAULT_ISOLATION_ENABLED,
            "max_swarm_workers": active_max_workers,
            "orchestrator_model": active_orch,
            "worker_model": LOCAL_WORKER_MODEL
        }
    }


@app.get("/api/history")
def get_history() -> Dict[str, Any]:
    """
    Returns historical workspace paths from env_history.json, last used location,
    and current unified topic knowledge base telemetry.
    """
    env_data = _load_json(ENV_HISTORY_FILE, {"history": [], "last_location": ""})
    raw_hist = env_data.get("history", [])
    clean_hist = []
    seen = set()
    for p in raw_hist:
        if p:
            norm_p = normalize_wsl_path(p)
            if norm_p not in seen:
                seen.add(norm_p)
                clean_hist.append(norm_p)
    return {
        "history": clean_hist,
        "last_location": normalize_wsl_path(get_last_env_location()),
        "knowledge_telemetry": get_knowledge_base_telemetry()
    }


@app.get("/api/swarm/status")
def get_swarm_status() -> Dict[str, Any]:
    """
    Returns the live raw operational state from swarm_registry.json.
    """
    swarm_conf = _get_or_init_swarm_profiles()
    reg = _load_json(SWARM_REGISTRY_FILE, {
        "project_name": None,
        "project_root": None,
        "active_workspace": None,
        "max_available_workers": swarm_conf.get("max_concurrency_workers", 8),
        "domain_locks": {},
        "completed_files": [],
        "status": "IDLE"
    })
    reg.setdefault("active_swarm_id", swarm_conf.get("active_swarm_id", "GLOBAL_HYBRID_SWARM"))
    reg.setdefault("orchestrator_engine", swarm_conf.get("orchestrator_engine", LOCAL_ORCHESTRATOR_MODEL))
    return reg


@app.get("/api/models/catalog")
def get_models_catalog() -> Dict[str, Any]:
    """
    Stage 16.2 Unified Catalog API:
    Returns a structured catalog of all available models grouped by GOOGLE (FREE/PAID),
    GROQ (FREE/PAID), and OLLAMA (LOCAL), including strict_limits, working_limits (85%),
    safety_margin_percent, and whether active keys are available for that tier.
    """
    telemetry = token_governor.get_hierarchy_telemetry()
    keys = key_manager.get_masked_keys()
    safety_margin = telemetry.get("financial_shield", {}).get("safety_margin_percent", 85)

    catalog = {}
    providers = telemetry.get("providers", {})
    for prov_name, tiers_data in providers.items():
        catalog[prov_name] = {}
        for tier_name, models_data in tiers_data.items():
            if prov_name == "OLLAMA":
                has_keys = True
                active_key_count = 1
            else:
                prov_tier_keys = [
                    k for k in keys
                    if k.get("provider", "").upper() == prov_name.upper()
                    and k.get("tier", "").upper() == tier_name.upper()
                    and k.get("status") == "ACTIVE"
                    and (k.get("cooldown_remaining_sec", 0) <= 0)
                ]
                has_keys = len(prov_tier_keys) > 0
                active_key_count = len(prov_tier_keys)

            models_list = []
            for m_name, m_info in models_data.items():
                models_list.append({
                    "model_name": m_name,
                    "provider": prov_name,
                    "tier": tier_name,
                    "strict_limits": m_info.get("strict_limits", {}),
                    "working_limits": m_info.get("working_limits", {}),
                    "safety_margin_percent": safety_margin,
                    "keys_available": has_keys,
                    "active_key_count": active_key_count
                })
            catalog[prov_name][tier_name] = {
                "keys_available": has_keys,
                "active_key_count": active_key_count,
                "models": models_list
            }

    return {
        "status": "success",
        "safety_margin_percent": safety_margin,
        "catalog": catalog
    }


@app.get("/api/swarms/profiles")
def get_swarm_profiles() -> Dict[str, Any]:
    """
    Returns the configured swarm rosters and active orchestrator role from swarm_profiles.json.
    """
    return _get_or_init_swarm_profiles()


@app.post("/api/swarms/profiles")
def save_swarm_profiles(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Stage 16.2: Persists updated swarm profile rosters, active orchestrator,
    worker models, max models used, routing strategy, and preferred key id.
    """
    try:
        existing = _get_or_init_swarm_profiles()
        for k in ["active_swarm_id", "orchestrator_engine", "worker_models", "max_models_used",
                  "max_concurrency_workers", "routing_strategy", "preferred_key_id", "swarms"]:
            if k in payload:
                existing[k] = payload[k]
        _save_json(SWARM_PROFILES_FILE, existing)
        return {"status": "success", "profiles": existing}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bridge/status")
def get_bridge_status() -> Dict[str, Any]:
    """
    Returns Ollama testing bridge connection state and root workspace path.
    """
    return {
        "status": "success",
        "connected": testing_bridge.is_connected,
        "root_path": testing_bridge.root_path
    }


@app.get("/api/bridge/models")
def get_bridge_models() -> Dict[str, Any]:
    """
    Returns all tested model profiles, capability matrices, and cloud quota tiers.
    """
    return {
        "status": "success",
        "models": testing_bridge.get_all_model_profiles(),
        "best_in_class": testing_bridge.get_best_in_class_matrix(),
        "cloud_quotas": testing_bridge.get_cloud_quotas_matrix()
    }


@app.get("/api/bridge/vram")
def get_bridge_vram() -> Dict[str, Any]:
    """
    Returns live VRAM telemetry (budget, used, available, percentage, loaded models).
    """
    return {
        "status": "success",
        "vram": testing_bridge.get_active_vram_telemetry()
    }


@app.post("/api/bridge/vram/scavenge")
def scavenge_bridge_vram(model_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Purges idle or specific model weights from VRAM via testing_bridge.
    """
    res = testing_bridge.scavenge_idle_vram(model_name)
    return {
        "status": "success" if res.get("success") else "warning",
        "result": res,
        "vram": testing_bridge.get_active_vram_telemetry()
    }


@app.get("/api/bridge/ollama/tags")
def get_bridge_ollama_tags() -> Dict[str, Any]:
    """
    Queries local Ollama tags endpoint to discover installed offline weights.
    """
    import urllib.request
    try:
        req = urllib.request.Request("http://127.0.0.1:11434/api/tags", headers={"User-Agent": "AdvanceAssistant/6.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data
    except Exception:
        return {"models": []}


@app.get("/api/telemetry")
def get_telemetry() -> Dict[str, Any]:
    """
    Returns live RPM/TPM/RPD quota telemetry for all registered models
    via governor.render_live_telemetry_snippet alongside registry limits.
    """
    telemetry_data = {}
    snippets = {}
    for model_name in MODEL_REGISTRY.keys():
        snippet = governor.render_live_telemetry_snippet(model_name)
        snippets[model_name] = snippet
        telemetry_data[model_name] = {
            "snippet": snippet,
            "limits": MODEL_REGISTRY[model_name]
        }

    return {
        "models": telemetry_data,
        "snippets": snippets,
        "reset_schedule": "01:30 PM IST (Midnight PT)",
        "reset_Schedule": "01:30 PM IST (Midnight PT)",
        "shield_threshold": "85% TPM",
        "key_pool": get_detailed_key_telemetry(),
        "hierarchy": governor.get_hierarchy_telemetry()
    }


# ==============================================================================
# STAGE 14.3 HIERARCHICAL GOVERNOR, SUB-AGENT BOUNDS & SHIELD REST API
# ==============================================================================

@app.get("/api/governor/hierarchy")
def get_governor_hierarchy() -> Dict[str, Any]:
    """
    Returns full Provider -> Tier -> Model hierarchy telemetry, sub-agent bounds,
    and multi-provider key pool metrics.
    """
    hier = governor.get_hierarchy_telemetry()
    return {
        "status": "success",
        "hierarchy": hier,
        "key_quotas": hier.get("key_quotas") or governor.get_key_quota_telemetry(),
        "sub_agents": _load_sub_agents(),
        "key_pool": get_detailed_key_telemetry(),
        "cost_estimate": governor.get_cost_and_savings_estimate()
    }


@app.post("/api/governor/limits")
def update_governor_model_limits(req: ModelLimitsUpdateRequest) -> Dict[str, Any]:
    """
    Updates working limits and optional strict limits for a model in the provider hierarchy.
    """
    try:
        res = governor.update_model_limits(
            provider=req.provider,
            tier=req.tier,
            model_name=req.model_name,
            working_limits=req.working_limits,
            strict_limits=req.strict_limits
        )
        return {
            "status": "success",
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/governor/provider-model")
def add_governor_provider_model(req: AddProviderModelRequest) -> Dict[str, Any]:
    """
    Dynamically registers or updates a model under provider and tier with strict & working limits.
    """
    try:
        res = governor.add_or_update_provider_model(
            provider=req.provider,
            tier=req.tier,
            model_name=req.model_name,
            strict_limits=req.strict_limits,
            working_limits=req.working_limits
        )
        return {
            "status": "success",
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/governor/shield")
def update_governor_financial_shield(req: FinancialShieldUpdateRequest) -> Dict[str, Any]:
    """
    Modifies Financial Shield properties (paid_tier_locked, daily_paid_token_cap, etc.).
    """
    try:
        res = governor.update_financial_shield(
            paid_tier_locked=req.paid_tier_locked,
            daily_paid_token_cap=req.daily_paid_token_cap,
            per_build_paid_token_cap=req.per_build_paid_token_cap,
            enforce_working_limits=req.enforce_working_limits,
            safety_margin_percent=req.safety_margin_percent
        )
        return {
            "status": "success",
            **res
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/governor/sync-models")
def sync_governor_models() -> Dict[str, Any]:
    """
    Triggers live model discovery from Google AI Studio, Groq, Ollama daemon,
    and offline benchmark matrices, applying exact 85% working limits.
    """
    try:
        res = governor.sync_live_and_offline_models()
        return res
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/governor/recalculate-85")
def recalculate_governor_limits(req: Optional[RecalculateWorkingLimitsRequest] = None) -> Dict[str, Any]:
    """
    Recalculates working limits for all models in provider hierarchy at specified margin_pct (default 85%).
    """
    try:
        margin = req.margin_pct if req and req.margin_pct is not None else 85
        updated_hierarchy = governor.recalculate_all_working_limits(margin)
        return {
            "status": "success",
            "margin_pct": margin,
            "hierarchy": updated_hierarchy
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def parse_rate_limit_value(val_str: str):
    """Parses numeric or unlimited rate limit values handling k, m, commas, and unlimited."""
    if not val_str:
        return "Unlimited"
    cleaned = str(val_str).strip()
    if cleaned.lower() in ("unlimited", "inf", "infinity", "-", "none", ""):
        return "Unlimited"
    cleaned = cleaned.replace(",", "")
    mM = re.search(r'([\d.]+)\s*[mM]', cleaned)
    if mM:
        return int(float(mM.group(1)) * 1000000)
    kK = re.search(r'([\d.]+)\s*[kK]', cleaned)
    if kK:
        return int(float(kK.group(1)) * 1000)
    d = re.search(r'(\d+)', cleaned)
    if d:
        return int(d.group(1))
    return "Unlimited"


def parse_aistudio_rate_limits(raw_text: str, target_tier: str = "FREE") -> list:
    """
    Parses table text or HTML copied directly from aistudio.google.com/rate-limit.
    Extracts Model Name, Category, RPM, TPM, RPD.
    Normalizes units: K -> * 1,000, M -> * 1,000,000, Unlimited -> 'Unlimited'.
    Calculates exact 85% working limits for numeric values.
    """
    tier_upper = target_tier.upper() if target_tier else "FREE"
    
    # If HTML table is detected, extract cells
    if "<tr" in raw_text.lower() or "<td" in raw_text.lower():
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', raw_text, re.DOTALL | re.IGNORECASE)
        lines_from_html = []
        for r in rows:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', r, re.DOTALL | re.IGNORECASE)
            if not cells:
                cells = re.findall(r'<th[^>]*>(.*?)</th>', r, re.DOTALL | re.IGNORECASE)
            clean_cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
            if clean_cells:
                lines_from_html.append("\t".join(clean_cells))
        raw_text = "\n".join(lines_from_html)

    lines = raw_text.splitlines()
    parsed_models = []

    for line in lines:
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("#"):
            continue

        if "\t" in line_clean:
            parts = [p.strip() for p in line_clean.split("\t") if p.strip()]
        elif "|" in line_clean:
            parts = [p.strip() for p in line_clean.split("|") if p.strip()]
        else:
            parts = [p.strip() for p in re.split(r'\s{2,}', line_clean) if p.strip()]

        if len(parts) >= 2:
            m_raw = parts[0]
            if any(h in m_raw.lower() for h in ["model", "rate limit", "feature"]):
                continue

            slug = re.sub(r'<[^>]+>', '', m_raw).strip()
            slug = re.sub(r'[\s_]+', '-', slug.lower())
            slug = re.sub(r'[^a-z0-9\-.]', '', slug).strip('-')
            if not slug or len(slug) < 3:
                continue

            numeric_parts = parts[1:]
            rpm = None
            tpm = None
            rpd = None

            labeled = False
            for p in numeric_parts:
                p_lower = p.lower()
                if "rpm" in p_lower:
                    rpm = parse_rate_limit_value(p)
                    labeled = True
                elif "tpm" in p_lower:
                    tpm = parse_rate_limit_value(p)
                    labeled = True
                elif "rpd" in p_lower:
                    rpd = parse_rate_limit_value(p)
                    labeled = True

            if not labeled:
                val_parts = [p for p in numeric_parts if not any(w in p.lower() for w in ["text", "modal", "multimodal", "embed", "audio", "video"])]
                if len(val_parts) >= 3:
                    rpm = parse_rate_limit_value(val_parts[0])
                    tpm = parse_rate_limit_value(val_parts[1])
                    rpd = parse_rate_limit_value(val_parts[2])
                elif len(val_parts) == 2:
                    rpm = parse_rate_limit_value(val_parts[0])
                    tpm = parse_rate_limit_value(val_parts[1])
                    rpd = "Unlimited"
                elif len(val_parts) == 1:
                    rpm = parse_rate_limit_value(val_parts[0])
                    tpm = 250000
                    rpd = 500

            if rpm is not None or tpm is not None or rpd is not None:
                rpm = rpm if rpm is not None else 15
                tpm = tpm if tpm is not None else 250000
                rpd = rpd if rpd is not None else "Unlimited"

                w_rpm = "Unlimited" if rpm == "Unlimited" else max(1, int(rpm * 0.85))
                w_tpm = "Unlimited" if tpm == "Unlimited" else max(1000, int(tpm * 0.85))
                w_rpd = "Unlimited" if rpd == "Unlimited" else max(1, int(rpd * 0.85))

                max_in = 128000 if "pro" in slug else (64000 if "argon" in slug else 32768)
                max_out = 8192
                think = 2048 if "pro" in slug else (512 if "flash" in slug else 0)

                parsed_models.append({
                    "model_name": slug,
                    "display_name": m_raw,
                    "target_tier": tier_upper,
                    "strict_limits": {
                        "rpm": rpm,
                        "tpm": tpm,
                        "rpd": rpd,
                        "max_input_tokens": max_in,
                        "max_output_tokens": max_out
                    },
                    "working_limits": {
                        "rpm": w_rpm,
                        "tpm": w_tpm,
                        "rpd": w_rpd,
                        "max_input_tokens": max_in,
                        "max_output_tokens": max_out,
                        "thinking_budget": think
                    }
                })

    return parsed_models


@app.post("/api/governor/import-aistudio-limits")
def import_aistudio_limits(req: ImportAiStudioLimitsRequest) -> Dict[str, Any]:
    """
    Stage 18: 1-Click 'Paste from AI Studio Rate-Limit Page' Importer:
    Parses copied table text or HTML from aistudio.google.com/rate-limit,
    handles K/M/Unlimited units, applies 85% working limits, and persists
    into .agent_memory/provider_quotas.json under GOOGLE -> target_tier.
    """
    try:
        from src.token_governor import token_governor
        target_tier = req.target_tier.upper() if req.target_tier in ("FREE", "PAID") else "FREE"
        parsed = parse_aistudio_rate_limits(req.raw_text, target_tier=target_tier)
        if not parsed:
            raise HTTPException(status_code=400, detail="No valid model rows detected in input text")

        with token_governor.lock:
            quotas = token_governor.quotas
            prov_google = quotas.setdefault("providers", {}).setdefault("GOOGLE", {})
            tier_dict = prov_google.setdefault(target_tier, {})

            for m in parsed:
                m_name = m["model_name"]
                tier_dict[m_name] = {
                    "strict_limits": m["strict_limits"],
                    "working_limits": m["working_limits"]
                }
            token_governor._save_quotas_internal()
            token_governor.reload_state()

        log_action("GOVERNOR", "AISTUDIO_LIMITS_IMPORTED", {
            "target_tier": target_tier,
            "models_count": len(parsed),
            "models": [m["model_name"] for m in parsed]
        })

        return {
            "status": "success",
            "target_tier": target_tier,
            "parsed_count": len(parsed),
            "models": parsed
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/governor/sub-agents")
def get_governor_sub_agents() -> Dict[str, Any]:
    """
    Retrieves configured sub-agent profiles and bounds from .agent_memory/sub_agents.json.
    """
    return {
        "status": "success",
        "sub_agents": _load_sub_agents()
    }


@app.post("/api/governor/sub-agents")
def update_governor_sub_agents(req: SubAgentUpdateRequest) -> Dict[str, Any]:
    """
    Updates an agent role's input/output/thinking bounds, persists cleanly to .agent_memory/sub_agents.json,
    and returns the updated dictionary.
    """
    if not req.agent_name or not req.agent_name.strip():
        raise HTTPException(status_code=400, detail="agent_name cannot be empty.")

    sub_agents = _load_sub_agents()
    name = req.agent_name.strip()
    if name not in sub_agents:
        sub_agents[name] = {}

    agent = sub_agents[name]
    if req.model is not None:
        agent["model"] = req.model
    if req.provider is not None:
        agent["provider"] = req.provider.upper()
    if req.complexity_level is not None:
        agent["complexity_level"] = req.complexity_level
    if req.max_input_tokens is not None:
        agent["max_input_tokens"] = int(req.max_input_tokens)
    if req.max_output_tokens is not None:
        agent["max_output_tokens"] = int(req.max_output_tokens)
    if req.thinking_budget is not None:
        agent["thinking_budget"] = int(req.thinking_budget)
    if req.rpm is not None:
        agent["rpm"] = int(req.rpm)
    if req.tpm is not None:
        agent["tpm"] = int(req.tpm)
    if req.rpd is not None:
        agent["rpd"] = int(req.rpd)
    if req.strengths is not None:
        agent["strengths"] = req.strengths
    if req.weaknesses is not None:
        agent["weaknesses"] = req.weaknesses
    if req.ideal_for is not None:
        agent["ideal_for"] = req.ideal_for

    if not _save_sub_agents(sub_agents):
        raise HTTPException(status_code=500, detail="Failed to persist sub_agents.json")

    return {
        "status": "success",
        "message": f"Updated bounds for sub-agent '{name}'.",
        "agent_name": name,
        "agent": agent,
        "sub_agents": sub_agents
    }


# ==============================================================================
# KNOWLEDGE BASE BOOKS, RECIPES & CONTEXT SIMULATOR ENDPOINTS
# ==============================================================================

@app.get("/api/memory/books")
def get_memory_books() -> Dict[str, Any]:
    """
    Returns detailed list of all memory books across categories,
    including section counts, token estimations, tags, and category summaries.
    """
    detailed = list_all_books_detailed()
    return {
        "status": "success",
        "knowledge_telemetry": get_knowledge_base_telemetry(),
        **detailed
    }


@app.get("/api/memory/book/{category}/{book_name}")
def get_book(category: str, book_name: str) -> Dict[str, Any]:
    """
    Returns full raw Markdown content, parsed sections, token count,
    and tags for a specific book.
    """
    try:
        book_data = read_book_content(category, book_name)
        return {
            "status": "success",
            "book": book_data
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Book '{category}/{book_name}' not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/memory/book")
def save_book(payload: SaveBookPayload) -> Dict[str, Any]:
    """
    Saves or creates a book in the specified category with content and optional tags.
    """
    try:
        book_data = save_book_content(
            category=payload.category,
            book_name=payload.book_name,
            content=payload.content,
            tags=payload.tags
        )
        return {
            "status": "success",
            "message": f"Book '{payload.category}/{payload.book_name}' saved successfully.",
            "book": book_data
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/memory/book/recipe")
def append_recipe(payload: AppendRecipePayload) -> Dict[str, Any]:
    """
    Appends a structured operational recipe to a memory book.
    """
    try:
        book_data = append_book_recipe(
            category=payload.category,
            book_name=payload.book_name,
            title=payload.title,
            insight=payload.insight,
            code_snippet=payload.code_snippet or "",
            tags=payload.tags
        )
        return {
            "status": "success",
            "message": f"Recipe '{payload.title}' appended to '{payload.category}/{payload.book_name}'.",
            "book": book_data
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/memory/book/{category}/{book_name}")
def remove_book(category: str, book_name: str) -> Dict[str, Any]:
    """
    Deletes a specific book from a category.
    """
    try:
        result = delete_book(category, book_name)
        return {
            "status": "success",
            "message": f"Book '{category}/{book_name}' deleted successfully.",
            "category": result.get("category", category),
            "book_name": result.get("book_name", book_name)
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Book '{category}/{book_name}' not found")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/memory/simulate-injection")
def simulate_injection(payload: SimulateInjectionPayload) -> Dict[str, Any]:
    """
    Simulates model-aware precision context snippet retrieval for a given prompt,
    returning relevance scores, matched sections, and measured token savings.
    """
    try:
        result = get_precision_context(
            prompt=payload.prompt,
            model_name=payload.model_name or "qwen2.5-coder:7b",
            max_tokens=payload.max_tokens
        )
        return {
            "status": "success",
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/memory/defrag")
def defrag_memory() -> Dict[str, Any]:
    """
    Triggers topic memory defragmentation and consolidation, returning
    the updated knowledge base telemetry status.
    """
    defragment_and_consolidate_books()
    updated_telemetry = get_knowledge_base_telemetry()
    return {
        "status": "success",
        "message": "Memory books defragmented and consolidated successfully.",
        "knowledge_telemetry": updated_telemetry
    }


# ==============================================================================
# MULTI-API KEY POOLING & RESILIENT ROTATION ENDPOINTS
# ==============================================================================

@app.get("/api/keys")
def get_api_keys() -> Dict[str, Any]:
    """
    Returns list of masked API keys with selection status, tiers, active statuses,
    error counts, and pool-wide routing statistics.
    """
    routing_stat = key_manager.get_routing_status()
    return {
        "status": "success",
        "keys": key_manager.get_masked_keys(),
        "pool_status": key_manager.get_pool_status(),
        "routing_status": routing_stat,
        "routing_policy": routing_stat.get("routing_policy", "GLOBAL_HYBRID")
    }


@app.post("/api/keys")
def add_api_key(payload: KeyRegisterRequest) -> Dict[str, Any]:
    """
    Adds a new Gemini or Groq API key to the key pool with designated provider, tier, label, and selection state.
    """
    if not payload.key or not payload.key.strip():
        raise HTTPException(status_code=400, detail="API key string cannot be empty.")
    try:
        registered = key_manager.add_key(
            key_str=payload.key,
            tier=payload.tier or "FREE",
            label=payload.label or "",
            is_selected=payload.is_selected if payload.is_selected is not None else True,
            provider=payload.provider or "GOOGLE"
        )
        return {
            "status": "success",
            "message": "API key registered in pool successfully.",
            "key": registered
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/keys/{key_id}")
def delete_api_key(key_id: str) -> Dict[str, Any]:
    """
    Removes an API key from the active pool by its unique identifier.
    """
    removed = key_manager.remove_key(key_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"API key with ID '{key_id}' not found.")
    return {
        "status": "success",
        "message": f"API key '{key_id}' removed from pool."
    }


@app.post("/api/keys/test")
def test_api_key(payload: KeyTestRequest) -> Dict[str, Any]:
    """
    Tests live authentication against Google GenAI or Groq Cloud for a new or existing API key.
    """
    if payload.id:
        result = key_manager.test_key_by_id(payload.id)
    elif payload.key:
        result = key_manager.test_key(payload.key, provider=payload.provider or "GOOGLE")
    else:
        raise HTTPException(status_code=400, detail="Must provide either 'key' or 'id' to test.")

    return result


@app.get("/api/keys/policy")
def get_routing_policy() -> Dict[str, Any]:
    """
    Returns current routing policy, pinned key ID, and pool selection statistics.
    """
    return {
        "status": "success",
        **key_manager.get_routing_status()
    }


@app.post("/api/keys/policy")
def set_routing_policy(payload: SetPolicyPayload) -> Dict[str, Any]:
    """
    Sets active routing policy ('GLOBAL_HYBRID', 'FREE_POOL', 'PAID_POOL', 'SINGLE_PINNED')
    and optional pinned key ID.
    """
    try:
        updated_status = key_manager.set_routing_policy(payload.policy, payload.pinned_key_id)
        return {
            "status": "success",
            "message": f"Routing policy updated to '{payload.policy}'.",
            "policy": updated_status.get("routing_policy"),
            "pinned_key_id": updated_status.get("pinned_key_id"),
            "routing_status": updated_status
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/keys/selection")
def toggle_key_selection(payload: ToggleSelectionPayload) -> Dict[str, Any]:
    """
    Toggles key inclusion in active swarm operations.
    """
    try:
        updated_key = key_manager.toggle_key_selection(payload.key_id, payload.is_selected)
        return {
            "status": "success",
            "message": f"Key selection updated to {payload.is_selected}.",
            "key": updated_key
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/keys/tier-mode")
def set_tier_mode(payload: TierModePayload) -> Dict[str, Any]:
    """
    Updates the active tier routing mode / policy (backward compatibility).
    """
    mode = key_manager.set_tier_mode(payload.mode)
    return {
        "status": "success",
        "active_tier_mode": mode
    }


@app.get("/api/keys/quotas")
def get_all_key_quotas() -> Dict[str, Any]:
    """
    Returns complete per-key quota telemetry and live usage across all registered keys.
    """
    return governor.get_key_quota_telemetry()


@app.get("/api/keys/{key_id}/quotas")
def get_single_key_quotas(key_id: str) -> Dict[str, Any]:
    """
    Returns dedicated per-key quota telemetry and usage for a specific key.
    """
    res = governor.get_key_quota_telemetry(key_id)
    if res.get("status") == "error":
        raise HTTPException(status_code=404, detail=res.get("message", f"Key ID '{key_id}' not found"))
    return res


@app.post("/api/keys/{key_id}/limits")
def update_key_limits(key_id: str, req: KeyLimitsUpdateRequest) -> Dict[str, Any]:
    """
    Saves dedicated per-key model limits and/or updates the key's safety margin percentage.
    """
    try:
        updated_data = {}
        if req.safety_margin_percent is not None:
            margin_res = key_manager.set_key_safety_margin(key_id, req.safety_margin_percent)
            updated_data["safety_margin"] = margin_res

        if req.model_name and req.working_limits:
            model_res = key_manager.set_key_model_limits(
                key_id=key_id,
                model_name=req.model_name,
                working_limits=req.working_limits,
                strict_limits=req.strict_limits
            )
            updated_data["model_limits"] = model_res

        return {
            "status": "success",
            "key_id": key_id,
            "updated": updated_data,
            "telemetry": governor.get_key_quota_telemetry(key_id)
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _run_background_blueprint(
    target_dest: str,
    project_name: str,
    goal: str,
    tasks: list,
    mode: str,
    profile: str,
    constrain: str,
    max_workers: int,
    orchestrator_model: Optional[str] = None,
    worker_models: Optional[List[str]] = None,
    max_models_used: Optional[int] = None,
    routing_strategy: str = "ROUND_ROBIN",
    preferred_key_id: Optional[str] = None
):
    """Worker function executed inside a detached background thread for approved blueprint execution with swarm roster."""
    try:
        res = execute_approved_blueprint(
            tasks=tasks,
            target_destination=target_dest,
            project_name=project_name,
            goal=goal,
            max_workers=max_workers,
            execution_mode=mode,
            research_profile=profile,
            model_profile=constrain,
            isolate=False,
            orchestrator_model=orchestrator_model,
            worker_models=worker_models,
            max_models_used=max_models_used,
            routing_strategy=routing_strategy,
            preferred_key_id=preferred_key_id
        )
        final_status = res.get("status", "COMPLETED")
        with execution_lock:
            execution_state["status"] = final_status
            execution_state["current_phase"] = final_status
            execution_state["end_time"] = time.time()
    except Exception as exc:
        with execution_lock:
            execution_state["status"] = "FAILED"
            execution_state["current_phase"] = "FAILED"
            execution_state["error"] = str(exc)
            execution_state["end_time"] = time.time()
    finally:
        with execution_lock:
            execution_state["is_running"] = False


def _run_background_build(
    target_dest: str,
    project_name: str,
    goal: str,
    mode: str,
    profile: str,
    constrain: str,
    isolate: bool,
    max_workers: Optional[int],
    orchestrator_model: Optional[str] = None,
    worker_models: Optional[List[str]] = None,
    max_models_used: Optional[int] = None,
    routing_strategy: str = "ROUND_ROBIN",
    preferred_key_id: Optional[str] = None
):
    """Worker function executed inside a detached background thread with multi-model swarm dispatch."""
    try:
        supervisor = ProjectSupervisor(
            target_destination=target_dest,
            isolate=isolate,
            max_workers=max_workers,
            project_name=project_name
        )
        supervisor.process_complete_development_cycle(
            master_instruction=goal,
            mode_override=mode,
            profile_level=profile,
            constraining_profile=constrain,
            orchestrator_model=orchestrator_model,
            worker_models=worker_models,
            max_models_used=max_models_used,
            routing_strategy=routing_strategy,
            preferred_key_id=preferred_key_id
        )
        with execution_lock:
            execution_state["status"] = "COMPLETED"
            execution_state["current_phase"] = "COMPLETED"
        try:
            reg = _load_json(SWARM_REGISTRY_FILE, {})
            reg["status"] = "COMPLETED"
            _save_json(SWARM_REGISTRY_FILE, reg)
        except Exception:
            pass
    except Exception as exc:
        with execution_lock:
            execution_state["status"] = "FAILED"
            execution_state["current_phase"] = "FAILED"
            execution_state["error"] = str(exc)
        try:
            reg = _load_json(SWARM_REGISTRY_FILE, {})
            reg["status"] = "FAILED"
            _save_json(SWARM_REGISTRY_FILE, reg)
        except Exception:
            pass
    finally:
        with execution_lock:
            execution_state["is_running"] = False
            execution_state["end_time"] = time.time()


@app.post("/api/execute")
def execute_build(payload: ExecutePayload) -> Dict[str, Any]:
    """
    Spawns ProjectSupervisor.process_complete_development_cycle in a background thread.
    Rejects concurrent builds with HTTP 409 Conflict if a task is already running.
    """
    if not payload.goal or not payload.goal.strip():
        raise HTTPException(status_code=400, detail="A non-empty 'goal' is required.")

    with execution_lock:
        if execution_state["is_running"]:
            raise HTTPException(
                status_code=409,
                detail=f"A build job is actively running for project '{execution_state['project_name']}'."
            )

        target_raw = payload.target_path if payload.target_path else get_last_env_location()
        target_dest = normalize_wsl_path(target_raw)
        project_name = payload.project_name or "default_project"

        try:
            token_governor.reset_build_counter(project_name)
        except Exception:
            pass
        active_mode = payload.mode or DEFAULT_EXECUTION_MODE
        active_profile = payload.profile or DEFAULT_RESEARCH_PROFILE
        active_constrain = payload.constrain or DEFAULT_MODEL_CONSTRAINING_PROFILE
        active_isolate = DEFAULT_ISOLATION_ENABLED if payload.isolate is None else payload.isolate
        swarm_conf = _get_or_init_swarm_profiles()
        active_swarm_id = swarm_conf.get("active_swarm_id", "GLOBAL_HYBRID_SWARM")
        active_orchestrator = payload.orchestrator_model or swarm_conf.get("orchestrator_engine", LOCAL_ORCHESTRATOR_MODEL)
        active_worker_models = payload.worker_models or swarm_conf.get("worker_models", ["gemini-2.5-flash", "qwen2.5-coder:7b"])
        active_max_models = payload.max_models_used or swarm_conf.get("max_models_used", len(active_worker_models))
        active_strategy = payload.routing_strategy or swarm_conf.get("routing_strategy", "ROUND_ROBIN")
        active_preferred_key = payload.preferred_key_id or swarm_conf.get("preferred_key_id", "AUTO")
        default_workers = swarm_conf.get("max_concurrency_workers", 8)

        # Worker clamping from [1, 9] to [1, 16]
        raw_workers = payload.max_workers if payload.max_workers is not None else default_workers
        active_max_workers = max(1, min(int(raw_workers), 16))

        execution_state["is_running"] = True
        execution_state["is_paused"] = False
        execution_state["status"] = "RUNNING"
        execution_state["current_phase"] = "STARTING"
        execution_state["project_name"] = project_name
        execution_state["target_path"] = target_dest
        execution_state["goal"] = payload.goal
        execution_state["mode"] = active_mode
        execution_state["profile"] = active_profile
        execution_state["constrain"] = active_constrain
        execution_state["isolate"] = active_isolate
        execution_state["active_swarm_id"] = active_swarm_id
        execution_state["orchestrator_engine"] = active_orchestrator
        execution_state["worker_models"] = active_worker_models
        execution_state["max_models_used"] = active_max_models
        execution_state["routing_strategy"] = active_strategy
        execution_state["preferred_key_id"] = active_preferred_key
        execution_state["max_workers"] = active_max_workers
        execution_state["start_time"] = time.time()
        execution_state["end_time"] = None
        execution_state["error"] = None

    # Update swarm_registry.json so /swarm and /logs reflect active swarm during execution
    try:
        current_registry = _load_json(SWARM_REGISTRY_FILE, {})
        current_registry.update({
            "project_name": project_name,
            "project_root": target_dest,
            "active_workspace": target_dest,
            "active_swarm_id": active_swarm_id,
            "orchestrator_engine": active_orchestrator,
            "active_worker_models": active_worker_models[:active_max_models],
            "max_available_workers": active_max_workers,
            "status": "RUNNING"
        })
        _save_json(SWARM_REGISTRY_FILE, current_registry)
    except Exception:
        pass

    worker_thread = threading.Thread(
        target=_run_background_build,
        args=(
            target_dest,
            project_name,
            payload.goal,
            active_mode,
            active_profile,
            active_constrain,
            active_isolate,
            active_max_workers,
            active_orchestrator,
            active_worker_models,
            active_max_models,
            active_strategy,
            active_preferred_key
        ),
        daemon=True
    )
    worker_thread.start()

    return {
        "status": "started",
        "message": f"Background development cycle initiated for project '{project_name}'.",
        "execution_state": {
            "project_name": project_name,
            "target_path": target_dest,
            "mode": active_mode,
            "profile": active_profile,
            "constrain": active_constrain,
            "isolate": active_isolate,
            "active_swarm_id": active_swarm_id,
            "orchestrator_engine": active_orchestrator,
            "max_workers": active_max_workers
        }
    }


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """
    Continuous WebSocket telemetry feed streaming execution state,
    swarm registry status, and per-model quotas every 1.0 second.
    """
    await websocket.accept()
    try:
        while True:
            with execution_lock:
                state_copy = dict(execution_state)

            swarm_conf = _get_or_init_swarm_profiles()
            swarm_status = _load_json(SWARM_REGISTRY_FILE, {
                "project_name": None,
                "project_root": None,
                "active_workspace": None,
                "max_available_workers": swarm_conf.get("max_concurrency_workers", 8),
                "domain_locks": {},
                "completed_files": [],
                "status": "IDLE"
            })
            swarm_status.setdefault("active_swarm_id", swarm_conf.get("active_swarm_id", "GLOBAL_HYBRID_SWARM"))
            swarm_status.setdefault("orchestrator_engine", swarm_conf.get("orchestrator_engine", LOCAL_ORCHESTRATOR_MODEL))

            quotas = {}
            for model_name in MODEL_REGISTRY.keys():
                quotas[model_name] = {
                    "snippet": governor.render_live_telemetry_snippet(model_name),
                    "limits": MODEL_REGISTRY.get(model_name, {})
                }

            payload = {
                "execution_state": state_copy,
                "swarm_registry": swarm_status,
                "quotas": quotas,
                "knowledge_telemetry": get_knowledge_base_telemetry(),
                "key_pool": get_detailed_key_telemetry(),
                "hierarchy": governor.get_hierarchy_telemetry(),
                "cost_estimate": governor.get_cost_and_savings_estimate(),
                "timestamp": time.time()
            }

            await websocket.send_json(payload)
            await asyncio.sleep(1.0)
    except (WebSocketDisconnect, ConnectionResetError):
        pass
    except Exception:
        pass



# ==============================================================================
# MULTI-STREAM LOG PARSER, QUERY ENGINE & LIVE WEBSOCKET TAIL
# ==============================================================================

LOGS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "logs"))
TEST_LOGS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "test", "test_logs"))

LOG_LINE_REGEX = re.compile(
    r"^\[(?P<timestamp>[^\]]+)\]\s+\[MODEL:(?P<model>[^\]]+)\]\s+\[CAT:(?P<category>[^\]]+)\]\s+\[(?P<action>[^\]]+)\]\s+\[ENV:(?P<env>[^\]]+)\]\s+(?P<details>.*)$"
)


def _parse_log_line(line: str, line_num: int) -> Dict[str, Any]:
    """
    Parses a single formatted log line produced by src/logger.py:
    [YYYY-MM-DD HH:MM:SS.mmm IST] [MODEL:<MODEL>] [CAT:<CATEGORY>] [<ACTION_TYPE>] [ENV:<ENV>] <JSON_DETAILS>
    Derives severity (ERROR, WARNING, SUCCESS, INFO) automatically.
    """
    stripped = line.strip()
    match = LOG_LINE_REGEX.match(stripped)
    if not match:
        return {
            "id": line_num,
            "timestamp": "",
            "model": "SYSTEM",
            "category": "GENERAL",
            "action": "RAW_LOG",
            "env": "LOCAL",
            "severity": "INFO",
            "details": {"raw_message": stripped},
            "raw": stripped
        }

    timestamp = match.group("timestamp")
    model = match.group("model")
    category = match.group("category")
    action = match.group("action")
    env = match.group("env")
    raw_details = match.group("details").strip()

    try:
        details = json.loads(raw_details) if raw_details else {}
    except Exception:
        details = {"raw_message": raw_details}

    action_upper = action.upper()
    severity = "INFO"

    err_keywords = ["FAILED", "ERROR", "EXCEPT", "CRASH", "DENIED", "BLOCKED", "TIMEOUT", "HAZARD"]
    warn_keywords = ["WARN", "FALLBACK", "LOCKOUT", "CONSTRAINED", "COOLING", "SHIELD", "CAP", "ANOMALY", "EXHAUSTED"]
    succ_keywords = ["SUCCESS", "COMPLETE", "DONE", "READY", "ALLOWED", "INITIALIZED", "MUTATED"]

    has_error = False
    if isinstance(details, dict):
        if details.get("error"):
            has_error = True
        elif any("error" in str(k).lower() for k in details.keys()):
            has_error = True

    if any(w in action_upper for w in err_keywords) or has_error:
        severity = "ERROR"
    elif any(w in action_upper for w in warn_keywords):
        severity = "WARNING"
    elif any(w in action_upper for w in succ_keywords):
        severity = "SUCCESS"
    else:
        severity = "INFO"

    return {
        "id": line_num,
        "timestamp": timestamp,
        "model": model,
        "category": category,
        "action": action,
        "env": env,
        "severity": severity,
        "details": details,
        "raw": stripped
    }


def _resolve_log_path(source_type: str, source_name: Optional[str] = None) -> str:
    """
    Resolves log file path across all 6 streams and prevents path traversal outside
    LOGS_DIR and TEST_LOGS_DIR.
    """
    if source_name and (".." in source_name or source_name.startswith("/") or source_name.startswith("\\")):
        raise HTTPException(status_code=400, detail="Path traversal forbidden.")

    source_type = (source_type or "master").lower().strip()
    clean_source_name = source_name.strip() if source_name else None

    if source_type == "master":
        target_path = os.path.join(LOGS_DIR, "master_timeline.log")

    elif source_type == "daily":
        if clean_source_name:
            fname = os.path.basename(clean_source_name)
            if not fname.endswith(".log"):
                fname += ".log"
            target_path = os.path.join(LOGS_DIR, "daily", fname)
        else:
            daily_dir = os.path.join(LOGS_DIR, "daily")
            files = sorted([f for f in os.listdir(daily_dir) if f.endswith(".log")], reverse=True) if os.path.exists(daily_dir) else []
            fname = files[0] if files else f"{time.strftime('%Y-%m-%d')}.log"
            target_path = os.path.join(LOGS_DIR, "daily", fname)

    elif source_type == "category":
        if clean_source_name:
            parts = clean_source_name.replace("\\", "/").strip("/").split("/")
            cat = os.path.basename(parts[0])
            act = os.path.basename(parts[1]) if len(parts) > 1 else ""
            if act and not act.endswith(".log"):
                act += ".log"
            target_path = os.path.join(LOGS_DIR, "categories", cat, act)
        else:
            target_path = os.path.join(LOGS_DIR, "categories", "general", "system_initialized.log")

    elif source_type == "model":
        if clean_source_name:
            mf = os.path.basename(clean_source_name)
            if not mf.endswith(".log"):
                mf += ".log"
            target_path = os.path.join(LOGS_DIR, "categories", "models", mf)
        else:
            target_path = os.path.join(LOGS_DIR, "categories", "models", "gateway.log")

    elif source_type == "project":
        pname = os.path.basename((clean_source_name or "default_project").replace("\\", "/").strip("/"))
        target_path = os.path.join(LOGS_DIR, "projects", pname, "execution_trace.log")

    elif source_type == "test":
        if clean_source_name:
            tf = os.path.basename(clean_source_name)
            if not tf.endswith(".log"):
                tf += ".log"
            target_path = os.path.join(TEST_LOGS_DIR, tf)
        else:
            target_path = os.path.join(TEST_LOGS_DIR, "test_offline_pipeline.log")

    else:
        target_path = os.path.join(LOGS_DIR, "master_timeline.log")

    abs_target = os.path.abspath(target_path)
    if not (abs_target.startswith(LOGS_DIR) or abs_target.startswith(TEST_LOGS_DIR)):
        raise HTTPException(status_code=400, detail="Path traversal forbidden.")

    return abs_target


@app.get("/api/logs/sources")
def get_log_sources() -> Dict[str, Any]:
    """
    Discovers and returns all available multi-stream log files across master,
    daily, categories, models, projects, and test logs.
    """
    master_path = os.path.join(LOGS_DIR, "master_timeline.log")
    master_info = {
        "exists": os.path.exists(master_path),
        "size_bytes": os.path.getsize(master_path) if os.path.exists(master_path) else 0,
        "path": "logs/master_timeline.log"
    }

    daily_dir = os.path.join(LOGS_DIR, "daily")
    daily_logs = []
    if os.path.exists(daily_dir):
        for f in sorted(os.listdir(daily_dir), reverse=True):
            if f.endswith(".log"):
                fp = os.path.join(daily_dir, f)
                daily_logs.append({
                    "name": f,
                    "size_bytes": os.path.getsize(fp),
                    "path": f"logs/daily/{f}"
                })

    cat_dir = os.path.join(LOGS_DIR, "categories")
    categories = {}
    if os.path.exists(cat_dir):
        for c in sorted(os.listdir(cat_dir)):
            if c.lower() == "models":
                continue
            cp = os.path.join(cat_dir, c)
            if os.path.isdir(cp):
                action_files = []
                for af in sorted(os.listdir(cp)):
                    if af.endswith(".log"):
                        afp = os.path.join(cp, af)
                        action_files.append({
                            "name": af,
                            "action": af[:-4],
                            "size_bytes": os.path.getsize(afp),
                            "path": f"logs/categories/{c}/{af}"
                        })
                categories[c] = action_files

    models_dir = os.path.join(LOGS_DIR, "categories", "models")
    models = []
    if os.path.exists(models_dir):
        for mf in sorted(os.listdir(models_dir)):
            if mf.endswith(".log"):
                mfp = os.path.join(models_dir, mf)
                models.append({
                    "name": mf,
                    "model": mf[:-4],
                    "size_bytes": os.path.getsize(mfp),
                    "path": f"logs/categories/models/{mf}"
                })

    projects_dir = os.path.join(LOGS_DIR, "projects")
    projects = []
    if os.path.exists(projects_dir):
        for pf in sorted(os.listdir(projects_dir)):
            pfp = os.path.join(projects_dir, pf)
            if os.path.isdir(pfp):
                trace_path = os.path.join(pfp, "execution_trace.log")
                ledger_path = os.path.join(pfp, "blueprint_ledger.json")
                has_trace = os.path.exists(trace_path)
                has_ledger = os.path.exists(ledger_path)
                projects.append({
                    "name": pf,
                    "has_trace": has_trace,
                    "has_ledger": has_ledger,
                    "trace_size": os.path.getsize(trace_path) if has_trace else 0,
                    "path": f"logs/projects/{pf}"
                })

    test_logs = []
    if os.path.exists(TEST_LOGS_DIR):
        for tf in sorted(os.listdir(TEST_LOGS_DIR)):
            if tf.endswith(".log"):
                tfp = os.path.join(TEST_LOGS_DIR, tf)
                test_logs.append({
                    "name": tf,
                    "test_name": tf[:-4],
                    "size_bytes": os.path.getsize(tfp),
                    "path": f"test/test_logs/{tf}"
                })

    return {
        "status": "success",
        "sources": {
            "master": master_info,
            "daily_logs": daily_logs,
            "categories": categories,
            "models": models,
            "projects": projects,
            "test_logs": test_logs
        }
    }


@app.get("/api/logs/query")
def query_logs(
    source_type: str = "master",
    source_name: Optional[str] = None,
    model: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 300,
    tail: bool = True
) -> Dict[str, Any]:
    """
    Multi-dimensional query engine filtering structured log streams with facets,
    severity counts, substring search, and tail limits.
    """
    target_path = _resolve_log_path(source_type, source_name)
    clamped_limit = min(max(1, limit), 2000)
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    if not os.path.exists(target_path):
        return {
            "status": "not_found",
            "source_type": source_type,
            "source_name": source_name,
            "resolved_path": os.path.relpath(target_path, repo_root),
            "total_matched": 0,
            "entries": [],
            "facets": {
                "models": [],
                "categories": [],
                "counts": {"INFO": 0, "SUCCESS": 0, "WARNING": 0, "ERROR": 0}
            }
        }

    try:
        with open(target_path, "r", encoding="utf-8", errors="replace") as f:
            raw_lines = f.readlines()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read log stream: {str(e)}")

    parsed_entries = []
    seen_models = set()
    seen_categories = set()
    counts = {"INFO": 0, "SUCCESS": 0, "WARNING": 0, "ERROR": 0}

    for idx, line in enumerate(raw_lines, start=1):
        entry = _parse_log_line(line, idx)
        parsed_entries.append(entry)
        if entry["model"] and entry["model"] != "UNKNOWN":
            seen_models.add(entry["model"])
        if entry["category"]:
            seen_categories.add(entry["category"])
        sev = entry["severity"]
        if sev in counts:
            counts[sev] += 1
        else:
            counts[sev] = 1

    # Apply active filters
    model_filter = model.strip().lower() if model and model.strip().upper() != "ALL" else None
    cat_filter = category.strip().lower() if category and category.strip().upper() != "ALL" else None
    sev_filter = severity.strip().upper() if severity and severity.strip().upper() != "ALL" else None
    search_filter = search.strip().lower() if search and search.strip() else None

    filtered = []
    for entry in parsed_entries:
        if model_filter and model_filter not in entry["model"].lower():
            continue
        if cat_filter and cat_filter not in entry["category"].lower():
            continue
        if sev_filter and entry["severity"] != sev_filter:
            continue
        if search_filter:
            haystack = f"{entry['action']} {entry['model']} {entry['category']} {entry['raw']}".lower()
            if search_filter not in haystack:
                continue
        filtered.append(entry)

    total_matched = len(filtered)
    if tail:
        limited_entries = filtered[-clamped_limit:]
    else:
        limited_entries = filtered[:clamped_limit]

    rel_path = os.path.relpath(target_path, repo_root)

    return {
        "status": "success",
        "source_type": source_type,
        "source_name": source_name,
        "resolved_path": rel_path,
        "total_matched": total_matched,
        "entries": limited_entries,
        "facets": {
            "models": sorted(list(seen_models)),
            "categories": sorted(list(seen_categories)),
            "counts": counts
        }
    }


@app.get("/api/logs/project/{project_name}/ledger")
def get_project_blueprint_ledger(project_name: str) -> Dict[str, Any]:
    """
    Reads and returns logs/projects/<project_name>/blueprint_ledger.json if present.
    """
    if ".." in project_name or project_name.startswith("/") or project_name.startswith("\\"):
        raise HTTPException(status_code=400, detail="Path traversal forbidden.")

    clean_pname = os.path.basename(project_name.replace("\\", "/").strip("/"))
    ledger_path = os.path.join(LOGS_DIR, "projects", clean_pname, "blueprint_ledger.json")

    if not os.path.exists(ledger_path):
        return {
            "status": "not_found",
            "project_name": clean_pname,
            "ledger": None,
            "message": f"No blueprint ledger exists for project '{clean_pname}'."
        }

    try:
        with open(ledger_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "status": "success",
            "project_name": clean_pname,
            "ledger": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read project ledger: {str(e)}")


@app.websocket("/ws/logs")
async def websocket_logs(
    websocket: WebSocket,
    source_type: Optional[str] = "master",
    source_name: Optional[str] = None
):
    """
    Live log tail WebSocket.
    Pushes initial batch of last 100 parsed entries, then polls for file growth
    every 1.0s and streams newly appended lines in real-time.
    """
    await websocket.accept()
    st = source_type or websocket.query_params.get("source_type") or "master"
    sn = source_name or websocket.query_params.get("source_name")

    try:
        target_path = _resolve_log_path(st, sn)
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close()
        return

    try:
        initial_entries = []
        last_size = 0
        total_lines = 0

        if os.path.exists(target_path):
            last_size = os.path.getsize(target_path)
            try:
                with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                    all_lines = f.readlines()
                total_lines = len(all_lines)
                start_idx = max(1, total_lines - 99)
                for idx, line in enumerate(all_lines[-100:], start=start_idx):
                    initial_entries.append(_parse_log_line(line, idx))
            except Exception:
                pass

        await websocket.send_json({
            "type": "initial_batch",
            "source_type": st,
            "source_name": sn,
            "resolved_path": os.path.basename(target_path),
            "total_file_lines": total_lines,
            "entries": initial_entries
        })

        while True:
            await asyncio.sleep(1.0)
            if not os.path.exists(target_path):
                await websocket.send_json({"type": "heartbeat", "timestamp": time.time()})
                continue

            current_size = os.path.getsize(target_path)
            if current_size > last_size:
                new_entries = []
                try:
                    with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                        f.seek(last_size)
                        new_text = f.read()
                    last_size = current_size

                    lines = [l for l in new_text.splitlines() if l.strip()]
                    for l in lines:
                        total_lines += 1
                        new_entries.append(_parse_log_line(l, total_lines))

                    if new_entries:
                        await websocket.send_json({
                            "type": "new_entries",
                            "source_type": st,
                            "source_name": sn,
                            "entries": new_entries,
                            "timestamp": time.time()
                        })
                    else:
                        await websocket.send_json({"type": "heartbeat", "timestamp": time.time()})
                except Exception:
                    await websocket.send_json({"type": "heartbeat", "timestamp": time.time()})
            elif current_size < last_size:
                last_size = 0
                total_lines = 0
                await websocket.send_json({"type": "file_rotated", "timestamp": time.time()})
            else:
                await websocket.send_json({"type": "heartbeat", "timestamp": time.time()})

    except (WebSocketDisconnect, ConnectionResetError):
        pass
    except Exception:
        pass


if __name__ == "__main__":
    uvicorn.run("src.server:app", host="0.0.0.0", port=8000, reload=False)


# ==============================================================================
# STAGE 15.2 LIFECYCLE, WORKSPACE SCANNER, FILE INSPECTOR & BLUEPRINT API
# ==============================================================================

@app.post("/api/execute/stop")
def stop_build() -> Dict[str, Any]:
    """
    Halts any actively running supervisor build or blueprint execution immediately.
    """
    res = request_build_stop()
    with execution_lock:
        execution_state["is_running"] = False
        execution_state["status"] = "CANCELLED"
        execution_state["current_phase"] = "CANCELLED_BY_USER"
        execution_state["end_time"] = time.time()
    return {"status": "success", "state": "CANCELLED"}


@app.post("/api/execute/pause")
def pause_build(payload: Optional[PausePayload] = None) -> Dict[str, Any]:
    """
    Toggles or sets the pause state for the active development cycle.
    """
    is_pause = payload.paused if payload else None
    res = toggle_build_pause(is_pause)
    is_paused = res.get("paused", False)
    with execution_lock:
        execution_state["is_paused"] = is_paused
        if is_paused:
            execution_state["current_phase"] = "PAUSED"
        elif execution_state.get("is_running"):
            execution_state["current_phase"] = "RUNNING"
    return {"status": "success", "paused": is_paused, "state": res.get("state")}


@app.get("/api/governor/cost-estimate")
def get_governor_cost_estimate() -> Dict[str, Any]:
    """
    Returns actual paid cloud spend and estimated savings from free/local models.
    """
    return {
        "status": "success",
        "cost_estimate": governor.get_cost_and_savings_estimate()
    }


@app.get("/api/workspace/scan")
def scan_workspace(path: Optional[str] = None) -> Dict[str, Any]:
    """
    Stage 15.2 Continuous Iterative Workspace Scanner:
    Inspects existing projects, calculates file counts, sizes, extensions, and
    detects historical architecture blueprint ledgers for continuous development.
    """
    target_raw = path if path else get_last_env_location()
    norm_path = normalize_wsl_path(target_raw)

    clean_p_name = re.sub(r'[\W_]+', '_', str(os.path.basename(norm_path.rstrip("/")))).strip('_').lower()
    ledger_path = os.path.join(PROJECT_LOG_DIR, clean_p_name, "blueprint_ledger.json")

    if not os.path.exists(norm_path):
        return {
            "status": "success",
            "exists": False,
            "resolved_path": norm_path,
            "project_name": os.path.basename(norm_path.rstrip("/")) or "workspace",
            "file_count": 0,
            "files": [],
            "language_breakdown": {},
            "has_existing_ledger": os.path.exists(ledger_path)
        }

    files_list = []
    ext_counts = {}
    ignored_dirs = {".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".staging_temp"}

    for root, dirs, files in os.walk(norm_path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith(".")]
        for f in sorted(files):
            if len(files_list) >= 300:
                break
            full_p = os.path.join(root, f)
            rel_p = os.path.relpath(full_p, norm_path).replace(chr(92), "/")
            try:
                st = os.stat(full_p)
                sz = st.st_size
                mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))
            except Exception:
                sz = 0
                mtime_str = ""
            ext = os.path.splitext(f)[1].lower() or "no_ext"
            ext_counts[ext] = ext_counts.get(ext, 0) + 1
            files_list.append({
                "rel_path": rel_p,
                "size_bytes": sz,
                "ext": ext,
                "last_modified": mtime_str
            })
        if len(files_list) >= 300:
            break

    return {
        "status": "success",
        "exists": True,
        "resolved_path": norm_path,
        "project_name": os.path.basename(norm_path.rstrip("/")) or "workspace",
        "file_count": len(files_list),
        "files": files_list,
        "language_breakdown": ext_counts,
        "has_existing_ledger": os.path.exists(ledger_path)
    }


@app.get("/api/workspace/file")
def get_workspace_file(workspace_dir: str, file_path: str) -> Dict[str, Any]:
    """
    Stage 15.2 Live Workspace File Inspector:
    Resolves and securely inspects source code and configuration files within
    allowed workspace boundaries, enforcing path traversal and sensitive file guards.
    """
    if not workspace_dir or not file_path:
        raise HTTPException(status_code=400, detail="Both 'workspace_dir' and 'file_path' are required.")

    clean_parts = file_path.replace(chr(92), "/").split("/")
    if ".." in clean_parts:
        raise HTTPException(status_code=400, detail="Path traversal forbidden.")

    norm_ws = normalize_wsl_path(workspace_dir)
    clean_rel = file_path.strip().replace(chr(92), "/").lstrip("/")
    full_resolved = os.path.normpath(os.path.join(norm_ws, clean_rel))

    if not (full_resolved.startswith(norm_ws) or full_resolved.startswith("/tmp") or full_resolved.startswith("/mnt/")):
        raise HTTPException(status_code=400, detail="Target path is outside allowed workspace boundaries.")

    base_lower = os.path.basename(full_resolved).lower()
    blocked_sensitive = [".env", "api_keys.json", "id_rsa", "id_ed25519", "shadow", "passwd", "sudoers"]
    if any(b in base_lower for b in blocked_sensitive) or "/etc/" in full_resolved:
        raise HTTPException(status_code=403, detail=f"Access to sensitive file '{base_lower}' is blocked.")

    if not os.path.exists(full_resolved) or not os.path.isfile(full_resolved):
        raise HTTPException(status_code=404, detail=f"File '{file_path}' not found in workspace.")

    try:
        size_b = os.path.getsize(full_resolved)
        with open(full_resolved, "r", encoding="utf-8", errors="replace") as f:
            content_str = f.read(204800)  # Up to 200 KB
        lines = content_str.splitlines()
        st = os.stat(full_resolved)
        mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))

        ext = os.path.splitext(full_resolved)[1].lower()
        ext_map = {
            ".py": "python", ".js": "javascript", ".jsx": "javascript",
            ".ts": "typescript", ".tsx": "typescript", ".json": "json",
            ".md": "markdown", ".html": "html", ".css": "css",
            ".sh": "bash", ".bash": "bash", ".sql": "sql",
            ".yaml": "yaml", ".yml": "yaml", ".txt": "plaintext"
        }
        inferred_lang = ext_map.get(ext, "plaintext")

        return {
            "status": "success",
            "file_path": clean_rel,
            "full_path": full_resolved,
            "size_bytes": size_b,
            "line_count": len(lines),
            "language": inferred_lang,
            "last_modified": mtime_str,
            "content": content_str
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(exc)}")


@app.post("/api/blueprint/preview")
def create_blueprint_preview(req: BlueprintPreviewRequest) -> Dict[str, Any]:
    """
    Stage 15.2 Pre-Flight Blueprint Generator:
    Produces a structured file task list with CREATE/MODIFY actions, model/agent
    assignments, and token budget estimations without modifying workspace files.
    """
    if not req.goal or not req.goal.strip():
        raise HTTPException(status_code=400, detail="A non-empty 'goal' is required.")

    try:
        blueprint = generate_preflight_blueprint(
            goal=req.goal,
            target_dir=req.target_dir,
            project_name=req.project_name,
            execution_mode=req.execution_mode,
            orchestrator_model=req.orchestrator_model,
            worker_models=req.worker_models,
            max_models_used=req.max_models_used,
            routing_strategy=req.routing_strategy or "ROUND_ROBIN",
            preferred_key_id=req.preferred_key_id,
            use_existing_context=req.use_existing_context
        )
        return {
            "status": "success",
            "blueprint": blueprint
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate blueprint preview: {str(exc)}")


@app.get("/api/blueprint/preview")
def get_latest_blueprint_preview() -> Dict[str, Any]:
    """
    Retrieves the most recent blueprint preview from .agent_memory/blueprint_preview.json.
    """
    preview_file = os.path.abspath("./.agent_memory/blueprint_preview.json")
    if os.path.exists(preview_file):
        try:
            with open(preview_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {"status": "success", "blueprint": data}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Error reading blueprint preview: {str(exc)}")
    return {"status": "not_found", "blueprint": None}


@app.post("/api/blueprint/execute")
def execute_blueprint(req: BlueprintExecuteRequest) -> Dict[str, Any]:
    """
    Stage 15.2 Approved Blueprint Execution:
    Executes a pre-screened list of selected file tasks in the background,
    respecting lifecycle cancellation/pause events and updating swarm registry.
    """
    if not req.tasks:
        raise HTTPException(status_code=400, detail="A non-empty 'tasks' list is required.")

    with execution_lock:
        if execution_state["is_running"]:
            raise HTTPException(
                status_code=409,
                detail=f"A build job is actively running for project '{execution_state['project_name']}'."
            )

        target_dest = normalize_wsl_path(req.target_dir)
        project_name = req.project_name or os.path.basename(target_dest.rstrip("/")) or "default_project"

        try:
            token_governor.reset_build_counter(project_name)
        except Exception:
            pass

        swarm_conf = _get_or_init_swarm_profiles()
        active_swarm_id = swarm_conf.get("active_swarm_id", "GLOBAL_HYBRID_SWARM")
        active_orchestrator = req.orchestrator_model or swarm_conf.get("orchestrator_engine", LOCAL_ORCHESTRATOR_MODEL)
        active_worker_models = req.worker_models or swarm_conf.get("worker_models", ["gemini-2.5-flash", "qwen2.5-coder:7b"])
        active_max_models = req.max_models_used or swarm_conf.get("max_models_used", len(active_worker_models))
        active_strategy = req.routing_strategy or swarm_conf.get("routing_strategy", "ROUND_ROBIN")
        active_preferred_key = req.preferred_key_id or swarm_conf.get("preferred_key_id", "AUTO")
        active_max_workers = max(1, min(int(req.max_workers), 16))

        execution_state["is_running"] = True
        execution_state["is_paused"] = False
        execution_state["status"] = "RUNNING"
        execution_state["current_phase"] = "BLUEPRINT_EXECUTION"
        execution_state["project_name"] = project_name
        execution_state["target_path"] = target_dest
        execution_state["goal"] = req.goal
        execution_state["mode"] = req.execution_mode
        execution_state["profile"] = req.research_profile
        execution_state["constrain"] = req.model_profile
        execution_state["active_swarm_id"] = active_swarm_id
        execution_state["orchestrator_engine"] = active_orchestrator
        execution_state["worker_models"] = active_worker_models
        execution_state["max_models_used"] = active_max_models
        execution_state["routing_strategy"] = active_strategy
        execution_state["preferred_key_id"] = active_preferred_key
        execution_state["max_workers"] = active_max_workers
        execution_state["start_time"] = time.time()
        execution_state["end_time"] = None
        execution_state["error"] = None

    try:
        current_registry = _load_json(SWARM_REGISTRY_FILE, {})
        current_registry.update({
            "project_name": project_name,
            "project_root": target_dest,
            "active_workspace": target_dest,
            "active_swarm_id": active_swarm_id,
            "orchestrator_engine": active_orchestrator,
            "active_worker_models": active_worker_models[:active_max_models],
            "max_available_workers": active_max_workers,
            "status": "RUNNING"
        })
        _save_json(SWARM_REGISTRY_FILE, current_registry)
    except Exception:
        pass

    worker_thread = threading.Thread(
        target=_run_background_blueprint,
        args=(
            target_dest,
            project_name,
            req.goal,
            req.tasks,
            req.execution_mode,
            req.research_profile,
            req.model_profile,
            active_max_workers,
            active_orchestrator,
            active_worker_models,
            active_max_models,
            active_strategy,
            active_preferred_key
        ),
        daemon=True
    )
    worker_thread.start()

    return {
        "status": "started",
        "message": f"Approved blueprint execution initiated for project '{project_name}'.",
        "execution_state": {
            "project_name": project_name,
            "target_path": target_dest,
            "selected_tasks_count": len([t for t in req.tasks if t.get("selected", True)])
        }
    }