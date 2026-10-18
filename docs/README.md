# ADVANCE ASSISTANT OS v6.0
## TECHNICAL DOCUMENTATION MASTER INDEX

---

## 📚 Core Architecture & Engineering Specifications

This directory contains the formal, publication-grade engineering documentation for Advance Assistant OS v6.0.

| Document | Title | Description | Key Focus Areas |
| :--- | :--- | :--- | :--- |
| **[`01_SYSTEM_ARCHITECTURE_AND_THEORY.md`](file:///home/assistantuser/advance_assistant/docs/01_SYSTEM_ARCHITECTURE_AND_THEORY.md)** | **System Architecture & Theory** | Comprehensive architectural philosophy, dual-mode OS foundation, and mathematical formulations. | Dual-mode CLI/Web, 85% Working Limit Calculus, Two-Phase Atomic Leases, Precision Memory Knapsack, RTX 4060 VRAM Arbitration, Real-Time Cloud Cost & Savings Model. |
| **[`02_PROCESS_FLOWS_AND_SEQUENCES.md`](file:///home/assistantuser/advance_assistant/docs/02_PROCESS_FLOWS_AND_SEQUENCES.md)** | **Process Flows & Sequences** | Detailed narratives, Mermaid sequence diagrams, and flowcharts for all 7 core operational workflows. | End-to-End Build (Phases 0–4), Pre-Flight Blueprint Approval Gate, Build Lifecycle State Machine, Lease Failover, Model Sync, Context Retrieval, WebSocket Telemetry. |
| **[`03_DFD_AND_ER_DIAGRAMS.md`](file:///home/assistantuser/advance_assistant/docs/03_DFD_AND_ER_DIAGRAMS.md)** | **DFD & ER Diagrams** | Formal Data Flow Diagrams (Levels 0, 1, 2) and complete Entity-Relationship Data Dictionary. | System Context, Subsystem Decomposition (P1–P8 to D1–D9), Deep-Dive Lease Token Flow, 9 Persistent Store Schemas & Constraints. |
| **[`04_API_AND_WEBSOCKET_SPEC.md`](file:///home/assistantuser/advance_assistant/docs/04_API_AND_WEBSOCKET_SPEC.md)** | **REST & WebSocket API Spec** | Complete developer reference documenting every endpoint exposed by `src/server.py`. | 35+ REST endpoints, Twin WebSocket channels (`/ws/telemetry` & `/ws/logs`), payload schemas, query parameters, status codes. |
| **[`05_WEB_CONSOLE_VISUAL_GUIDE.md`](file:///home/assistantuser/advance_assistant/docs/05_WEB_CONSOLE_VISUAL_GUIDE.md)** | **Web Console Visual Guide** | Visual ASCII wireframes, navigation maps, and operational playbooks for all 8 UI views. | Global Top Bar, Execution Studio (`/`), Swarm Monitor (`/swarm`), Agent Hub (`/agents`), Knowledge Base (`/knowledge`), Governor (`/governor`), Key Manager (`/keys`), Log Center (`/logs`), Tools (`/tools`). |

---

## 🗂️ Component Documentation Suites

In addition to the central `docs/` repository, each core folder maintains a dedicated, localized architectural reference:

- **[`src/README.md`](file:///home/assistantuser/advance_assistant/src/README.md)**: Module-by-module reference for all 15 Python engine modules, thread-safety lock hierarchy, and CLI zero-mutation contract.
- **[`frontend/README.md`](file:///home/assistantuser/advance_assistant/frontend/README.md)**: Guide to Vite, React 18, TypeScript, Tailwind styling, and 8-page console architecture.
- **[`.agent_memory/README.md`](file:///home/assistantuser/advance_assistant/.agent_memory/README.md)**: Persistent state JSON schemas, Markdown knowledge books, and credential safety protocols.
- **[`logs/README.md`](file:///home/assistantuser/advance_assistant/logs/README.md)**: 6-stream observability directory structure, structured log formats, and WebSocket log tailing.
- **[`test/README.md`](file:///home/assistantuser/advance_assistant/test/README.md)**: Automated certification harness, state guard isolation, and subsystem test suite execution.
