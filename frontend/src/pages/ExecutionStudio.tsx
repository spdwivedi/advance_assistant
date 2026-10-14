import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Rocket,
  Folder,
  Layers,
  Sliders,
  Play,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Shield,
  Activity,
  ArrowRight,
  Clock,
  Sparkles,
  RefreshCw,
  FolderOpen,
  FileCode,
  Terminal,
  Zap,
  SlidersHorizontal,
  CheckSquare,
  Square,
  History
} from 'lucide-react';

interface ConfigData {
  execution_modes: string[];
  default_mode: string;
  research_profiles: Record<string, { web_search_enabled: boolean; cache_raw_data: boolean; description: string }>;
  default_research_profile: string;
  model_constraining_profiles: Record<string, { allowed_models: string[]; description: string }>;
  default_constraining_profile: string;
  tier_pools: Record<string, string[]>;
  models: string[];
  defaults?: {
    isolation_enabled: boolean;
    max_swarm_workers: number;
    orchestrator_model: string;
    worker_model: string;
  };
}

interface HistoryData {
  history: string[];
  last_location: string;
  knowledge_telemetry: string;
}

interface ExecutionState {
  is_running: boolean;
  status: string;
  project_name: string | null;
  target_path: string | null;
  goal: string | null;
  mode: string | null;
  profile: string | null;
  constrain: string | null;
  isolate: boolean | null;
  start_time: number | null;
  end_time: number | null;
  error: string | null;
}

export const ExecutionStudio: React.FC = () => {
  // Metadata states
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Form input states
  const [targetPath, setTargetPath] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('default_project');
  const [goal, setGoal] = useState<string>('');
  const [mode, setMode] = useState<string>('AUTO_DETECT');
  const [profile, setProfile] = useState<string>('MAX');
  const [constrain, setConstrain] = useState<string>('HIGH_RPM_TPM');
  const [tier, setTier] = useState<string>('HIGH');
  const [maxWorkers, setMaxWorkers] = useState<number>(8);
  const [isolate, setIsolate] = useState<boolean>(false);
  const [autoDefrag, setAutoDefrag] = useState<boolean>(true);

  // UI feedback states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch initial configuration & history
  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        const [configRes, historyRes, healthRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/history'),
          fetch('/api/health'),
        ]);

        if (configRes.ok && isMounted) {
          const cfg: ConfigData = await configRes.json();
          setConfig(cfg);
          if (cfg.default_mode) setMode(cfg.default_mode);
          if (cfg.default_research_profile) setProfile(cfg.default_research_profile);
          if (cfg.default_constraining_profile) setConstrain(cfg.default_constraining_profile);
          if (cfg.defaults?.isolation_enabled !== undefined) setIsolate(cfg.defaults.isolation_enabled);
          if (cfg.defaults?.max_swarm_workers) setMaxWorkers(Math.min(cfg.defaults.max_swarm_workers - 1, 8));
        }

        // Hydrate default max workers and active swarm profile from Agent Hub
        try {
          const swarmsRes = await fetch("/api/swarms/profiles");
          if (swarmsRes.ok && isMounted) {
            const swData = await swarmsRes.json();
            if (swData.max_concurrency_workers) {
              setMaxWorkers(Math.min(Math.max(1, Number(swData.max_concurrency_workers)), 16));
            }
          }
        } catch (sErr) {
          // Graceful fallback to default config
        }

        if (historyRes.ok && isMounted) {
          const hist: HistoryData = await historyRes.json();
          setHistory(hist);
          if (hist.last_location) {
            setTargetPath(hist.last_location);
            const folderName = hist.last_location.split(/[\/\\]/).filter(Boolean).pop();
            if (folderName) setProjectName(folderName);
          }
        }

        if (healthRes.ok && isMounted) {
          const hData = await healthRes.json();
          if (hData.execution_state) {
            setExecutionState(hData.execution_state);
          }
        }
      } catch (err) {
        console.error('Failed to load initial Execution Studio metadata:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialData();

    // Health poll every 4 seconds to observe running background build state
    const healthInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.execution_state) {
            setExecutionState(data.execution_state);
          }
        }
      } catch (err) {
        // Silently ignore polling hiccups
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(healthInterval);
    };
  }, []);

  // Quick preset templates for rapid testing and goal authoring
  const PRESET_GOALS = [
    {
      title: 'Full-Stack Web App',
      project: 'task_manager_app',
      text: 'Build a production full-stack Task Manager with FastAPI async SQLAlchemy SQLite backend, REST endpoints for tasks and tags, and a modern Vite React TypeScript frontend with Tailwind CSS and dark mode.',
    },
    {
      title: 'Microservice API',
      project: 'metrics_api',
      text: 'Implement an asynchronous Python microservice using FastAPI with rate limiting, Pydantic v2 schemas, automated health-check router, and comprehensive Pytest test fixtures.',
    },
    {
      title: 'Automated Agent Bridge',
      project: 'automation_bridge',
      text: 'Create a local orchestration bridge connecting n8n webhook webhooks with filesystem event listeners, structured JSON logging, and autonomous error recovery mechanisms.',
    },
  ];

  const handleSelectHistoryPath = (path: string) => {
    setTargetPath(path);
    const folderName = path.split(/[\/\\]/).filter(Boolean).pop();
    if (folderName) setProjectName(folderName);
  };

  const handleApplyPreset = (preset: typeof PRESET_GOALS[0]) => {
    setGoal(preset.text);
    setProjectName(preset.project);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!targetPath.trim()) {
      setErrorMessage('Please specify a valid Target Workspace Path.');
      return;
    }

    if (!goal.trim()) {
      setErrorMessage('Please enter an Engineering Goal or architectural directive.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        target_path: targetPath.trim(),
        project_name: projectName.trim() || 'default_project',
        goal: goal.trim(),
        mode,
        profile,
        constrain,
        isolate,
        max_workers: Number(maxWorkers),
      };

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 200) {
        const data = await res.json();
        setSuccessMessage(
          `Autonomous pipeline initiated for "${payload.project_name}". Background threads are active.`
        );
        setExecutionState((prev) => ({
          ...(prev || {
            error: null,
            start_time: Date.now(),
            end_time: null,
          }),
          is_running: true,
          status: 'RUNNING',
          project_name: payload.project_name,
          target_path: payload.target_path,
          goal: payload.goal,
          mode: payload.mode,
          profile: payload.profile,
          constrain: payload.constrain,
          isolate: payload.isolate,
          start_time: Date.now(),
          end_time: null,
          error: null,
        }));
      } else if (res.status === 409) {
        const errorData = await res.json();
        setErrorMessage(
          errorData.detail ||
            'Concurrent build conflict: A build job is already actively running. Check the Live Swarm Monitor.'
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        setErrorMessage(
          errorData.detail || `Server returned error status HTTP ${res.status}. Check system logs.`
        );
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Failed to communicate with Web Bridge API. Verify server is online.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBuildActive = Boolean(executionState?.is_running);

  return (
    <div id="execution-studio-page" className="space-y-6">
      {/* Top Banner & Status Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950/50 via-slate-900/80 to-indigo-950/40 border border-blue-500/20 p-6 backdrop-blur">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-400">
              <Rocket className="w-3.5 h-3.5" />
              <span>Advance Assistant OS v6.0 &bull; Master Execution Studio</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Autonomous Swarm Build Dispatcher
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Configure cross-platform project destinations, execution modes, fine-grained quota constraints, and launch multi-agent engineering pipelines.
            </p>
          </div>

          {/* Quick Engine Telemetry Chips */}
          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2 shrink-0 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 font-mono">
              <span className="text-slate-400">Knowledge:</span>
              <span className="text-amber-400 font-semibold">{history?.knowledge_telemetry || '19 Books Indexed'}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 font-mono">
              <span className="text-slate-400">Pipeline State:</span>
              <span
                className={`flex items-center gap-1.5 font-semibold ${
                  isBuildActive ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isBuildActive ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                  }`}
                />
                {isBuildActive ? `BUILDING: ${executionState?.project_name}` : 'IDLE (READY)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Running Job Alert Notice */}
      {isBuildActive && (
        <div
          id="active-job-notice"
          className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="font-semibold text-white">
                Active Autonomous Build in Progress: &ldquo;{executionState?.project_name}&rdquo;
              </div>
              <div className="text-slate-300 font-mono mt-0.5 truncate max-w-xl">
                Location: {executionState?.target_path} | Mode: {executionState?.mode}
              </div>
            </div>
          </div>
          <Link
            to="/swarm"
            id="view-active-swarm-link"
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all flex items-center gap-1.5 shrink-0"
          >
            <span>Live Swarm Monitor</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div
          id="success-message-banner"
          className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <Link
            to="/swarm"
            id="success-swarm-link"
            className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold border border-emerald-500/30 transition-all flex items-center gap-1.5 shrink-0"
          >
            <span>Inspect Swarm Execution</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div
          id="error-message-banner"
          className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2.5"
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Main Studio Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workspace & Destination Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Folder className="w-4 h-4 text-blue-400" />
              <span>Workspace & Target Directory</span>
            </div>
            <span className="text-slate-400 text-xs font-mono">Cross-Platform Path Translator</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Target Path Input */}
            <div className="md:col-span-2 space-y-1.5">
              <label htmlFor="target-path-input" className="block text-xs font-semibold text-slate-300">
                Target Workspace Path <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="target-path-input"
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="/mnt/d/Project_Files/... or D:\Project_Files\..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                />
              </div>
              {!targetPath.trim() ? (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Target path cannot be empty
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 font-mono truncate">
                  Resolved destination: {targetPath}
                </p>
              )}
            </div>

            {/* Project Name Input */}
            <div className="space-y-1.5">
              <label htmlFor="project-name-input" className="block text-xs font-semibold text-slate-300">
                Project Identifier
              </label>
              <input
                id="project-name-input"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. devpulse_api"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
              />
              <p className="text-[11px] text-slate-500">Scopes ledger under logs/projects/</p>
            </div>
          </div>

          {/* Historical Workspace Chips */}
          {history?.history && history.history.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800/60">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <History className="w-3.5 h-3.5 text-indigo-400" />
                <span>Recent Workspace History:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.history.map((histPath, idx) => (
                  <button
                    key={`${histPath}-${idx}`}
                    type="button"
                    id={`history-chip-${idx}`}
                    onClick={() => handleSelectHistoryPath(histPath)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition-all border ${
                      targetPath === histPath
                        ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 shadow-glow-sm'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {histPath.split(/[\/\\]/).filter(Boolean).pop() || histPath}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Engineering Goal & Directives Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <FileCode className="w-4 h-4 text-indigo-400" />
              <span>Engineering Goal & Directive</span>
              <span className="text-rose-400">*</span>
            </div>
            <span className="text-slate-500 text-xs">Architectural blueprint breakdown prompt</span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 text-xs">Load Blueprint Preset:</span>
            {PRESET_GOALS.map((preset, idx) => (
              <button
                key={preset.title}
                type="button"
                id={`preset-btn-${idx}`}
                onClick={() => handleApplyPreset(preset)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-indigo-900/50 text-indigo-300 border border-slate-700/60 hover:border-indigo-500/40 text-xs transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>{preset.title}</span>
              </button>
            ))}
          </div>

          {/* Goal Textarea */}
          <div className="space-y-1.5">
            <textarea
              id="goal-input"
              rows={4}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe your engineering goal in detail. e.g. 'Build a complete FastAPI backend with user authentication and React frontend...' "
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600 resize-y"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Goal directives will be decomposed into discrete file-writing tasks by the Orchestrator.</span>
              <span>{goal.length} characters</span>
            </div>
          </div>
        </div>

        {/* Parameter Matrices Grid */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <SlidersHorizontal className="w-4 h-4 text-purple-400" />
              <span>Multi-Engine Parameter Matrix</span>
            </div>
            <span className="text-slate-400 text-xs font-mono">Governor & Model Allocation Config</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Execution Mode */}
            <div className="space-y-1.5">
              <label htmlFor="execution-mode-select" className="block text-xs font-semibold text-slate-300">
                Primary Execution Mode
              </label>
              <select
                id="execution-mode-select"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-purple-500 transition-all"
              >
                {(config?.execution_modes || [
                  'AUTO_DETECT',
                  'OFFLINE_ONLY',
                  'HYBRID_CLOUD',
                  'OFFLINE_AGENTIC',
                  'HYBRID_AGENTIC',
                ]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                {mode === 'AUTO_DETECT'
                  ? 'Auto selects best model pool based on internet & Ollama'
                  : mode === 'OFFLINE_ONLY'
                  ? 'Pure local GPU execution using Qwen 2.5 Coder'
                  : 'Balances Flash cloud models with local fallbacks'}
              </p>
            </div>

            {/* Research Profile */}
            <div className="space-y-1.5">
              <label htmlFor="research-profile-select" className="block text-xs font-semibold text-slate-300">
                Research & Planning Level
              </label>
              <select
                id="research-profile-select"
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-purple-500 transition-all"
              >
                {Object.keys(config?.research_profiles || { BASIC: {}, MEDIUM: {}, HIGH: {}, MAX: {} }).map((p) => (
                  <option key={p} value={p}>
                    {p} - {config?.research_profiles?.[p]?.description || p}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                {config?.research_profiles?.[profile]?.description || 'Controls web research & documentation caching.'}
              </p>
            </div>

            {/* Model Constraining Profile */}
            <div className="space-y-1.5">
              <label htmlFor="constraining-profile-select" className="block text-xs font-semibold text-slate-300">
                Model Constraining Profile
              </label>
              <select
                id="constraining-profile-select"
                value={constrain}
                onChange={(e) => setConstrain(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-purple-500 transition-all"
              >
                {Object.keys(
                  config?.model_constraining_profiles || {
                    HIGH_RPM_TPM: {},
                    HIGHEST_RPM_TPM: {},
                    PRO_PLAN: {},
                    GEMINI_ONLY: {},
                    OFFLINE_PURE: {},
                  }
                ).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 truncate" title={config?.model_constraining_profiles?.[constrain]?.description}>
                {config?.model_constraining_profiles?.[constrain]?.description || 'Governor rate limiter filter.'}
              </p>
            </div>

            {/* Target Tier Pool */}
            <div className="space-y-1.5">
              <label htmlFor="target-tier-select" className="block text-xs font-semibold text-slate-300">
                Target Model Tier
              </label>
              <select
                id="target-tier-select"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white font-mono text-xs focus:outline-none focus:border-purple-500 transition-all"
              >
                {['HIGH', 'MID', 'FAST'].map((t) => (
                  <option key={t} value={t}>
                    {t} TIER ({t === 'HIGH' ? 'Pro 3.1 & 32B' : t === 'MID' ? 'Flash 3.5 & 32B' : 'Flash-Lite 4K RPM'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                {tier === 'HIGH' ? 'Deep reasoning & planning' : tier === 'MID' ? 'Balanced generation' : 'Ultra-high concurrency writes'}
              </p>
            </div>

            {/* Max Concurrency Workers */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="workers-input" className="block text-xs font-semibold text-slate-300">
                  Swarm Concurrency Workers
                </label>
                <span className="font-mono text-xs text-purple-400 font-bold">{maxWorkers} / 16</span>
              </div>
              <input
                id="workers-slider"
                type="range"
                min={1}
                max={16}
                value={maxWorkers}
                onChange={(e) => setMaxWorkers(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>1 worker (Serial)</span>
                <span>8 workers (Standard Swarm)</span>
                <span>16 workers (Burst Mode)</span>
              </div>
            </div>

            {/* Checklist & Operational Toggles */}
            <div className="space-y-3 pt-1">
              <span className="block text-xs font-semibold text-slate-300">Build Safety & Isolation</span>

              {/* Staging Isolation Toggle */}
              <label
                id="isolation-toggle-label"
                className="flex items-start gap-2.5 cursor-pointer text-xs select-none"
              >
                <input
                  type="checkbox"
                  id="isolate-toggle"
                  checked={isolate}
                  onChange={(e) => setIsolate(e.target.checked)}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="font-medium text-slate-200">Isolated Staging Mode</span>
                  <p className="text-[11px] text-slate-500">
                    Executes writes in .staging_temp before merging to target destination.
                  </p>
                </div>
              </label>

              {/* Memory Defrag Toggle */}
              <label
                id="auto-defrag-toggle-label"
                className="flex items-start gap-2.5 cursor-pointer text-xs select-none"
              >
                <input
                  type="checkbox"
                  id="auto-defrag-toggle"
                  checked={autoDefrag}
                  onChange={(e) => setAutoDefrag(e.target.checked)}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="font-medium text-slate-200">Post-Build Memory Defrag</span>
                  <p className="text-[11px] text-slate-500">
                    Consolidates temporary domain files into topic books after run.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Action Controls & Dispatch Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 glass-panel rounded-2xl border border-slate-800">
          <div className="text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-slate-200">Financial Safety Cap Active:</span>
              <span>85% TPM ceiling prevents billing breaches.</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Ready to dispatch to ProjectSupervisor.process_complete_development_cycle()
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="submit"
              id="launch-pipeline-btn"
              disabled={submitting || isBuildActive || !targetPath.trim() || !goal.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-glow-md hover:shadow-glow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Dispatching Pipeline...</span>
                </>
              ) : isBuildActive ? (
                <>
                  <Activity className="w-4 h-4 animate-pulse text-amber-300" />
                  <span>Build Currently Running</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Swarm Pipeline</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ExecutionStudio;
