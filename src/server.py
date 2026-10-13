import os
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

from src.token_governor import TokenGovernor
from src.supervisor import ProjectSupervisor
from src.memory_manager import (
    get_last_env_location,
    get_knowledge_base_telemetry,
    defragment_and_consolidate_books,
    _load_json,
    ENV_HISTORY_FILE
)
from src.key_manager import key_manager
from src.config import (
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
    MAX_SWARM_WORKERS
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

governor = TokenGovernor()

# Global thread-safe execution state
execution_lock = threading.Lock()
execution_state: Dict[str, Any] = {
    "is_running": False,
    "status": "IDLE",
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


class AddKeyPayload(BaseModel):
    key: str
    tier: Optional[str] = "FREE"
    label: Optional[str] = ""
    is_selected: Optional[bool] = True


class TestKeyPayload(BaseModel):
    key: Optional[str] = None
    id: Optional[str] = None


class TierModePayload(BaseModel):
    mode: str


class SetPolicyPayload(BaseModel):
    policy: str
    pinned_key_id: Optional[str] = None


class ToggleSelectionPayload(BaseModel):
    key_id: str
    is_selected: bool


def get_detailed_key_telemetry() -> Dict[str, Any]:
    """
    Constructs comprehensive key_pool telemetry block from key_manager
    for live REST telemetry endpoints and WebSocket broadcasting.
    """
    status = key_manager.get_routing_status()
    masked_keys = key_manager.get_masked_keys()
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
        "keys_summary": masked_keys
    }


@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    """
    Returns service health status, local orchestrator model name,
    worker model name, current background execution state, and live key pool telemetry.
    """
    with execution_lock:
        state_copy = dict(execution_state)

    return {
        "status": "healthy",
        "service": "advance_assistant_web_bridge",
        "version": "6.0.0",
        "orchestrator_model": LOCAL_ORCHESTRATOR_MODEL,
        "worker_model": LOCAL_WORKER_MODEL,
        "execution_state": state_copy,
        "key_pool": get_detailed_key_telemetry()
    }


@app.get("/api/config")
def get_config() -> Dict[str, Any]:
    """
    Returns available execution modes, research profiles, model constraining
    profiles, tier pools, registered model limits, and system defaults.
    """
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
        "defaults": {
            "isolation_enabled": DEFAULT_ISOLATION_ENABLED,
            "max_swarm_workers": MAX_SWARM_WORKERS,
            "orchestrator_model": LOCAL_ORCHESTRATOR_MODEL,
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
    return {
        "history": env_data.get("history", []),
        "last_location": get_last_env_location(),
        "knowledge_telemetry": get_knowledge_base_telemetry()
    }


@app.get("/api/swarm/status")
def get_swarm_status() -> Dict[str, Any]:
    """
    Returns the live raw operational state from swarm_registry.json.
    """
    return _load_json(SWARM_REGISTRY_FILE, {
        "project_name": None,
        "project_root": None,
        "active_workspace": None,
        "max_available_workers": MAX_SWARM_WORKERS - 1,
        "domain_locks": {},
        "completed_files": [],
        "status": "IDLE"
    })


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
        "key_pool": get_detailed_key_telemetry()
    }


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
    return {
        "status": "success",
        "keys": key_manager.get_masked_keys(),
        "pool_status": key_manager.get_pool_status(),
        "routing_status": key_manager.get_routing_status()
    }


@app.post("/api/keys")
def add_api_key(payload: AddKeyPayload) -> Dict[str, Any]:
    """
    Adds a new Gemini API key to the key pool with designated tier, label, and selection state.
    """
    if not payload.key or not payload.key.strip():
        raise HTTPException(status_code=400, detail="API key string cannot be empty.")
    try:
        registered = key_manager.add_key(
            key_str=payload.key,
            tier=payload.tier or "FREE",
            label=payload.label or "",
            is_selected=payload.is_selected if payload.is_selected is not None else True
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
def test_api_key(payload: TestKeyPayload) -> Dict[str, Any]:
    """
    Tests live authentication against Google GenAI for a new or existing API key.
    """
    if payload.id:
        result = key_manager.test_key_by_id(payload.id)
    elif payload.key:
        result = key_manager.test_key(payload.key)
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


def _run_background_build(
    target_dest: str,
    project_name: str,
    goal: str,
    mode: str,
    profile: str,
    constrain: str,
    isolate: bool,
    max_workers: Optional[int]
):
    """Worker function executed inside a detached background thread."""
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
            constraining_profile=constrain
        )
        with execution_lock:
            execution_state["status"] = "COMPLETED"
    except Exception as exc:
        with execution_lock:
            execution_state["status"] = "FAILED"
            execution_state["error"] = str(exc)
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

        target_dest = payload.target_path if payload.target_path else get_last_env_location()
        project_name = payload.project_name or "default_project"
        active_mode = payload.mode or DEFAULT_EXECUTION_MODE
        active_profile = payload.profile or DEFAULT_RESEARCH_PROFILE
        active_constrain = payload.constrain or DEFAULT_MODEL_CONSTRAINING_PROFILE
        active_isolate = DEFAULT_ISOLATION_ENABLED if payload.isolate is None else payload.isolate
        active_max_workers = payload.max_workers

        execution_state["is_running"] = True
        execution_state["status"] = "RUNNING"
        execution_state["project_name"] = project_name
        execution_state["target_path"] = target_dest
        execution_state["goal"] = payload.goal
        execution_state["mode"] = active_mode
        execution_state["profile"] = active_profile
        execution_state["constrain"] = active_constrain
        execution_state["isolate"] = active_isolate
        execution_state["start_time"] = time.time()
        execution_state["end_time"] = None
        execution_state["error"] = None

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
            active_max_workers
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
            "isolate": active_isolate
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

            swarm_status = _load_json(SWARM_REGISTRY_FILE, {
                "project_name": None,
                "project_root": None,
                "active_workspace": None,
                "max_available_workers": MAX_SWARM_WORKERS - 1,
                "domain_locks": {},
                "completed_files": [],
                "status": "IDLE"
            })

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
                "timestamp": time.time()
            }

            await websocket.send_json(payload)
            await asyncio.sleep(1.0)
    except (WebSocketDisconnect, ConnectionResetError):
        pass
    except Exception:
        pass


if __name__ == "__main__":
    uvicorn.run("src.server:app", host="0.0.0.0", port=8000, reload=False)
