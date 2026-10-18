# ADVANCE ASSISTANT OS v6.0 — PERSISTENT MEMORY & KNOWLEDGE BASE (`.agent_memory/`)

## 1. Directory Overview & Role in the System

`.agent_memory/` is the authoritative persistent state directory for Advance Assistant OS v6.0. It stores all quota configurations, API key matrices, token ledgers, multi-model swarm topologies, specialist role instructions, and domain knowledge books.

---

## 2. Inventory of Persistent State Files

| File Name | Format | Git Status | Operational Purpose |
| :--- | :--- | :---: | :--- |
| **`provider_quotas.json`** | JSON | Tracked | Master hierarchical quota database. Defines Strict (100%) Limits and Working (85%) Limits across Google (Free & Paid), Groq (Free & Paid), and Local Ollama models. Holds Financial Shield session token caps. |
| **`api_keys.json`** | JSON | **IGNORED** | Contains user secret API keys (`AIza...`, `gsk_...`), cooldown timestamps, error counts, and per-key 85% model limit overrides. **Strictly excluded from Git**. |
| **`api_keys.example.json`** | JSON | Tracked | Reference template illustrating the multi-provider schema without exposing real credentials. |
| **`token_ledger.json`** | JSON | Tracked | Stores the 60-second sliding bucket timestamps ($t_i$) and daily accumulated consumption aggregates per model. |
| **`swarm_profiles.json`** | JSON | Tracked | Configures multi-model swarm topologies (`GLOBAL_HYBRID_SWARM`, `FULLSTACK_CLOUD_SWARM`, `AIR_GAPPED_LOCAL_SWARM`), active orchestrator engine, worker rosters, concurrency limits, and routing strategies. |
| **`sub_agents.json`** | JSON | Tracked | Specialist persona definitions (`architect`, `coder`, `debugger`, `tester`, `reviewer`) with custom system prompts and default models. |
| **`swarm_registry.json`** | JSON | Tracked | Real-time state file tracking active build ID, in-flight worker file assignments, and acquired domain locks. |
| **`blueprint_preview.json`** | JSON | Tracked | Cached pre-flight blueprint tasks awaiting developer approval. |
| **`catalog_index.json`** | JSON | Tracked | Inverted index mapping keywords and stems to section hashes across all knowledge books. |
| **`env_history.json`** | JSON | Tracked | Records recent target workspace paths and build timestamps. |
| **`execution_profiles.json`**| JSON | Tracked | Historical model performance benchmarks and execution timing logs. |
| **`ARCHITECTURE.md`** | Markdown | Tracked | Core architectural rules and patterns referenced by the Memory Manager. |
| **`LEARNINGS.md`** | Markdown | Tracked | Accumulated lessons learned from previous debugging and build rounds. |
| **`TASKS.md`** | Markdown | Tracked | High-level backlog and task decomposition notes. |

---

## 3. The 9 Canonical Knowledge Book Categories (`books/`)

Knowledge books are organized under `.agent_memory/books/<category>/<book_name>.md`:
1. **`coding/`**: Language-specific best practices (FastAPI, React, TypeScript, Python, AsyncIO).
2. **`architecture/`**: System design guidelines, clean architecture, repository patterns, microservices.
3. **`ai_ml/`**: Model prompt engineering, LLM temperature calibration, local quantization.
4. **`databases/`**: SQLModel, PostgreSQL migrations, Redis caching, indexing strategies.
5. **`devops/`**: Docker multi-stage builds, CI/CD pipeline configs, Nginx reverse proxying.
6. **`security/`**: OWASP top 10 prevention, JWT authentication, secret management, input sanitization.
7. **`cloud/`**: Google Cloud Run, AWS S3, Cloudflare CDN integration recipes.
8. **`design_patterns/`**: Factory, Strategy, Observer, and Dependency Injection patterns.
9. **`cs_fundamentals/`**: Algorithmic complexity, concurrency primitives, data structures.

Each book is structured with `## ` and `### ` headings allowing `src/memory_manager.py` to extract atomic, token-efficient recipes.

---

## 4. Credential Safety & Automated Test Isolation

### Credential Protection
- `api_keys.json` is explicitly blocked by `.gitignore`.
- Raw API keys are never written to log files or returned unmasked in API responses.
- When committing changes, run `git status` to ensure `api_keys.json` remains untracked.

### Zero Test Pollution Guarantee (`test_state_guard.py`)
All automated tests must run inside the `preserve_agent_memory()` context manager:
```python
from test.test_scripts.test_state_guard import preserve_agent_memory

with preserve_agent_memory():
    # Test mutations here are completely discarded upon exit
    key_manager.add_key(...)
```
This takes an in-memory snapshot of all JSON state files before the test runs and restores the exact original byte stream upon completion.\n