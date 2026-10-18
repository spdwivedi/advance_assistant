# ADVANCE ASSISTANT OS v6.0 — OBSERVABILITY & MULTI-STREAM LOGS (`logs/`)

## 1. Observability Architecture & 6-Stream Directory Layout

Advance Assistant OS v6.0 implements a unified 6-stream logging architecture that partitions log events by timeline, date, operational category, model, and project.

```
logs/
├── master_timeline.log          # Master append-only system timeline stream
├── latest_screenshot.png        # Multimodal vision capture of host screen
├── daily/                       # Date-partitioned historical logs
│   └── YYYY-MM-DD.log           # Daily log events
├── categories/                  # Category-specific streams
│   ├── supervisor/              # Orchestration, phase transitions, thread dispatch
│   ├── gatekeeper/              # Sandbox checks, file write success/failure
│   ├── governor/                # Lease acquisitions, 85% rate checks, commitments
│   ├── router/                  # Key rotations, cooldown triggers, failovers
│   ├── general/                 # High-level system alerts, financial shield caps
│   └── models/                  # Per-model execution output streams
│       ├── gemini-2.5-flash.log
│       ├── gemini-2.5-pro.log
│       ├── qwen2.5-coder_7b.log
│       └── ...
└── projects/                    # Project-isolated build trace directories
    └── <project_name>/
        ├── execution_trace.log  # Chronological build trace for this specific project
        └── blueprint_ledger.json# JSON task execution ledger
```

---

## 2. Structured Log Format

Every log entry follows a strict structured format:
```
YYYY-MM-DD HH:MM:SS.mmm [SEVERITY] [CATEGORY] Message text [METADATA_JSON]
```

### Example Log Lines
```
2026-10-18 17:20:00.142 [INFO]  [GOVERNOR]   Lease lease_9912 granted for gemini-2.5-flash (T_reserved=4,200) {"key_id": "key_e7c3", "pace_sec": 2.5}
2026-10-18 17:20:00.278 [INFO]  [SUPERVISOR] Worker 0 acquired domain lock on backend/main.py {"worker_id": "worker_0"}
2026-10-18 17:20:02.841 [INFO]  [GATEKEEPER] File write verified: backend/main.py (142 lines, 4,210 bytes) {"checksum": "a8f3b..."}
2026-10-18 17:20:02.915 [INFO]  [GOVERNOR]   Lease lease_9912 committed (actual_tokens=3,840, reconciled=360) {"key_id": "key_e7c3"}
2026-10-18 17:20:03.052 [WARN]  [ROUTER]     Key key_001 approaching 80% daily quota (340 / 425 RPD) {"status": "ACTIVE"}
```

---

## 3. Real-Time Streaming over WebSocket (`/ws/logs`)

The Log Center UI (`/logs`) streams logs directly from disk over `ws://localhost:8000/ws/logs`:
- **Initial Batch**: Sends the last 100 entries immediately on connection.
- **Event-Driven Tail**: Background file watcher tails log files using non-blocking I/O and broadcasts new lines to all connected subscribers.
- **Filtering**: Clients can append query parameters (e.g. `/ws/logs?source=governor&severity=ERROR`) to stream only relevant events.\n