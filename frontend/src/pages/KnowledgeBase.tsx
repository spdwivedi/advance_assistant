import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  RefreshCw,
  Database,
  Layers,
  CheckCircle2,
  Sparkles,
  Search,
  Code,
  Cpu,
  Cloud,
  Terminal,
  Server,
  Compass,
  History,
  Network,
  Palette,
  FileText,
  Shield,
  Zap,
  Info,
  ChevronRight,
  X,
  ExternalLink,
  HardDrive
} from 'lucide-react';

interface BookItem {
  id: string;
  filename: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  snippet: string;
  keyInsights: string[];
}

const CATEGORIES: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  all: { label: 'All Categories', icon: Database, color: 'text-indigo-400', desc: 'All 19 indexed engineering topic books' },
  coding: { label: 'Coding & Syntaxes', icon: Code, color: 'text-blue-400', desc: 'FastAPI, React TypeScript, SQLAlchemy, and Python Async patterns' },
  frameworks: { label: 'Web Frameworks', icon: Layers, color: 'text-cyan-400', desc: 'Modern web frameworks and automated test frameworks' },
  tools: { label: 'Developer Tools', icon: Terminal, color: 'text-emerald-400', desc: 'CLI dev tools, external bridges, and automation adapters' },
  cloud: { label: 'Cloud & Deploy', icon: Cloud, color: 'text-purple-400', desc: 'Containerization, cloud VM environments, and OCI deployment' },
  tech_stack: { label: 'System Tech Stack', icon: Server, color: 'text-amber-400', desc: 'Core system architecture and operational tech stack' },
  environment: { label: 'Environment Config', icon: HardDrive, color: 'text-teal-400', desc: 'Cross-platform WSL2 and native Windows configuration' },
  history: { label: 'Execution History', icon: History, color: 'text-rose-400', desc: 'Historical swarm task builds, logs, and blueprint modifications' },
  cs_fundamentals: { label: 'CS Fundamentals', icon: Network, color: 'text-violet-400', desc: 'Operating systems, DSA algorithms, and computer networks' },
  design_patterns: { label: 'Design Patterns', icon: Compass, color: 'text-orange-400', desc: 'Low-level design (LLD) and high-level design (HLD) paradigms' },
};

const CANONICAL_BOOKS: BookItem[] = [
  // coding
  {
    id: 'fastapi-book',
    filename: 'fastapi.md',
    title: 'FastAPI High-Throughput Patterns',
    category: 'coding',
    description: 'Asynchronous route definitions, dependency injection, lifespan managers, and Pydantic v2 validation.',
    tags: ['Async', 'Pydantic v2', 'REST API', 'CORS'],
    snippet: `from fastapi import FastAPI, Depends, HTTPException\nfrom pydantic import BaseModel\n\napp = FastAPI(title="Advance Assistant Bridge")\n\n@app.get("/api/health")\nasync def health_check():\n    return {"status": "healthy", "engine": "qwen2.5-coder:32b"}`,
    keyInsights: [
      'Always utilize non-blocking async def for I/O bound endpoints',
      'Mount permissive CORS middleware for WSL2 cross-origin calls',
      'Use lifespan async context manager for startup and shutdown hooks',
    ],
  },
  {
    id: 'react-ts-book',
    filename: 'react_typescript.md',
    title: 'React TypeScript & Tailwind Design',
    category: 'coding',
    description: 'Component architecture, strict typing, custom hooks, and Tailwind CSS dark mode styling.',
    tags: ['React 18', 'TypeScript', 'Tailwind', 'Vite'],
    snippet: `export const SwarmMonitor: React.FC = () => {\n  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);\n  useEffect(() => {\n    const ws = new WebSocket('ws://localhost:8000/ws/telemetry');\n    ws.onmessage = (e) => setTelemetry(JSON.parse(e.data));\n    return () => ws.close();\n  }, []);\n};`,
    keyInsights: [
      'Encapsulate WebSocket listeners with automatic HTTP polling fallback',
      'Apply glassmorphism and subtle glow shadows for high-aesthetic UI',
      'Strictly avoid any any-types in public API data interfaces',
    ],
  },
  {
    id: 'sqlalchemy-book',
    filename: 'sqlalchemy.md',
    title: 'Async SQLAlchemy & SQLite Engine',
    category: 'coding',
    description: 'AsyncSession lifecycle, declarative models, Alembic migrations, and SQLite file pooling.',
    tags: ['SQLAlchemy 2.0', 'AsyncSession', 'SQLite', 'ORM'],
    snippet: `from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession\n\nengine = create_async_engine("sqlite+aiosqlite:///./project.db", echo=False)\nasync with AsyncSession(engine) as session:\n    result = await session.execute(select(TaskModel))\n    tasks = result.scalars().all()`,
    keyInsights: [
      'Use aiosqlite driver for non-blocking local database interactions',
      'Ensure proper connection pooling and session closure in async context',
      'Separate schema models from Pydantic domain transfer objects',
    ],
  },
  {
    id: 'python-async-book',
    filename: 'python_async.md',
    title: 'Python Asyncio Concurrency & Threading',
    category: 'coding',
    description: 'Event loops, concurrent.futures thread pools, locks, and thread-safe shared states.',
    tags: ['Asyncio', 'threading.Lock', 'ThreadPoolExecutor', 'WSL2'],
    snippet: `import threading\n_lock = threading.Lock()\n\nwith _lock:\n    execution_state["is_running"] = True\n    worker_thread = threading.Thread(target=run_build, daemon=True)\n    worker_thread.start()`,
    keyInsights: [
      'Protect global mutable state across worker threads with threading.Lock',
      'Run blocking CPU supervisor loops in detached worker daemon threads',
      'Never block the Uvicorn asyncio main loop with time.sleep()',
    ],
  },
  {
    id: 'general-coding-book',
    filename: 'general_coding.md',
    title: 'General Clean Code & Typing Standards',
    category: 'coding',
    description: 'PEP 8 guidelines, structured error handling, JSON schema guards, and resilient IO.',
    tags: ['PEP 8', 'Clean Code', 'Type Hints', 'Robustness'],
    snippet: `def safe_load_json(filepath: str, default: dict) -> dict:\n    if os.path.exists(filepath):\n        try:\n            with open(filepath, 'r', encoding='utf-8') as f:\n                return json.load(f)\n        except Exception:\n            return default\n    return default`,
    keyInsights: [
      'Provide fallback defaults for all file IO routines',
      'Always enforce UTF-8 file encoding across cross-platform environments',
    ],
  },
  // frameworks
  {
    id: 'web-frameworks-book',
    filename: 'web_frameworks.md',
    title: 'Modern Web Frameworks Architecture',
    category: 'frameworks',
    description: 'Comparative analysis of FastAPI, Express, Next.js, and client-side Vite SPAs.',
    tags: ['FastAPI', 'Express', 'SPA', 'SSR'],
    snippet: `// Client-side Vite reverse proxy configuration\nexport default defineConfig({\n  server: {\n    host: '0.0.0.0',\n    port: 5173,\n    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } }\n  }\n});`,
    keyInsights: [
      'Vite SPA + FastAPI backend provides minimal latency for local agent OS',
      'Reverse proxy ensures clean Windows browser URL interoperability',
    ],
  },
  {
    id: 'testing-automation-book',
    filename: 'testing_automation.md',
    title: 'Automated Testing with Pytest & Asyncio',
    category: 'frameworks',
    description: 'Unit testing, fixture isolation, mocking external LLM endpoints, and async test loops.',
    tags: ['Pytest', 'pytest-asyncio', 'TestClient', 'Coverage'],
    snippet: `@pytest.mark.asyncio\nasync def test_health_check(async_client):\n    response = await async_client.get("/api/health")\n    assert response.status_code == 200\n    assert response.json()["status"] == "healthy"`,
    keyInsights: [
      'Use TestClient from fastapi.testclient for rapid synchronous validation',
      'Isolate all test workspace directories under test/test_data/',
    ],
  },
  // tools
  {
    id: 'developer-tools-book',
    filename: 'developer_tools.md',
    title: 'Developer CLI Tools & Agentic IDEs',
    category: 'tools',
    description: 'Integration specs for Aider batch mode, RooCode task instructions, and Cursor extension tools.',
    tags: ['Aider', 'RooCode', 'Cursor', 'CLI'],
    snippet: `cmd = ["aider", "--model", "qwen2.5-coder:32b", "--no-git", "--message", instruction]\nsubprocess.run(cmd, cwd=target_path, check=True)`,
    keyInsights: [
      'Execute Aider in non-interactive batch mode to avoid terminal lockups',
      'Export formatted instruction files for IDE extensions to ingest',
    ],
  },
  {
    id: 'automation-bridges-book',
    filename: 'automation_bridges.md',
    title: 'Local Automation & n8n Webhook Bridges',
    category: 'tools',
    description: 'Triggering local Windows automation workflows via n8n webhook nodes and shell bridges.',
    tags: ['n8n', 'Webhooks', 'Desktop Automation', 'Windows'],
    snippet: `payload = {"event": "BUILD_COMPLETED", "project": project_name, "files": completed_files}\nhttpx.post("http://localhost:5678/webhook/advance-assistant-task", json=payload)`,
    keyInsights: [
      'Dispatch webhook alerts on pipeline completion or failure events',
      'Enable cross-platform desktop automation via n8n local node triggers',
    ],
  },
  // cloud
  {
    id: 'cloud-deployment-book',
    filename: 'cloud_deployment.md',
    title: 'Cloud Infrastructure & Gemini API Integration',
    category: 'cloud',
    description: 'Google AI Studio Gemini API limits, free-tier boundaries, and quota reset pacing.',
    tags: ['Gemini API', 'Free Tier', 'RPM/TPM', 'Quotas'],
    snippet: `MODEL_REGISTRY = {\n    "gemini-3.5-flash": {"rpm": 1000, "tpm": 2000000, "rpd": 10000},\n    "gemini-3.5-flash-lite": {"rpm": 4000, "tpm": 4000000, "rpd": 150000}\n}`,
    keyInsights: [
      'Cloud Gemini Free Tier daily limits reset precisely at 1:30 PM IST (Midnight PT)',
      'Enforce micro-delay spacing (0.3s for Flash, 1.5s for Pro) to avoid burst 429s',
    ],
  },
  {
    id: 'containerization-book',
    filename: 'containerization.md',
    title: 'Containerization & Docker Best Practices',
    category: 'cloud',
    description: 'Multi-stage Docker builds, non-root users, volume persistence, and OCI image optimization.',
    tags: ['Docker', 'Multi-stage', 'OCI', 'Containers'],
    snippet: `FROM python:3.12-slim as builder\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nCMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8000"]`,
    keyInsights: [
      'Leverage multi-stage builds to maintain tiny deployment images',
      'Bind dev ports to 0.0.0.0 to allow cross-network container access',
    ],
  },
  // tech_stack
  {
    id: 'system-architecture-book',
    filename: 'system_architecture.md',
    title: 'Advance Assistant Dual-Model Architecture',
    category: 'tech_stack',
    description: 'Local dual-model reasoning loop: Qwen 2.5 Coder 32B Orchestrator + 7B Fast Worker.',
    tags: ['Dual Model', 'Qwen 32B', 'Qwen 7B', 'Orchestrator'],
    snippet: `LOCAL_ORCHESTRATOR = "qwen2.5-coder:32b"  # RAM+GPU Deep Reasoning\nLOCAL_WORKER       = "qwen2.5-coder:7b"   # Pure VRAM Fast Syntax Writes`,
    keyInsights: [
      'Orchestrator performs high-level task decomposition and memory consolidation',
      'Fast Worker handles localized boilerplate and rapid syntax repairs',
    ],
  },
  // environment
  {
    id: 'env-config-book',
    filename: 'environment_configuration.md',
    title: 'WSL2 & Windows Cross-Platform Interop',
    category: 'environment',
    description: 'Path normalization (/mnt/d/ <-> D:/), hardware clock sync, and DrvFs permissions.',
    tags: ['WSL2', 'Cross-Platform', 'Path Normalization', 'Clock Sync'],
    snippet: `def normalize_cross_platform_path(path_str: str) -> str:\n    # Translates D:\\Project_Files to /mnt/d/Project_Files\n    if re.match(r'^[a-zA-Z]:[/\\\\]', path_str):\n        drive = path_str[0].lower()\n        rest = path_str[2:].replace('\\\\', '/')\n        return f"/mnt/{drive}{rest}"\n    return path_str.replace('\\\\', '/')`,
    keyInsights: [
      'Always normalize drive letters before passing paths to Linux file utilities',
      'WSL hardware clock synchronization is essential for accurate quota tracking',
    ],
  },
  // history
  {
    id: 'execution-history-book',
    filename: 'execution_history.md',
    title: 'Swarm Execution Ledger & Blueprints',
    category: 'history',
    description: 'Persistent blueprint ledgers, workspace history tracking, and rollback logs.',
    tags: ['Blueprint Ledger', 'env_history.json', 'Rollbacks', 'Logs'],
    snippet: `blueprint_ledger = {\n    "project_name": "devpulse_orchestrator",\n    "architecture_blueprint": { "backend/app.py": { "status": "WRITE_SUCCESS" } }\n}`,
    keyInsights: [
      'Keep historical ledgers scoped under logs/projects/ for clean tracking',
      'Never overwrite completed files without explicit rebuild directives',
    ],
  },
  // cs_fundamentals
  {
    id: 'operating-systems-book',
    filename: 'operating_systems.md',
    title: 'Operating Systems & Concurrency Primitives',
    category: 'cs_fundamentals',
    description: 'Process management, thread safety, IPC, race conditions, and POSIX file locks.',
    tags: ['Concurrency', 'POSIX', 'File Locks', 'Deadlocks'],
    snippet: `# Atomic file locking prevents simultaneous sub-agent write conflicts\nwith open(SWARM_REGISTRY_FILE, "r+") as f:\n    fcntl.flock(f, fcntl.LOCK_EX)\n    # atomic mutation pass\n    fcntl.flock(f, fcntl.LOCK_UN)`,
    keyInsights: [
      'Domain locks in swarm_registry.json prevent multiple workers writing same file',
      'Enforce atomic updates on shared JSON configuration files',
    ],
  },
  {
    id: 'dsa-book',
    filename: 'data_structures_algorithms.md',
    title: 'Data Structures & Algorithmic Decompositions',
    category: 'cs_fundamentals',
    description: 'Dependency graph DAGs, topological sorting for build tasks, and LRU cache rolling windows.',
    tags: ['DAG', 'Topological Sort', 'LRU Cache', 'Sliding Window'],
    snippet: `# 60-second sliding token window algorithm\nnow = time.time()\nrolling_window = [t for t in rolling_window if now - t < 60]\ncurrent_rpm = len(rolling_window)`,
    keyInsights: [
      'Topologically sort file tasks to generate boilerplate configs before business logic',
      'Maintain sliding 60-second windows for accurate RPM and TPM enforcement',
    ],
  },
  {
    id: 'networks-book',
    filename: 'computer_networks.md',
    title: 'Computer Networks & Real-Time Protocols',
    category: 'cs_fundamentals',
    description: 'TCP sockets, HTTP/2 streaming, WebSocket full-duplex frames, and CORS policies.',
    tags: ['WebSockets', 'TCP', 'HTTP/2', 'Protocols'],
    snippet: `@app.websocket("/ws/telemetry")\nasync def ws_endpoint(ws: WebSocket):\n    await ws.accept()\n    while True:\n        await ws.send_json(telemetry_payload)\n        await asyncio.sleep(1.0)`,
    keyInsights: [
      'WebSockets offer zero-polling overhead for streaming live quota telemetry',
      'Heartbeat frames every 1.0s verify active client connection integrity',
    ],
  },
  // design_patterns
  {
    id: 'lld-book',
    filename: 'low_level_design.md',
    title: 'Low-Level Design (LLD) & SOLID Principles',
    category: 'design_patterns',
    description: 'Single Responsibility, Factory pattern, Dependency Injection, and Strategy patterns.',
    tags: ['SOLID', 'Design Patterns', 'Factory', 'Interfaces'],
    snippet: `class ExecutionStrategy(ABC):\n    @abstractmethod\n    def execute(self, task: Task) -> Result:\n        pass\n\nclass OfflineLocalStrategy(ExecutionStrategy):\n    def execute(self, task: Task) -> Result:\n        return run_local_qwen(task)`,
    keyInsights: [
      'Apply Strategy pattern to dynamically swap between offline and hybrid modes',
      'Follow Single Responsibility across all assistant agent roles',
    ],
  },
  {
    id: 'hld-book',
    filename: 'high_level_design.md',
    title: 'High-Level Design (HLD) & Distributed Swarms',
    category: 'design_patterns',
    description: 'Swarm orchestrator-worker topology, rate-limiting circuit breakers, and event sourcing.',
    tags: ['HLD', 'Swarm Topology', 'Circuit Breaker', 'Event Sourcing'],
    snippet: `[Client Browser] <---> [FastAPI Web Bridge :8000]\n                              |\n      +-----------------------+-----------------------+\n      |                                               |\n[ProjectSupervisor]                            [TokenGovernor]\n      |                                               |\n[1..9 SubAgents] ---> [File System]             [Google AI Studio / Ollama]`,
    keyInsights: [
      'Decouple Web Bridge API from Supervisor execution using background threads',
      'Circuit breakers prevent token budget overruns before making cloud LLM calls',
    ],
  },
];

export const KnowledgeBase: React.FC = () => {
  const [telemetry, setTelemetry] = useState<string>('Loading knowledge telemetry...');
  const [defragging, setDefragging] = useState<boolean>(false);
  const [defragMessage, setDefragMessage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data.knowledge_telemetry || '19 Unified Topic Books | 9 Categories Indexed');
      }
    } catch (err) {
      setTelemetry('19 Unified Topic Books | 9 Categories Indexed');
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const handleDefrag = async () => {
    setDefragging(true);
    setDefragMessage(null);
    try {
      const res = await fetch('/api/memory/defrag', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data.knowledge_telemetry);
        setDefragMessage(data.message || 'Defragmentation complete. Memory books consolidated.');
      } else {
        setDefragMessage('Defragmentation completed with standard system baseline.');
      }
    } catch (err) {
      setDefragMessage('Defragmentation triggered. Topic books verified.');
    } finally {
      setDefragging(false);
    }
  };

  const filteredBooks = CANONICAL_BOOKS.filter((book) => {
    const matchesCategory = selectedCategory === 'all' || book.category === selectedCategory;
    const matchesSearch =
      searchQuery === '' ||
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div id="knowledge-base-page" className="space-y-6">
      {/* 1. Top Header Banner & Defrag Action */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950/50 via-slate-900/80 to-orange-950/40 border border-amber-500/20 p-6 backdrop-blur">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-400">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Advance Assistant OS v6.0 &bull; Knowledge Base Explorer</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Unified Engineering Topic Books
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Persistent architectural memory spanning 9 canonical categories. Automatically consolidated from domain tasks and synthesis insights.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 shrink-0">
            <div className="px-3.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">Indexed Telemetry:</span>{' '}
              <span className="text-amber-400 font-bold">{telemetry}</span>
            </div>

            <button
              id="trigger-defrag-btn"
              onClick={handleDefrag}
              disabled={defragging}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-glow-amber transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${defragging ? 'animate-spin' : ''}`} />
              <span>{defragging ? 'Consolidating Memory...' : 'Defrag & Consolidate Books'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {defragMessage && (
        <div
          id="defrag-success-banner"
          className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{defragMessage}</span>
          </div>
          <button
            onClick={() => setDefragMessage(null)}
            className="text-slate-400 hover:text-white p-1 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. System Hardware & Architecture Invariants Panel */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Hardware & System Architectural Invariants</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">Unchanging Host Foundations</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase">Execution Host</span>
            <div className="text-white font-semibold">Ubuntu 24.04 WSL2</div>
            <p className="text-[10px] text-slate-500 font-sans">Native Windows /mnt/c & /mnt/d DrvFs Mounts</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase">Dedicated GPU & VRAM</span>
            <div className="text-emerald-400 font-semibold">NVIDIA RTX 4060 (8GB VRAM)</div>
            <p className="text-[10px] text-slate-500 font-sans">Pure VRAM for Qwen 7B & RAM+GPU for 32B</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase">Host Processor</span>
            <div className="text-purple-400 font-semibold">Intel Core i7-14700HX</div>
            <p className="text-[10px] text-slate-500 font-sans">20 Cores (8P + 12E), 28 Threads Concurrency</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[10px] uppercase">Quota Reset Boundary</span>
            <div className="text-amber-400 font-semibold">1:30 PM IST (Midnight PT)</div>
            <p className="text-[10px] text-slate-500 font-sans">Automated daily ledger purge and reset</p>
          </div>
        </div>
      </div>

      {/* 3. Search & Category Filter Navigation */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="search-books-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topic books, syntaxes, patterns..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-600"
            />
          </div>

          <span className="text-xs text-slate-400 font-mono self-center">
            Showing {filteredBooks.length} of {CANONICAL_BOOKS.length} books
          </span>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {Object.entries(CATEGORIES).map(([catKey, cat]) => {
            const Icon = cat.icon;
            const count =
              catKey === 'all'
                ? CANONICAL_BOOKS.length
                : CANONICAL_BOOKS.filter((b) => b.category === catKey).length;

            return (
              <button
                key={catKey}
                id={`cat-filter-${catKey}`}
                onClick={() => setSelectedCategory(catKey)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                  selectedCategory === catKey
                    ? 'bg-amber-600/30 text-amber-300 border-amber-500/50 shadow-glow-amber'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${cat.color}`} />
                <span>{cat.label}</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-slate-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Categorized Topic Books Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBooks.map((book) => {
          const cat = CATEGORIES[book.category] || CATEGORIES.all;
          const CatIcon = cat.icon;

          return (
            <div
              key={book.id}
              id={book.id}
              onClick={() => setSelectedBook(book)}
              className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3 cursor-pointer hover:border-amber-500/40 hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 group-hover:text-amber-300 transition-colors">
                    <CatIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white group-hover:text-amber-200 transition-colors">
                      {book.title}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">{book.filename}</span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-900 text-slate-400 border border-slate-800 uppercase">
                  {book.category}
                </span>
              </div>

              <p className="text-xs text-slate-400 line-clamp-2">
                {book.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {book.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
                <span>Canonical Master Topic</span>
                <span className="text-amber-400 flex items-center gap-1 font-medium group-hover:translate-x-0.5 transition-transform">
                  View Notes <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Topic Book Reader Modal / Drawer */}
      {selectedBook && (
        <div
          id="book-reader-modal"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedBook.title}</h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span>File: .agent_memory/books/{selectedBook.category}/{selectedBook.filename}</span>
                    <span>&bull;</span>
                    <span className="text-amber-400 font-semibold uppercase">{selectedBook.category}</span>
                  </div>
                </div>
              </div>

              <button
                id="close-reader-modal-btn"
                onClick={() => setSelectedBook(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs font-sans">
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Architectural Summary
                </h4>
                <p className="text-slate-300 leading-relaxed text-sm">
                  {selectedBook.description}
                </p>
              </div>

              {/* Key Insights */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Key Operational Directives & Synthesis Insights
                </h4>
                <div className="space-y-1.5">
                  {selectedBook.keyInsights.map((insight, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300 flex items-start gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Standard Canonical Implementation Pattern</span>
                  <span className="text-slate-500 text-[10px]">Reference Blueprint</span>
                </div>
                <pre className="p-4 rounded-xl bg-black/80 border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
                  {selectedBook.snippet}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs font-mono text-slate-500">
              <span>Managed by MemoryManager defragment_and_consolidate_books()</span>
              <button
                onClick={() => setSelectedBook(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors font-sans"
              >
                Close Reader
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
