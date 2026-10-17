import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  Bot,
  Webhook,
  Shield,
  Eye,
  Mic,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Terminal,
  Layers,
  ScrollText,
  Lock,
  FolderGit2,
  Cpu,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Zap,
  Sliders
} from 'lucide-react';

// ==============================================================================
// TYPES & INTERFACES
// ==============================================================================

export type BridgeCategory = 'ALL' | 'AGENTIC_CLI' | 'WORKFLOW_MCP' | 'MULTIMODAL';

export interface ToolBridgeAdapter {
  id: string;
  name: string;
  category: 'AGENTIC_CLI' | 'WORKFLOW_MCP' | 'MULTIMODAL';
  categoryLabel: string;
  roleBadge: string;
  status: 'READY' | 'STANDBY';
  icon: React.ElementType;
  iconColor: string;
  description: string;
  endpointOrPath: string;
  envKey: string;
  cliPreview: string;
  latency: string;
  features: string[];
  integrationNote: string;
}

export interface SecurityGuardrail {
  id: string;
  name: string;
  status: 'ACTIVE & ENFORCED' | 'MONITORING';
  ruleCode: string;
  description: string;
  enforcedBy: string;
  threatBlocked: string;
  icon: React.ElementType;
  iconColor: string;
}

// ==============================================================================
// CONSTANTS & ADAPTER DEFINITIONS
// ==============================================================================

const SYSTEM_ADAPTERS: ToolBridgeAdapter[] = [
  {
    id: 'aider',
    name: 'Aider AI CLI Bridge',
    category: 'AGENTIC_CLI',
    categoryLabel: 'Agentic CLI',
    roleBadge: 'Autonomous Git Refactoring',
    status: 'READY',
    icon: Bot,
    iconColor: 'text-purple-400',
    description: 'Windows & WSL batch non-interactive coding agent for autonomous multi-file edits, Git commits, and AST lint-repair loops.',
    endpointOrPath: '/usr/local/bin/aider',
    envKey: 'OPENAI_API_KEY, GEMINI_API_KEY, AIDER_OPTS',
    cliPreview: 'aider --model qwen2.5-coder:32b --yes --no-auto-commit --message "<directive>"',
    latency: '< 1.8s spawn',
    features: ['In-place AST code edits', 'Automated git diffs', 'Deterministic test verification', 'Local workspace mounts'],
    integrationNote: 'Invoked via src/tool_bridge.py normalize_tool_path. Orchestrates headless code refactors inside the active project directory.'
  },
  {
    id: 'roocode',
    name: 'RooCode Bridge',
    category: 'AGENTIC_CLI',
    categoryLabel: 'Agentic CLI',
    roleBadge: 'VS Code & Cursor IDE Directives',
    status: 'READY',
    icon: Wrench,
    iconColor: 'text-amber-400',
    description: 'Direct workspace directive generator producing structured .roocode_task.md prompt blueprints for instant editor pick-up.',
    endpointOrPath: '<project_root>/.roocode_task.md',
    envKey: 'ROOCODE_WORKSPACE_ROOT',
    cliPreview: 'cat .roocode_task.md && code --goto .roocode_task.md:1',
    latency: '< 5ms write',
    features: ['Markdown task blueprints', 'Sub-task checklists', 'Scope containment', 'Automated file targeting'],
    integrationNote: 'Generates in-workspace .roocode_task.md prompt blueprints compatible with Cursor Composer, RooCode, and Windsurf agent modes.'
  },
  {
    id: 'n8n',
    name: 'n8n Automation Webhook',
    category: 'WORKFLOW_MCP',
    categoryLabel: 'Workflow & MCP',
    roleBadge: 'Local Desktop & Webhook Orchestration',
    status: 'READY',
    icon: Webhook,
    iconColor: 'text-emerald-400',
    description: 'Local Windows n8n webhook automation bridge orchestrating desktop workflows, notifications, and external microservice dispatches.',
    endpointOrPath: 'http://localhost:5678/webhook/advance-assistant-task',
    envKey: 'N8N_WEBHOOK_URL, N8N_API_KEY',
    cliPreview: 'curl -X POST http://localhost:5678/webhook/advance-assistant-task -H "Content-Type: application/json" -d \'{"task": "build_notify"}\'',
    latency: '12ms dispatch',
    features: ['Cross-platform triggers', 'Payload routing', 'Project trace logging', 'Desktop system notifications'],
    integrationNote: 'Dispatches task telemetry to port 5678. Automatically serializes project names, task prompts, and execution timestamps.'
  },
  {
    id: 'antigravity',
    name: 'Antigravity MCP Bridge',
    category: 'WORKFLOW_MCP',
    categoryLabel: 'Workflow & MCP',
    roleBadge: 'Isolated Process Sandbox & Sub-Agents',
    status: 'READY',
    icon: Shield,
    iconColor: 'text-indigo-400',
    description: 'Autonomous isolated execution sandbox environment running sub-goal tasks with strict filesystem boundaries and live telemetry.',
    endpointOrPath: 'antigravity mcp serve --transport stdio',
    envKey: 'ANTIGRAVITY_APP_DATA, MCP_CONFIG_PATH',
    cliPreview: 'antigravity run --dir "<target_dir>" --goal "<directive>"',
    latency: '< 2.2s init',
    features: ['Process sandboxing', 'Context isolation', 'Concurrent sub-tasking', 'Direct stdout tracing'],
    integrationNote: 'Invokes isolated task instances via Antigravity runtime, redirecting stdout/stderr into centralized categorical logs.'
  },
  {
    id: 'vision',
    name: 'Vision Multimodal Engine',
    category: 'MULTIMODAL',
    categoryLabel: 'Multimodal',
    roleBadge: 'Headless Playwright & Multimodal OCR',
    status: 'READY',
    icon: Eye,
    iconColor: 'text-cyan-400',
    description: 'Headless Playwright browser automation capturing high-res viewport snapshots analyzed by Gemini 2.5 Flash for UI layout regressions.',
    endpointOrPath: 'Playwright Chromium Headless + Gemini 2.5 Flash',
    envKey: 'PLAYWRIGHT_BROWSERS_PATH, GEMINI_API_KEY',
    cliPreview: 'python -m src.vision_engine --url http://localhost:5173 --capture-viewport',
    latency: '~1.4s render',
    features: ['Pixel-perfect captures', 'Zero-cost multimodal audit', 'Padding & border scrutiny', 'Alignment metrics'],
    integrationNote: 'Inspects active web URLs, saves snapshots to ./logs/latest_screenshot.png, and prompts Gemini 2.5 Flash under sliding governor budget.'
  },
  {
    id: 'voice',
    name: 'Voice Audio Engine',
    category: 'MULTIMODAL',
    categoryLabel: 'Multimodal',
    roleBadge: 'CUDA Faster-Whisper STT & espeak-ng TTS',
    status: 'READY',
    icon: Mic,
    iconColor: 'text-rose-400',
    description: 'Lazy-loaded CUDA Faster-Whisper float16 speech-to-text combined with lightweight espeak-ng local voice synthesizer.',
    endpointOrPath: 'Faster-Whisper (CUDA float16) + espeak-ng',
    envKey: 'WHISPER_MODEL_SIZE=small.en, CUDA_VISIBLE_DEVICES=0',
    cliPreview: 'python -m src.voice_engine --listen --device cuda:0',
    latency: '180ms inference',
    features: ['GPU memory-efficient lazy loading', 'Input shell sanitization', 'Zero external audio API cost', 'Sub-200ms latency'],
    integrationNote: 'Allocates VRAM only on microphone input. Synthesizes voice notifications via sanitized local system audio daemon.'
  }
];

const SECURITY_GUARDRAILS: SecurityGuardrail[] = [
  {
    id: 'wsl_normalizer',
    name: 'WSL Universal Path Normalizer',
    status: 'ACTIVE & ENFORCED',
    ruleCode: 'SEC-01',
    description: 'Converts all Windows drive paths (D:/..., C:\\...) to /mnt/d/... or native Linux /home/... before any disk or subprocess operation.',
    enforcedBy: 'src/config.py & src/permissions.py',
    threatBlocked: 'Cross-platform FileNotFoundError & path resolution mismatch across Windows/WSL2 boundaries',
    icon: FolderGit2,
    iconColor: 'text-cyan-400'
  },
  {
    id: 'staging_isolation',
    name: 'Staging Isolation Guard',
    status: 'ACTIVE & ENFORCED',
    ruleCode: 'SEC-02',
    description: 'Strictly sequesters active builds inside designated workspace roots, isolating test suites from production directories and memory stores.',
    enforcedBy: 'src/supervisor.py & preserve_agent_memory()',
    threatBlocked: 'Zero test pollution in .agent_memory/ and master logs',
    icon: Shield,
    iconColor: 'text-emerald-400'
  },
  {
    id: 'command_gatekeeper',
    name: 'Command Execution Gatekeeper',
    status: 'ACTIVE & ENFORCED',
    ruleCode: 'SEC-03',
    description: 'Intercepts high-risk bash commands (destructive rm -rf /, infinite background loops, unapproved daemons) before shell dispatch.',
    enforcedBy: 'src/permissions.py validate_command_safety()',
    threatBlocked: 'Uncontrolled shell execution, hanging orphaned processes, and destructive deletion',
    icon: Terminal,
    iconColor: 'text-amber-400'
  },
  {
    id: 'path_traversal',
    name: 'Path Traversal Shield',
    status: 'ACTIVE & ENFORCED',
    ruleCode: 'SEC-04',
    description: 'Blocks relative directory traversal (../..) attempting to escape designated project boundaries or access sensitive SSH keys / etc configs.',
    enforcedBy: 'src/permissions.py is_path_within_workspace()',
    threatBlocked: 'Directory escape, unauthorized credential read, and hostile workspace escape',
    icon: Lock,
    iconColor: 'text-rose-400'
  }
];

// ==============================================================================
// COMPONENT
// ==============================================================================

export const ToolBridges: React.FC = () => {
  const navigate = useNavigate();

  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<'bridges' | 'security'>('bridges');
  const [categoryFilter, setCategoryFilter] = useState<BridgeCategory>('ALL');
  const [expandedBridges, setExpandedBridges] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toggle single adapter drawer
  const toggleBridgeExpand = (id: string) => {
    setExpandedBridges((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Expand / Collapse all
  const toggleAllBridges = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    SYSTEM_ADAPTERS.forEach((b) => {
      updated[b.id] = expand;
    });
    setExpandedBridges(updated);
  };

  // Copy handler
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Manual refresh animation
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Filtered adapters
  const filteredAdapters = useMemo(() => {
    if (categoryFilter === 'ALL') return SYSTEM_ADAPTERS;
    return SYSTEM_ADAPTERS.filter((b) => b.category === categoryFilter);
  }, [categoryFilter]);

  const readyCount = useMemo(() => {
    return SYSTEM_ADAPTERS.filter((b) => b.status === 'READY').length;
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ==================================================================== */}
      {/* 1. COMPACT TOP BAR */}
      {/* ==================================================================== */}
      <header className="shrink-0 px-5 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur flex flex-wrap items-center justify-between gap-3">
        {/* Left: Title + Telemetry Pill */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-emerald-600 flex items-center justify-center shadow-glow-sm shrink-0">
            <Wrench className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Tool Bridges & Gatekeeper
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 uppercase">
                  v6.0
                </span>
              </h1>
              {/* Ready Status Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{readyCount}/{SYSTEM_ADAPTERS.length} Bridges Ready</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Extensible agentic CLI bridges, webhook dispatchers & workspace gatekeeper security
            </p>
          </div>
        </div>

        {/* Right: Category Filter, Refresh & Global Logs Button */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Category Filter Dropdown (only visible on bridges tab) */}
          {activeTab === 'bridges' && (
            <div className="flex items-center gap-1 text-xs">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as BridgeCategory)}
                className="bg-slate-800 border border-slate-700 text-cyan-300 font-semibold rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500 shadow-sm"
              >
                <option value="ALL">All Categories ({SYSTEM_ADAPTERS.length})</option>
                <option value="AGENTIC_CLI">🤖 Agentic CLI (2)</option>
                <option value="WORKFLOW_MCP">⚡ Workflow & MCP (2)</option>
                <option value="MULTIMODAL">👁️ Multimodal (2)</option>
              </select>
            </div>
          )}

          {/* Refresh Status Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            title="Refresh adapter status"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Open Full Log Center (/logs) */}
          <button
            onClick={() => navigate('/logs')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm transition-colors"
            title="Inspect global system and adapter logs"
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Full Log Center</span>
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. 2-TAB VIEW SWITCHER */}
      {/* ==================================================================== */}
      <nav className="shrink-0 px-5 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('bridges')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'bridges'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <span>🔌 External Tool & Agentic Bridges</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-blue-200">
              {filteredAdapters.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'security'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>🛡️ Gatekeeper & Workspace Security</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-emerald-200">
              {SECURITY_GUARDRAILS.length}
            </span>
          </button>
        </div>

        {/* Quick Expand All / Collapse All for Tab 1 */}
        {activeTab === 'bridges' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => toggleAllBridges(true)}
              className="text-slate-400 hover:text-cyan-300 transition-colors"
            >
              Expand All
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={() => toggleAllBridges(false)}
              className="text-slate-400 hover:text-cyan-300 transition-colors"
            >
              Collapse All
            </button>
          </div>
        )}
      </nav>

      {/* ==================================================================== */}
      {/* 3. TAB 1: EXTERNAL TOOL & AGENTIC BRIDGES (MINIMALIST PROGRESSIVE CARDS) */}
      {/* ==================================================================== */}
      {activeTab === 'bridges' && (
        <main className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-950">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredAdapters.map((adapter) => {
              const Icon = adapter.icon;
              const isExpanded = !!expandedBridges[adapter.id];

              return (
                <div
                  key={adapter.id}
                  className={`rounded-xl border transition-all duration-150 ${
                    isExpanded
                      ? 'bg-slate-900 border-indigo-700/60 shadow-lg'
                      : 'bg-slate-900/60 hover:bg-slate-900/90 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  {/* Default Collapsed Adapter Card: ONLY 4 concise items */}
                  <div
                    onClick={() => toggleBridgeExpand(adapter.id)}
                    className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    {/* Item 1: Adapter Icon & Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg bg-slate-800/90 border border-slate-700/70 flex items-center justify-center shrink-0 ${adapter.iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-white truncate">
                          {adapter.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 truncate">{adapter.categoryLabel}</p>
                      </div>
                    </div>

                    {/* Right side: Role Badge + Status Pill + Expand Button */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Item 2: Role / Category Badge */}
                      <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 border border-slate-700 text-slate-300">
                        {adapter.roleBadge}
                      </span>

                      {/* Item 3: Status Pill */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${
                          adapter.status === 'READY'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/70'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800/70'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {adapter.status}
                      </span>

                      {/* Item 4: Expand Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBridgeExpand(adapter.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title={isExpanded ? 'Collapse details' : 'Configure / Details'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Click-to-Expand Adapter Drawer */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/50 rounded-b-xl space-y-3 font-sans text-xs animate-in slide-in-from-top-1 duration-150">
                      {/* Description & Latency */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-slate-300 leading-relaxed text-xs">
                          {adapter.description}
                        </p>
                        <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded shrink-0">
                          {adapter.latency}
                        </span>
                      </div>

                      {/* Endpoint / Binary Path */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                          Target Endpoint / Binary Path:
                        </span>
                        <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-cyan-300 select-all">
                          <span className="truncate">{adapter.endpointOrPath}</span>
                          <button
                            onClick={() => handleCopy(adapter.endpointOrPath, `path_${adapter.id}`)}
                            className="text-slate-400 hover:text-white shrink-0"
                            title="Copy path"
                          >
                            {copiedId === `path_${adapter.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Environment Variable Key */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                          Environment Configuration:
                        </span>
                        <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-amber-300 select-all">
                          <span className="truncate">{adapter.envKey}</span>
                          <button
                            onClick={() => handleCopy(adapter.envKey, `env_${adapter.id}`)}
                            className="text-slate-400 hover:text-white shrink-0"
                            title="Copy environment variables"
                          >
                            {copiedId === `env_${adapter.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* CLI Invocation Preview */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 tracking-wider">
                          CLI Invocation Command:
                        </span>
                        <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed shadow-inner">
                          {adapter.cliPreview}
                        </pre>
                      </div>

                      {/* Feature Pills */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {adapter.features.map((feat, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800/80 text-slate-300 border border-slate-700/60"
                          >
                            ✓ {feat}
                          </span>
                        ))}
                      </div>

                      {/* Bottom Quick-Action Shortcuts */}
                      <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400 italic truncate" title={adapter.integrationNote}>
                          {adapter.integrationNote}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Copy Config */}
                          <button
                            onClick={() => handleCopy(JSON.stringify(adapter, null, 2), `full_${adapter.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 transition-colors"
                          >
                            {copiedId === `full_${adapter.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400" />
                            )}
                            <span>{copiedId === `full_${adapter.id}` ? 'Copied!' : 'Copy Config'}</span>
                          </button>

                          {/* View Logs Shortcut */}
                          <button
                            onClick={() => navigate('/logs')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700 text-xs font-semibold text-indigo-300 transition-colors"
                          >
                            <ScrollText className="w-3 h-3" />
                            <span>Logs in /logs</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ==================================================================== */}
      {/* 4. TAB 2: GATEKEEPER & WORKSPACE SECURITY */}
      {/* ==================================================================== */}
      {activeTab === 'security' && (
        <main className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-950">
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-800/40">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-white">Active System Gatekeeper Guardrails</h2>
                <p className="text-xs text-slate-300">
                  Deterministic boundaries isolating Windows / WSL filesystems, preventing command escape and memory pollution.
                </p>
              </div>
            </div>

            {/* Inspect Gatekeeper Audit Logs in /logs */}
            <button
              onClick={() => navigate('/logs')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors shrink-0"
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span>Inspect Gatekeeper Logs</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SECURITY_GUARDRAILS.map((guard) => {
              const Icon = guard.icon;

              return (
                <div
                  key={guard.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 space-y-3 transition-colors shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg bg-slate-800/90 border border-slate-700 ${guard.iconColor}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                          {guard.name}
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {guard.ruleCode}
                          </span>
                        </h3>
                        <p className="text-[11px] font-mono text-emerald-400">{guard.status}</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {guard.description}
                  </p>

                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Enforcement:</span>
                      <span className="text-slate-200">{guard.enforcedBy}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Threat Neutralized:</span>
                      <span className="text-rose-400 truncate max-w-[220px]" title={guard.threatBlocked}>
                        {guard.threatBlocked}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ==================================================================== */}
      {/* 5. FOOTER STATUS BAR */}
      {/* ==================================================================== */}
      <footer className="shrink-0 px-5 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span>Active View: <strong className="text-cyan-400">{activeTab.toUpperCase()}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Bridges Available: <strong className="text-emerald-400">{SYSTEM_ADAPTERS.length}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Gatekeeper Guardrails: <strong className="text-indigo-400">{SECURITY_GUARDRAILS.length}</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Security Layer Armed & Operational</span>
        </div>
      </footer>
    </div>
  );
};

export default ToolBridges;
