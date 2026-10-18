# ADVANCE ASSISTANT OS v6.0 — WEB CONSOLE FRONTEND (`frontend/`)

## 1. Technology Stack & Design Architecture

The `frontend/` directory houses the single-page web console for Advance Assistant OS v6.0.
- **Core Framework**: React 18 with TypeScript 5
- **Build Tool**: Vite 6 (Single-page app bundling, Hot Module Replacement)
- **Styling**: Tailwind CSS 3.4 with custom sleek dark theme and glassmorphic badges
- **Iconography**: Lucide React (`lucide-react`) with resilient SVG fallbacks in `src/components/icons_fallback.tsx`
- **Networking**: Twin WebSockets (`/ws/telemetry` at 1.0 Hz, `/ws/logs` event stream) and REST fetch clients with automatic JSON parsing and error handling

---

## 2. Directory Structure & Page Inventory

```
frontend/
├── index.html                   # HTML Entrypoint with dark theme styling
├── package.json                 # Node.js dependencies & scripts
├── tsconfig.json                # Strict TypeScript compiler configuration
├── vite.config.ts               # Vite proxy configuration (:5173 -> :8000)
└── src/
    ├── App.tsx                  # Root router connecting all 8 pages
    ├── main.tsx                 # React DOM mount entrypoint
    ├── index.css                # Global Tailwind CSS directives & scrollbar styling
    ├── components/
    │   ├── Layout.tsx           # Global top bar, build controls, status badges
    │   ├── Sidebar.tsx          # Collapsible navigation drawer
    │   └── icons_fallback.tsx   # Bulletproof SVG fallback icons
    └── pages/
        ├── ExecutionStudio.tsx  # View 1: Active Swarm Bar, Quick Launch, Blueprint, Workspace Inspector
        ├── SwarmMonitor.tsx     # View 2: Live thread concurrency, generated files, model quotas
        ├── AgentHub.tsx         # View 3: Benchmark champions, RTX 4060 VRAM simulator, Swarm builder
        ├── KnowledgeBase.tsx    # View 4: Book section explorer, Markdown editor, Injection simulator
        ├── TokenGovernor.tsx    # View 5: Global/Per-Key quotas, Live sync, 85% recalculate, Cost gauges
        ├── ApiKeyManager.tsx    # View 6: Key matrix, Per-key 85% quotas drawer, Model limits modal
        ├── LogCenter.tsx        # View 7: Full-screen 6-stream virtualized log console & JSON inspector
        └── ToolBridges.tsx      # View 8: External tool adapter readiness & Gatekeeper security
```

---

## 3. Progressive-Disclosure UI Design Patterns

To maintain a clean, uncluttered developer workspace despite dense multi-model configuration surfaces, the UI applies strict **progressive disclosure**:
1. **Collapsible Worker Roster Drawer** (`ExecutionStudio.tsx`): Summarized as `🤖 3/3 Active` in the top bar; expands inline on click to display multi-tier model selection chips with 85% RPM/TPM badges.
2. **Minimizable Agent Task Drawer** (`SwarmMonitor.tsx`): Slides out from the right to display active in-flight lease metrics, prompt tokens, and domain locks without obscuring generated code.
3. **Expandable Key Drawers** (`ApiKeyManager.tsx`): Each key row expands to reveal dedicated per-key 60s rolling rates, token breakdowns (In/Out/Thinking), safety margin % inputs, and inline model limit editors.
4. **Modal Customization Sheets** (`TokenGovernor.tsx`): Deep parameter editing (strict limits, working limits, thinking budget) opens inside isolated backdrop modals featuring an instant `⚡ Auto-Fill 85%` button.

---

## 4. Development & Production Build Commands

All commands are executed within WSL from the `frontend/` directory:

```bash
# Install NPM dependencies
npm install

# Run strict TypeScript typecheck (0 errors required)
./node_modules/.bin/tsc --noEmit

# Compile production bundle with Vite
node node_modules/vite/bin/vite.js build

# Start local Vite development server with hot-reload
npm run dev
```

### Vite Proxy Configuration (`vite.config.ts`)
The development server automatically proxies HTTP `/api` calls and `/ws` WebSocket connections to the FastAPI server running on port `8000`:
```typescript
server: {
  proxy: {
    '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    '/ws': { target: 'ws://127.0.0.1:8000', ws: true }
  }
}
```\n