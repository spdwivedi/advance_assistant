# ADVANCE ASSISTANT OS v6.0
## TECHNICAL SPECIFICATION 04: REST & WEBSOCKET API SPECIFICATION

---

## 1. Overview & Protocol Architecture

The Advance Assistant OS v6.0 server (`src/server.py`) provides an asynchronous high-throughput interface communicating via:
1. **RESTful HTTP Endpoints** (`http://localhost:8000/api/*`): Standard JSON RPC and REST operations for pipeline execution, configuration, quota governance, memory book manipulation, and key lifecycle management.
2. **Twin WebSocket Channels** (`ws://localhost:8000/ws/*`):
   - `/ws/telemetry`: Dedicated 1.0 Hz full-state snapshot stream broadcasting execution state, active swarm topologies, token ledger accumulators, and dollar cost valuations.
   - `/ws/logs`: Non-blocking, event-driven stream tailing multi-stream log files in real-time with sub-millisecond dispatching.

---

## 2. Section 1: Core System, Health & Configuration

### 2.1 `GET /api/health`
- **Method**: `GET`
- **Path**: `/api/health`
- **Description**: Returns top-level system health, active swarm profile ID, active orchestrator engine, and configured worker concurrency.
- **Query Parameters**: None.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "status": "healthy",
  "active_swarm": "GLOBAL_HYBRID_SWARM",
  "orchestrator": "gemini-2.5-pro",
  "workers": 6
}
```

### 2.2 `GET /api/config`
- **Method**: `GET`
- **Path**: `/api/config`
- **Description**: Returns system operational configuration, active execution modes, registered LLM models, and default timeout/retry invariants.
- **Query Parameters**: None.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "modes": ["ARCHITECT", "CODER", "DEBUGGER", "TESTER", "REVIEWER"],
  "models": ["gemini-2.5-flash", "gemini-2.5-pro", "qwen2.5-coder:7b", "..."],
  "workspace_root": "/home/assistantuser/advance_assistant",
  "pacing_delay_enabled": true
}
```

### 2.3 `GET /api/history`
- **Method**: `GET`
- **Path**: `/api/history`
- **Description**: Retrieves recent project execution history and last used workspace directory paths from `.agent_memory/env_history.json`.
- **Query Parameters**: None.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "last_workspace": "/home/assistantuser/advance_assistant/sandbox/project_alpha",
  "recent_projects": [
    {
      "name": "project_alpha",
      "path": "/home/assistantuser/advance_assistant/sandbox/project_alpha",
      "timestamp": "2026-10-18T16:42:00Z",
      "status": "COMPLETED"
    }
  ]
}
```

### 2.4 `GET /api/telemetry`
- **Method**: `GET`
- **Path**: `/api/telemetry`
- **Description**: Single-shot query of current governor telemetry, model consumption metrics, in-flight leases, and financial shield status.
- **Query Parameters**: None.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "timestamp": 1792330000.12,
  "execution_state": "IDLE",
  "active_leases": 0,
  "financial_shield": {
    "session_tokens_accumulated": 14200,
    "session_token_cap": 150000,
    "paid_tier_locked": false
  },
  "models": {
    "gemini-2.5-flash": {
      "requests_today": 12,
      "total_tokens_today": 48200,
      "rolling_rpm": 0,
      "rolling_tpm": 0
    }
  }
}
```

### 2.5 `GET /api/models/catalog`
- **Method**: `GET`
- **Path**: `/api/models/catalog`
- **Description**: Exposes the unified multi-tier catalog grouping models by `GOOGLE_FREE`, `GOOGLE_PAID`, `GROQ_FREE`, `GROQ_PAID`, and `OLLAMA_LOCAL`. Each model card includes its Strict (100%) Limits, Working (85%) Limits, Context Window, and live key availability flags.
- **Query Parameters**: None.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "total_models": 148,
  "groups": {
    "GOOGLE_FREE": [
      {
        "model": "gemini-2.5-flash",
        "provider": "GOOGLE",
        "tier": "FREE",
        "strict_limits": { "rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192 },
        "working_limits": { "rpm": 12, "tpm": 212500, "rpd": 425, "max_input_tokens": 27852, "max_output_tokens": 6963 },
        "context_window": 1048576,
        "key_available": true
      }
    ],
    "GOOGLE_PAID": [...],
    "GROQ_FREE": [...],
    "GROQ_PAID": [...],
    "OLLAMA_LOCAL": [...]
  }
}
```

---

## 3. Section 2: Execution Lifecycle, Pre-Flight Blueprints & Workspace Inspection

### 3.1 `POST /api/execute`
- **Method**: `POST`
- **Path**: `/api/execute`
- **Description**: Initiates an autonomous development build on a background worker thread.
- **Request Body** (`application/json`):
```json
{
  "prompt": "Create a high-performance REST API in FastAPI with PostgreSQL models and pytest suites",
  "workspace_path": "/home/assistantuser/advance_assistant/sandbox/fastapi_demo",
  "orchestrator_model": "gemini-2.5-pro",
  "worker_models": ["gemini-2.5-flash", "qwen2.5-coder:7b"],
  "max_models_used": 2,
  "routing_strategy": "ROUND_ROBIN",
  "preferred_key_id": "AUTO",
  "max_workers": 6
}
```
- **Response Codes**:
  - `200 OK`: Build successfully launched.
  - `400 Bad Request`: Invalid workspace path or empty prompt.
  - `409 Conflict`: A build is already actively running (`execution_state == 'RUNNING'`).
- **Response Schema**:
```json
{
  "status": "STARTED",
  "build_id": "build_847192",
  "workspace": "/home/assistantuser/advance_assistant/sandbox/fastapi_demo"
}
```

### 3.2 `POST /api/execute/pause` & `POST /api/execute/resume`
- **Method**: `POST`
- **Path**: `/api/execute/pause` (and `/api/execute/resume`)
- **Description**: Cooperatively halts or resumes in-flight worker execution using `build_pause_event`.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "status": "PAUSED",
  "execution_state": "PAUSED",
  "active_workers_paused": 4
}
```

### 3.3 `POST /api/execute/stop`
- **Method**: `POST`
- **Path**: `/api/execute/stop`
- **Description**: Signals cancellation to all active workers and the supervisor via `build_cancel_event`. Releases file locks cleanly.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "status": "CANCELLED",
  "execution_state": "CANCELLED"
}
```

### 3.4 `POST /api/blueprint/preview`
- **Method**: `POST`
- **Path**: `/api/blueprint/preview`
- **Description**: Scans workspace files and prompts the Orchestrator to generate an iterative decomposition plan (`CREATE` vs `MODIFY` tasks) with model roster assignments without writing any code.
- **Request Body**: Same parameters as `/api/execute`.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "blueprint_id": "bp_1792330100",
  "created_at": "2026-10-18T17:00:00Z",
  "workspace_path": "/home/assistantuser/advance_assistant/sandbox/demo",
  "total_tasks": 3,
  "tasks": [
    {
      "task_id": "task_1",
      "file_path": "backend/main.py",
      "action": "CREATE",
      "description": "FastAPI application entrypoint with health and API routers",
      "assigned_model": "gemini-2.5-flash",
      "is_approved": true
    },
    {
      "task_id": "task_2",
      "file_path": "backend/models.py",
      "action": "MODIFY",
      "description": "Add User and Organization SQLModel classes",
      "assigned_model": "qwen2.5-coder:7b",
      "existing_content_snippet": "from sqlmodel import SQLModel...",
      "is_approved": true
    }
  ]
}
```

### 3.5 `GET /api/blueprint/preview`
- **Method**: `GET`
- **Path**: `/api/blueprint/preview`
- **Description**: Retrieves the currently cached pre-flight blueprint from `.agent_memory/blueprint_preview.json`.
- **Response Codes**: `200 OK`

### 3.6 `POST /api/blueprint/execute`
- **Method**: `POST`
- **Path**: `/api/blueprint/execute`
- **Description**: Executes developer-approved tasks from the blueprint preview.
- **Request Body**:
```json
{
  "blueprint_id": "bp_1792330100",
  "approved_tasks": [
    {
      "task_id": "task_1",
      "file_path": "backend/main.py",
      "action": "CREATE",
      "description": "FastAPI application entrypoint with health and API routers",
      "assigned_model": "gemini-2.5-flash",
      "is_approved": true
    }
  ],
  "workspace_path": "/home/assistantuser/advance_assistant/sandbox/demo"
}
```
- **Response Codes**: `200 OK`

### 3.7 `GET /api/workspace/scan`
- **Method**: `GET`
- **Path**: `/api/workspace/scan?path=/absolute/path/to/workspace`
- **Description**: Recursively scans the workspace directory tree, ignoring `.git/`, `node_modules/`, and `.venv/`. Returns file counts and filetype breakdowns.
- **Response Codes**:
  - `200 OK`: Directory tree metadata.
  - `400 Bad Request`: Invalid or non-existent path.
- **Response Schema**:
```json
{
  "workspace": "fastapi_demo",
  "total_files": 42,
  "filetypes": { ".py": 28, ".json": 4, ".md": 2, ".env": 1 },
  "tree": [
    { "name": "backend", "type": "directory", "children": [...] }
  ]
}
```

### 3.8 `GET /api/workspace/file`
- **Method**: `GET`
- **Path**: `/api/workspace/file?workspace=/path&file=relative/file.py`
- **Description**: Safely reads file contents for the Tab 3 Workspace Code Inspector.
- **Security Guards**:
  - **HTTP 400 Bad Request**: Rejects path traversal (`..` or root escaping).
  - **HTTP 403 Forbidden**: Blocks reading sensitive files (`.env`, `*credentials*.json`, `*secret*`, `api_keys.json`).
- **Response Codes**: `200 OK`, `400 Bad Request`, `403 Forbidden`, `404 Not Found`.

---

## 4. Section 3: Hierarchical Token Governor, Live Model Sync & Cost Analytics

### 4.1 `GET /api/governor/hierarchy`
- **Method**: `GET`
- **Path**: `/api/governor/hierarchy`
- **Description**: Retrieves provider quotas, tier definitions, strict limits, 85% working limits, in-flight leases, and active key scopes.
- **Response Codes**: `200 OK`

### 4.2 `POST /api/governor/limits`
- **Method**: `POST`
- **Path**: `/api/governor/limits`
- **Description**: Dynamically updates global working limits for a target model.
- **Request Body**:
```json
{
  "provider": "GOOGLE",
  "tier": "FREE",
  "model": "gemini-2.5-flash",
  "working_limits": {
    "rpm": 12,
    "tpm": 200000,
    "rpd": 400,
    "max_input_tokens": 27000,
    "max_output_tokens": 7000,
    "thinking_budget": 0
  }
}
```
- **Response Codes**: `200 OK`

### 4.3 `POST /api/governor/sync-models`
- **Method**: `POST`
- **Path**: `/api/governor/sync-models`
- **Description**: Discovers live models from Google AI Studio, Groq Cloud, Local Ollama, and `Ollama_Models_Testing`, automatically calculates 85% working limits, and updates `provider_quotas.json`.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "status": "SYNCED",
  "google_free_count": 19,
  "google_paid_count": 49,
  "groq_count": 4,
  "ollama_count": 76,
  "margin_applied_pct": 85.0,
  "synced_at": "2026-10-18T17:15:00Z"
}
```

### 4.4 `POST /api/governor/recalculate-85`
- **Method**: `POST`
- **Path**: `/api/governor/recalculate-85`
- **Description**: Recalculates all registered models' working limits as exact 85% of their strict API limits using configurable margin percentage.
- **Request Body**:
```json
{ "safety_margin_percent": 85.0 }
```
- **Response Codes**: `200 OK`

### 4.5 `GET /api/governor/cost-estimate`
- **Method**: `GET`
- **Path**: `/api/governor/cost-estimate`
- **Description**: Returns exact session and daily cost valuations in USD and INR ($1 = 84 INR) for actual paid spend vs cloud value saved via the Free pool and Local Ollama.
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "currency_rates": { "USD_TO_INR": 84.0 },
  "actual_paid_spend": { "usd": 0.042, "inr": 3.528 },
  "cloud_value_saved": { "usd": 1.250, "inr": 105.000 },
  "tokens_breakdown": {
    "paid_tokens": 42000,
    "free_tokens": 850000,
    "local_tokens": 120000
  }
}
```

---

## 5. Section 4: Multi-Provider API Key Matrix & Dedicated Per-Key 85% Quotas

### 5.1 `GET /api/keys`
- **Method**: `GET`
- **Path**: `/api/keys`
- **Description**: Returns all registered API keys in the matrix. Secret keys are securely masked (`AIzaSy...4xQ1` or `gsk_x8...9K`).
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "routing_policy": "FREE_POOL",
  "pinned_key_id": null,
  "total_keys": 4,
  "keys": [
    {
      "id": "key_e7c36116",
      "key": "AIzaSy...4xQ1",
      "provider": "GOOGLE",
      "tier": "FREE",
      "label": "Google Free Key 1",
      "status": "ACTIVE",
      "safety_margin_percent": 85,
      "cooldown_remaining_sec": 0,
      "requests_today": 14
    }
  ]
}
```

### 5.2 `POST /api/keys`
- **Method**: `POST`
- **Path**: `/api/keys`
- **Description**: Registers a new API key. Automatically infers provider (`GOOGLE` for `AIza...`, `GROQ` for `gsk_...`).
- **Request Body**:
```json
{
  "key": "AIzaSyYourNewActualKey...",
  "provider": "GOOGLE",
  "tier": "FREE",
  "label": "New Secondary Free Key"
}
```
- **Response Codes**: `200 OK`

### 5.3 `DELETE /api/keys/{key_id}`
- **Method**: `DELETE`
- **Path**: `/api/keys/{key_id}`
- **Description**: Deletes an API key from `.agent_memory/api_keys.json`.
- **Response Codes**: `200 OK`

### 5.4 `POST /api/keys/test`
- **Method**: `POST`
- **Path**: `/api/keys/test`
- **Description**: Executes a live verification ping against the provider upstream API to validate key legitimacy and status.
- **Request Body**:
```json
{ "key_id": "key_e7c36116" }
```
- **Response Codes**:
  - `200 OK`: `{ "valid": true, "latency_ms": 142, "provider": "GOOGLE" }`
  - `400 Bad Request`: `{ "valid": false, "error": "API_KEY_INVALID" }`

### 5.5 `GET /api/keys/quotas`
- **Method**: `GET`
- **Path**: `/api/keys/quotas`
- **Description**: Exposes dedicated per-key metrics: 60s rolling RPM/TPM, daily RPD, discrete Input/Output/Thinking token breakdown, and per-key custom 85% overrides.
- **Response Codes**: `200 OK`

### 5.6 `POST /api/keys/{key_id}/limits`
- **Method**: `POST`
- **Path**: `/api/keys/{key_id}/limits`
- **Description**: Updates dedicated per-key safety margin percent or saves dedicated model working limits for that specific key.
- **Request Body**:
```json
{
  "safety_margin_percent": 85.0,
  "model_name": "gemini-2.5-flash",
  "working_limits": {
    "rpm": 12,
    "tpm": 200000,
    "rpd": 400,
    "max_input_tokens": 27000,
    "max_output_tokens": 7000,
    "thinking_budget": 0
  }
}
```
- **Response Codes**: `200 OK`

---

## 6. Section 5: Testing Bridge, RTX 4060 VRAM Arbitrator & Swarm Profiles

### 6.1 `GET /api/bridge/status`
- **Method**: `GET`
- **Path**: `/api/bridge/status`
- **Description**: Returns connectivity state to the `Ollama_Models_Testing` repository and local Ollama daemon.
- **Response Codes**: `200 OK`

### 6.2 `GET /api/bridge/vram`
- **Method**: `GET`
- **Path**: `/api/bridge/vram`
- **Description**: Queries NVIDIA RTX 4060 VRAM allocation: Total Budget (8.0 GB), In-Use VRAM, Free Headroom, Active Residency Safety Tier (`SAFE_GPU`, `HIGH_LOAD`, `PAGED_HYBRID`, `OOM_HAZARDOUS`).
- **Response Codes**: `200 OK`

### 6.3 `POST /api/bridge/vram/scavenge`
- **Method**: `POST`
- **Path**: `/api/bridge/vram/scavenge`
- **Description**: Sends `keep_alive: 0` to Ollama unload endpoints, immediately releasing all GPU memory back to host Windows/WSL2.
- **Response Codes**: `200 OK`

### 6.4 `GET /api/swarms/profiles`
- **Method**: `GET`
- **Path**: `/api/swarms/profiles`
- **Description**: Returns all configured swarm topologies (`GLOBAL_HYBRID_SWARM`, `FULLSTACK_CLOUD_SWARM`, `AIR_GAPPED_LOCAL_SWARM`, and custom profiles), including their explicit `worker_models`, `max_models_used`, `routing_strategy`, and `orchestrator_engine`.
- **Response Codes**: `200 OK`

### 6.5 `POST /api/swarms/profiles`
- **Method**: `POST`
- **Path**: `/api/swarms/profiles`
- **Description**: Updates active swarm profile or persists a customized multi-model worker roster.
- **Request Body**:
```json
{
  "active_swarm_id": "GLOBAL_HYBRID_SWARM",
  "orchestrator_engine": "gemini-2.5-pro",
  "worker_models": ["gemini-2.5-flash", "qwen2.5-coder:7b", "llama-3.3-70b-versatile"],
  "max_models_used": 3,
  "max_concurrency_workers": 6,
  "routing_strategy": "ROUND_ROBIN",
  "preferred_key_id": "AUTO"
}
```
- **Response Codes**: `200 OK`

---

## 7. Section 6: Precision Memory Snippet Engine & Knowledge Book CRUD

### 7.1 `GET /api/memory/books`
- **Method**: `GET`
- **Path**: `/api/memory/books`
- **Description**: Returns all indexed Markdown books across the 9 canonical categories, total discrete sections, and total estimated tokens.
- **Response Codes**: `200 OK`

### 7.2 `GET /api/memory/book/{category}/{book_name}`
- **Method**: `GET`
- **Path**: `/api/memory/book/{category}/{book_name}`
- **Description**: Reads a specific Markdown book, returning both raw Markdown and structured parsed sections with executable code block detection.
- **Response Codes**: `200 OK`, `404 Not Found`.

### 7.3 `POST /api/memory/book`
- **Method**: `POST`
- **Path**: `/api/memory/book`
- **Description**: Creates a new Markdown knowledge book or overwrites existing content with atomic re-indexing.
- **Request Body**:
```json
{
  "category": "coding",
  "book_name": "react_patterns.md",
  "content": "# React Patterns\n\n## State Management\nUse Zustand for global reactive state..."
}
```
- **Response Codes**: `200 OK`

### 7.4 `POST /api/memory/book/recipe`
- **Method**: `POST`
- **Path**: `/api/memory/book/recipe`
- **Description**: Appends a new operational recipe block (`## Heading` + narrative + code snippet) to an existing book.
- **Response Codes**: `200 OK`

### 7.5 `POST /api/memory/simulate-injection`
- **Method**: `POST`
- **Path**: `/api/memory/simulate-injection`
- **Description**: Simulates the knapsack memory injection algorithm against a test prompt query, returning matched snippets, relevance scores, and token savings ratios.
- **Request Body**:
```json
{
  "query": "Implement atomic file writing with threading lock",
  "model_tier": "7B"
}
```
- **Response Codes**: `200 OK`
- **Response Schema**:
```json
{
  "target_budget": 1200,
  "injected_tokens": 1198,
  "injected_snippets": 12,
  "saved_tokens": 6381,
  "savings_percent": 84.2,
  "snippets": [
    { "heading": "Atomic File Operations", "score": 9.5, "tokens": 112 }
  ]
}
```

---

## 8. Section 7: 6-Stream Log Center & Dual WebSocket Streams

### 8.1 `GET /api/logs/sources`
- **Method**: `GET`
- **Path**: `/api/logs/sources`
- **Description**: Discovers all active log sources on disk: 14 category streams and 34 model logs.
- **Response Codes**: `200 OK`

### 8.2 `GET /api/logs/query`
- **Method**: `GET`
- **Path**: `/api/logs/query?source=master&severity=INFO&limit=50&offset=0`
- **Description**: Queries log entries with pagination and severity filtering (`INFO`, `WARN`, `ERROR`, `DEBUG`).
- **Security Guard**: Blocks directory traversal attempts with HTTP 400.
- **Response Codes**: `200 OK`, `400 Bad Request`.

### 8.3 `GET /api/logs/project/{project_name}/ledger`
- **Method**: `GET`
- **Path**: `/api/logs/project/{project_name}/ledger`
- **Description**: Returns the JSON blueprint execution ledger for a past project build.
- **Response Codes**: `200 OK`, `404 Not Found`.

---

### 8.4 Dual WebSocket Stream Specifications

#### WebSocket 1: `/ws/telemetry` (Full System State Snapshot)
- **URL**: `ws://localhost:8000/ws/telemetry`
- **Frequency**: Emitted every 1.0 second.
- **Payload Schema**:
```json
{
  "timestamp": 1792330500.45,
  "execution_state": "RUNNING",
  "swarm_registry": {
    "build_id": "build_847192",
    "active_orchestrator": "gemini-2.5-pro",
    "active_worker_models": ["gemini-2.5-flash", "qwen2.5-coder:7b"],
    "worker_assignments": {
      "backend/main.py": { "worker_id": "worker_0", "model": "gemini-2.5-flash", "phase": "PHASE_2_SWARM" }
    },
    "completed_files": ["package.json"]
  },
  "quotas": {
    "GOOGLE:FREE:gemini-2.5-flash": { "rolling_rpm": 2, "working_rpm": 12, "rolling_tpm": 32000, "working_tpm": 212500 }
  },
  "key_pool": {
    "routing_policy": "FREE_POOL",
    "total_keys": 4,
    "active_keys": 4
  },
  "cost_estimate": {
    "actual_paid_spend": { "usd": 0.00, "inr": 0.00 },
    "cloud_value_saved": { "usd": 0.42, "inr": 35.28 }
  }
}
```

#### WebSocket 2: `/ws/logs` (Real-Time Event Stream)
- **URL**: `ws://localhost:8000/ws/logs?source=master`
- **Frame Types**:
1. `initial_batch`: Sent immediately upon connection containing the last 100 entries.
```json
{
  "type": "initial_batch",
  "source": "master",
  "total_entries": 100,
  "entries": [
    { "timestamp": "2026-10-18T17:20:00Z", "level": "INFO", "category": "GOVERNOR", "message": "Lease granted lease_9912" }
  ]
}
```
2. `new_entries`: Emitted whenever new lines are written to the target log file.
```json
{
  "type": "new_entries",
  "entries": [
    { "timestamp": "2026-10-18T17:20:01Z", "level": "INFO", "category": "SUPERVISOR", "message": "Worker 1 acquired lock on backend/main.py" }
  ]
}
```
3. `heartbeat`: Emitted every 15 seconds of inactivity to keep TCP sockets alive through proxies.
```json
{ "type": "heartbeat", "timestamp": 1792330515.00 }
```
