import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Users,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  Clock,
  Lock,
  Terminal,
  Layers,
  Wifi,
  WifiOff,
  Radio,
  FileText,
  AlertTriangle,
  Trash2,
  Play,
  Pause,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Server,
  Zap,
  RefreshCw,
  FolderOpen,
  Key,
  Pin,
  Sparkles,
  Globe
} from 'lucide-react';

interface KeyPoolTelemetry {
  routing_policy: 'GLOBAL_HYBRID' | 'FREE_POOL' | 'PAID_POOL' | 'SINGLE_PINNED';
  pinned_key_id: string | null;
  total_keys: number;
  selected_keys: number;
  active_free: number;
  active_paid: number;
  active_keys?: number;
  exhausted_keys?: number;
  keys_summary?: Array<{
    id: string;
    key: string;
    tier: string;
    label: string;
    is_selected: boolean;
    status: string;
  }>;
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
  current_operation?: string | null;
}

interface SwarmRegistry {
  project_name: string | null;
  project_root: string | null;
  active_workspace: string | null;
  max_available_workers: number;
  domain_locks: Record<string, string>;
  completed_files: string[];
  status: string;
}

interface ModelQuotaData {
  snippet: string;
  limits: {
    rpm: number;
    tpm: number;
    rpd: number;
  };
}

interface TelemetryPayload {
  execution_state: ExecutionState;
  swarm_registry: SwarmRegistry;
  quotas: Record<string, ModelQuotaData>;
  knowledge_telemetry: string;
  key_pool?: KeyPoolTelemetry;
  timestamp: number;
}

interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'EVENT' | 'LOCK' | 'WRITE' | 'WARN';
  message: string;
}

// 11 Registered System Models Categorized
const MODEL_CATEGORIES: Record<string, { tier: 'LOCAL' | 'FLASH' | 'PRO'; color: string }> = {
  'qwen2.5-coder:32b': { tier: 'LOCAL', color: 'text-purple-400 bg-purple-950/80 border-purple-800' },
  'qwen2.5-coder:7b': { tier: 'LOCAL', color: 'text-purple-400 bg-purple-950/80 border-purple-800' },
  'gemini-3.1-pro-preview': { tier: 'PRO', color: 'text-amber-400 bg-amber-950/80 border-amber-800' },
  'gemini-2.5-pro': { tier: 'PRO', color: 'text-amber-400 bg-amber-950/80 border-amber-800' },
  'gemini-3.6-flash': { tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-3.5-flash': { tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-3-flash-preview': { tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-2.5-flash': { tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-3.5-flash-lite': { tier: 'FLASH', color: 'text-cyan-400 bg-cyan-950/80 border-cyan-800' },
  'gemini-3.1-flash-lite': { tier: 'FLASH', color: 'text-cyan-400 bg-cyan-950/80 border-cyan-800' },
  'gemini-2.5-flash-lite': { tier: 'FLASH', color: 'text-cyan-400 bg-cyan-950/80 border-cyan-800' },
};

export const SwarmMonitor: React.FC = () => {
  // Connection states
  const [connectionMode, setConnectionMode] = useState<'ws' | 'http' | 'connecting'>('connecting');
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());

  // Core Data Payloads
  const [execState, setExecState] = useState<ExecutionState>({
    is_running: false,
    status: 'IDLE',
    project_name: 'default_project',
    target_path: null,
    goal: null,
    mode: 'AUTO_DETECT',
    profile: 'MAX',
    constrain: 'HIGH_RPM_TPM',
    isolate: false,
    start_time: null,
    end_time: null,
    error: null,
  });

  const [swarm, setSwarm] = useState<SwarmRegistry>({
    project_name: 'default_project',
    project_root: '',
    active_workspace: '',
    max_available_workers: 9,
    domain_locks: {},
    completed_files: [],
    status: 'IDLE',
  });

  const [quotas, setQuotas] = useState<Record<string, ModelQuotaData>>({});
  const [knowledgeTelemetry, setKnowledgeTelemetry] = useState<string>('19 Unified Topic Books | 9 Categories');
  const [keyPool, setKeyPool] = useState<KeyPoolTelemetry>({
    routing_policy: 'GLOBAL_HYBRID',
    pinned_key_id: null,
    total_keys: 0,
    selected_keys: 0,
    active_free: 0,
    active_paid: 0,
  });

  // UI state toggles
  const [showCompletedFiles, setShowCompletedFiles] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: 'Autonomous Swarm Monitor initialized. Listening on live telemetry socket.',
    },
    {
      id: 'init-2',
      timestamp: new Date().toLocaleTimeString(),
      type: 'EVENT',
      message: 'Dual-model governor telemetry active. Quota Anchor: 1:30 PM IST (Midnight PT).',
    },
  ]);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const prevCompletedFilesCount = useRef<number>(0);
  const prevLocksRef = useRef<Record<string, string>>({});

  const addLog = (type: ConsoleLogEntry['type'], message: string) => {
    setLogs((prev) => [
      ...prev.slice(-150),
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
      },
    ]);
  };

  // 1. Telemetry Connection Handler (WebSocket with HTTP Polling Fallback)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollInterval: any = null;
    let isCleanedUp = false;

    const startHttpPolling = () => {
      if (isCleanedUp) return;
      setConnectionMode('http');
      addLog('WARN', 'WebSocket unavailable. Engaged fallback HTTP polling (2.0s interval).');

      const fetchTelemetryHttp = async () => {
        try {
          const [swarmRes, teleRes, healthRes] = await Promise.all([
            fetch('/api/swarm/status'),
            fetch('/api/telemetry'),
            fetch('/api/health'),
          ]);

          if (swarmRes.ok) {
            const swarmData = await swarmRes.json();
            setSwarm(swarmData);
          }

          if (teleRes.ok) {
            const teleData = await teleRes.json();
            if (teleData.models) setQuotas(teleData.models);
            if (teleData.key_pool) setKeyPool(teleData.key_pool);
          }

          if (healthRes.ok) {
            const healthData = await healthRes.json();
            if (healthData.execution_state) setExecState(healthData.execution_state);
            if (healthData.key_pool) setKeyPool((prev) => healthData.key_pool || prev);
          }

          setLastHeartbeat(Date.now());
        } catch (err) {
          // ignore transient poll drops
        }
      };

      fetchTelemetryHttp();
      pollInterval = setInterval(fetchTelemetryHttp, 2000);
    };

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/telemetry`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isCleanedUp) return;
          setConnectionMode('ws');
          addLog('INFO', 'Connected to real-time telemetry WebSocket stream (/ws/telemetry).');
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        };

        ws.onmessage = (event) => {
          if (isCleanedUp) return;
          try {
            const payload: TelemetryPayload = JSON.parse(event.data);
            if (payload.execution_state) setExecState(payload.execution_state);
            if (payload.swarm_registry) setSwarm(payload.swarm_registry);
            if (payload.quotas) setQuotas(payload.quotas);
            if (payload.knowledge_telemetry) setKnowledgeTelemetry(payload.knowledge_telemetry);
            if (payload.key_pool) setKeyPool(payload.key_pool);
            setLastHeartbeat(Date.now());

            // Detect newly written files
            const newFiles = payload.swarm_registry?.completed_files || [];
            if (newFiles.length > prevCompletedFilesCount.current) {
              const diff = newFiles.slice(prevCompletedFilesCount.current);
              diff.forEach((file) => {
                addLog('WRITE', `Verified File Output: ${file.split(/[\/\\]/).pop()} (${file})`);
              });
              prevCompletedFilesCount.current = newFiles.length;
            }

            // Detect domain lock changes
            const newLocks = payload.swarm_registry?.domain_locks || {};
            const prevLocks = prevLocksRef.current;
            Object.entries(newLocks).forEach(([path, worker]) => {
              if (prevLocks[path] !== worker) {
                addLog('LOCK', `Domain Lock Acquired by [${worker}] on ${path.split(/[\/\\]/).pop()}`);
              }
            });
            prevLocksRef.current = newLocks;
          } catch (err) {
            console.error('Failed to parse telemetry frame:', err);
          }
        };

        ws.onerror = () => {
          if (connectionMode !== 'http') {
            startHttpPolling();
          }
        };

        ws.onclose = () => {
          if (!isCleanedUp && connectionMode !== 'http') {
            startHttpPolling();
          }
        };
      } catch (err) {
        startHttpPolling();
      }
    };

    connectWebSocket();

    return () => {
      isCleanedUp = true;
      if (ws) {
        ws.close();
        ws = null;
      }
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  }, []);

  // Auto-scroll console
  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Parse quota snippet: "[RPM: 0/25 | TPM: 0.0K/2000K | RPD: 0/250]"
  const parseSnippet = (snippet: string, limits?: { rpm: number; tpm: number; rpd: number }) => {
    const rpmMatch = snippet?.match(/RPM:\s*(\d+)\/(\d+)/);
    const tpmMatch = snippet?.match(/TPM:\s*([\d.]+)K?\/([\d.]+)K?/);
    const rpdMatch = snippet?.match(/RPD:\s*(\d+)\/(\d+)/);

    const rpm = rpmMatch ? parseFloat(rpmMatch[1]) : 0;
    const maxRpm = rpmMatch ? parseFloat(rpmMatch[2]) : limits?.rpm || 1;

    const tpm = tpmMatch ? parseFloat(tpmMatch[1]) : 0;
    const maxTpm = tpmMatch ? parseFloat(tpmMatch[2]) : limits ? limits.tpm / 1000 : 1;

    const rpd = rpdMatch ? parseFloat(rpdMatch[1]) : 0;
    const maxRpd = rpdMatch ? parseFloat(rpdMatch[2]) : limits?.rpd || 1;

    const rpmPct = Math.min(Math.round((rpm / Math.max(maxRpm, 1)) * 100), 100);
    const tpmPct = Math.min(Math.round((tpm / Math.max(maxTpm, 1)) * 100), 100);
    const rpdPct = Math.min(Math.round((rpd / Math.max(maxRpd, 1)) * 100), 100);

    const isFinancialShield = tpmPct >= 85;

    return {
      rpm,
      maxRpm,
      rpmPct,
      tpm,
      maxTpm,
      tpmPct,
      rpd,
      maxRpd,
      rpdPct,
      isFinancialShield,
    };
  };

  // Workforce Worker Definitions (Orchestrator and SubAgent-1 through SubAgent-9)
  const workerSlots = [
    {
      id: 'worker-orchestrator',
      role: 'Orchestrator',
      engine: 'qwen2.5-coder:32b',
      tier: 'LOCAL_CORE',
      taskDescription: 'System blueprint breakdown, task dependencies, and synthesis consolidation.',
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `worker-subagent-${i + 1}`,
      role: `SubAgent-${i + 1}`,
      engine: 'Adaptive Flash / Lite Pool',
      tier: 'CLOUD_SWARM',
      taskDescription: `Autonomous business logic module compilation and syntax write pass.`,
    })),
  ];

  // Helper resolving policy routing badge for individual models
  const getPolicyRoutingBadge = (modelName: string) => {
    const isLocal = modelName.toLowerCase().includes('qwen');
    if (isLocal) {
      return {
        text: '💻 Local Ollama Core',
        color: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
      };
    }

    const policy = keyPool.routing_policy || 'GLOBAL_HYBRID';

    if (policy === 'SINGLE_PINNED') {
      return {
        text: '📌 Pinned Key Active',
        color: 'bg-purple-950/80 text-purple-300 border-purple-700 shadow-glow-sm',
      };
    }

    if (policy === 'FREE_POOL') {
      return {
        text: '🟢 Free Pool Only',
        color: 'bg-emerald-950/80 text-emerald-300 border-emerald-700',
      };
    }

    if (policy === 'PAID_POOL') {
      return {
        text: '🟡 Paid Pool Only',
        color: 'bg-amber-950/80 text-amber-300 border-amber-700',
      };
    }

    // GLOBAL_HYBRID
    const isPro = modelName.toLowerCase().includes('pro');
    if (isPro) {
      return {
        text: '🔒 Prioritizing Paid Key Pool',
        color: 'bg-amber-950/80 text-amber-300 border-amber-600',
      };
    } else {
      return {
        text: '🟢 Prioritizing Free Key Pool',
        color: 'bg-emerald-950/80 text-emerald-300 border-emerald-600',
      };
    }
  };

  // Determine worker status from domain_locks & execState
  const getWorkerStatus = (role: string) => {
    const isLocked = Object.values(swarm.domain_locks || {}).some(
      (assigned) => assigned.toLowerCase() === role.toLowerCase()
    );

    if (isLocked || (role === 'Orchestrator' && execState.is_running && swarm.completed_files.length === 0)) {
      return { status: 'RUNNING', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    }
    if (execState.status === 'COMPLETED' || (!execState.is_running && swarm.completed_files.length > 0)) {
      return { status: 'DONE', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    }
    if (execState.status === 'FAILED') {
      return { status: 'FAILED', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
    }
    return { status: 'READY', badge: 'bg-slate-800 text-slate-400 border-slate-700' };
  };

  const getWorkerLockedFile = (role: string) => {
    const entry = Object.entries(swarm.domain_locks || {}).find(
      ([_, assigned]) => assigned.toLowerCase() === role.toLowerCase()
    );
    return entry ? entry[0] : null;
  };

  return (
    <div id="swarm-monitor-page" className="space-y-6">
      {/* 1. Header & Live Connection Status Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-teal-950/40 border border-emerald-500/20 p-6 backdrop-blur">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-400">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Advance Assistant OS v6.0 &bull; Swarm Monitor</span>
              </span>

              {/* Connection Pill */}
              <span
                id="telemetry-connection-pill"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${
                  connectionMode === 'ws'
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 shadow-glow-emerald'
                    : 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                }`}
              >
                {connectionMode === 'ws' ? (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span>WebSocket Live (1.0s stream)</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                    <span>HTTP Polling Active (2.0s fallback)</span>
                  </>
                )}
              </span>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Cooperative Multi-Agent Swarm Matrix
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Monitors active worker thread states, concurrent domain locks, blueprint execution stages, and file history updates in real-time.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-2 shrink-0 text-xs font-mono">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <span className="text-slate-400">Knowledge:</span>
              <span className="text-amber-400 font-semibold">{knowledgeTelemetry}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <span className="text-slate-400">Reset Anchor:</span>
              <span className="text-indigo-400 font-semibold">1:30 PM IST (Midnight PT)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Workspace & Active Swarm Header Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <FolderOpen className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-base font-bold text-white tracking-tight">
                {execState.project_name || swarm.project_name || 'default_project'}
              </span>
              <span
                id="swarm-status-badge"
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${
                  execState.is_running
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500 animate-pulse'
                    : execState.status === 'COMPLETED'
                    ? 'bg-blue-950/80 text-blue-400 border-blue-500'
                    : execState.status === 'FAILED'
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {execState.is_running ? 'BUILD RUNNING' : execState.status || swarm.status || 'INITIALIZED'}
              </span>

              {/* Active Key Policy Indicator Badge */}
              <span
                id="swarm-key-policy-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${
                  keyPool.routing_policy === 'GLOBAL_HYBRID'
                    ? 'bg-indigo-950/90 text-indigo-300 border-indigo-600 shadow-glow-sm'
                    : keyPool.routing_policy === 'FREE_POOL'
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600 shadow-glow-emerald'
                    : keyPool.routing_policy === 'PAID_POOL'
                    ? 'bg-amber-950/90 text-amber-300 border-amber-600 shadow-glow-amber'
                    : 'bg-purple-950/90 text-purple-300 border-purple-600 shadow-glow-sm'
                }`}
                title={`Active Swarm Routing Policy: ${keyPool.routing_policy || 'GLOBAL_HYBRID'}\nParticipating Keys: ${keyPool.selected_keys || 0}`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>{keyPool.routing_policy || 'GLOBAL_HYBRID'}</span>
                <span className="text-[10px] font-normal opacity-90 pl-1 border-l border-slate-700/60 lowercase">
                  🔑 {keyPool.selected_keys || 0} {keyPool.selected_keys === 1 ? 'Key' : 'Keys'} in Pool
                </span>
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono truncate max-w-3xl" title={execState.target_path || swarm.active_workspace || ''}>
              Workspace: {execState.target_path || swarm.active_workspace || swarm.project_root || 'Target location pending'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400">Available Workers:</span>
              <span className="text-white font-bold">{swarm.max_available_workers} Threads</span>
            </div>

            <button
              onClick={() => setShowCompletedFiles(!showCompletedFiles)}
              id="toggle-completed-files-btn"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{swarm.completed_files?.length || 0} Files</span>
              {showCompletedFiles ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Real-time Current Swarm Operation Banner */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2.5 truncate max-w-3xl">
            <Activity className={`w-4 h-4 shrink-0 ${execState.is_running ? 'text-emerald-400 animate-spin' : 'text-slate-500'}`} />
            <span className="text-slate-400 font-semibold">Current Pipeline Operation:</span>
            <span className="text-slate-200 truncate">
              {execState.current_operation ||
                (execState.is_running
                  ? 'Sub-agents actively processing discrete module breakdown and writes...'
                  : 'Swarm engine standing by for next goal directive.')}
            </span>
          </div>
          <span className="text-slate-500 shrink-0 text-[11px]">
            Mode: {execState.mode || 'AUTO_DETECT'} | Constrain: {execState.constrain || 'HIGH_RPM_TPM'}
          </span>
        </div>

        {/* Expandable Completed Files List */}
        {showCompletedFiles && (
          <div id="completed-files-list" className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              <span>Verified Generated Artifacts & Unit Files ({swarm.completed_files?.length || 0})</span>
              <span>swarm_registry.json</span>
            </div>
            {swarm.completed_files && swarm.completed_files.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {swarm.completed_files.map((file, idx) => (
                  <div
                    key={`${file}-${idx}`}
                    className="flex items-center gap-2 p-1.5 rounded bg-slate-900 border border-slate-800/80 text-slate-300 text-[11px] truncate"
                    title={file}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{file.split(/[\/\\]/).pop() || file}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-xs">No files generated in current session yet.</p>
            )}
          </div>
        )}
      </div>

      {/* 3. Cooperative Worker Grid (Up to 9 Sub-Agent Workers) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Cooperative Swarm Workforce Grid</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {Object.keys(swarm.domain_locks || {}).length} Active Domain File Locks
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workerSlots.map((worker) => {
            const { status, badge } = getWorkerStatus(worker.role);
            const lockedFile = getWorkerLockedFile(worker.role);

            return (
              <div
                key={worker.id}
                id={worker.id}
                className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3 hover:border-emerald-500/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{worker.role}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">{worker.engine}</p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badge}`}>
                    {status}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2">
                  {worker.taskDescription}
                </p>

                {/* Model Tier & Key Source Status Chip */}
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-[10px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-300 font-semibold">{worker.tier}</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium border ${
                      worker.role === 'Orchestrator'
                        ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                        : keyPool.routing_policy === 'PAID_POOL'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                        : keyPool.routing_policy === 'FREE_POOL'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                        : keyPool.routing_policy === 'SINGLE_PINNED'
                        ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                        : 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                    }`}
                  >
                    <Key className="w-2.5 h-2.5" />
                    <span>
                      {worker.role === 'Orchestrator'
                        ? 'Offline Ollama'
                        : keyPool.routing_policy === 'SINGLE_PINNED'
                        ? 'Pinned Key Channel'
                        : keyPool.routing_policy === 'PAID_POOL'
                        ? 'Paid Key Channel'
                        : keyPool.routing_policy === 'FREE_POOL'
                        ? 'Free Key Channel'
                        : 'Hybrid Key Matrix'}
                    </span>
                  </span>
                </div>

                {/* Domain Lock Target */}
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 font-mono text-[11px] space-y-1">
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-400" /> Locked File:
                    </span>
                    <span className={lockedFile ? 'text-amber-400 font-semibold' : 'text-slate-600'}>
                      {lockedFile ? 'EXCLUSIVE' : 'NONE'}
                    </span>
                  </div>
                  <div className="text-slate-200 truncate" title={lockedFile || 'No active domain lock'}>
                    {lockedFile ? lockedFile.split(/[\/\\]/).pop() : 'Waiting for task assignment...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Token Governor Quota Gauges & Financial Shield Matrix */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span>Token Governor Quota Gauges & 85% Financial Shield</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Hard Boundaries & Pacing for 11 Registered Engines
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(MODEL_CATEGORIES).map(([modelName, category]) => {
            const modelData = quotas[modelName];
            const snippet = modelData?.snippet || '[RPM: 0/1000 | TPM: 0.0K/2000K | RPD: 0/10000]';
            const parsed = parseSnippet(snippet, modelData?.limits);

            return (
              <div
                key={modelName}
                id={`gauge-card-${modelName}`}
                className={`glass-panel p-4 rounded-xl border transition-all space-y-3 ${
                  parsed.isFinancialShield
                    ? 'border-amber-500/60 bg-amber-950/20 shadow-glow-amber'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-bold text-white truncate" title={modelName}>
                      {modelName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {parsed.isFinancialShield && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                        <ShieldAlert className="w-2.5 h-2.5" /> 85% CAP
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${category.color}`}>
                      {category.tier}
                    </span>
                  </div>
                </div>

                {/* Raw Snippet Box */}
                <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300">
                  {snippet}
                </div>

                {/* Policy Routing Tag */}
                {(() => {
                  const routingTag = getPolicyRoutingBadge(modelName);
                  return (
                    <div className="flex items-center justify-between text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
                      <span className="text-slate-400">Key Routing:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${routingTag.color}`}>
                        {routingTag.text}
                      </span>
                    </div>
                  );
                })()}

                {/* Sliding Visual Progress Bars */}
                <div className="space-y-2 text-[11px] font-mono">
                  {/* RPM Bar */}
                  <div>
                    <div className="flex justify-between text-slate-400 text-[10px] mb-0.5">
                      <span>RPM: {parsed.rpm} / {parsed.maxRpm}</span>
                      <span>{parsed.rpmPct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${parsed.rpmPct}%` }}
                      />
                    </div>
                  </div>

                  {/* TPM Bar (With 85% Shield Color) */}
                  <div>
                    <div className="flex justify-between text-slate-400 text-[10px] mb-0.5">
                      <span className={parsed.isFinancialShield ? 'text-amber-400 font-semibold' : ''}>
                        TPM: {parsed.tpm}K / {parsed.maxTpm}K
                      </span>
                      <span className={parsed.isFinancialShield ? 'text-amber-400 font-bold' : ''}>
                        {parsed.tpmPct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          parsed.isFinancialShield ? 'bg-amber-400' : 'bg-purple-500'
                        }`}
                        style={{ width: `${parsed.tpmPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Daily RPD Bar */}
                  <div>
                    <div className="flex justify-between text-slate-400 text-[10px] mb-0.5">
                      <span>Daily RPD: {parsed.rpd} / {parsed.maxRpd}</span>
                      <span>{parsed.rpdPct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${parsed.rpdPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Real-Time Monospace Execution Console */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Real-Time Execution Console Stream</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              id="toggle-autoscroll-btn"
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 border ${
                autoScroll
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {autoScroll ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
              <span>Auto-scroll</span>
            </button>

            <button
              onClick={() => setLogs([])}
              id="clear-logs-btn"
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 text-xs font-mono transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Terminal Screen */}
        <div
          id="execution-console-stream"
          className="h-64 rounded-2xl bg-black/80 border border-slate-800 p-4 font-mono text-xs overflow-y-auto space-y-1.5 shadow-inner"
        >
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-slate-600 select-none shrink-0">[{log.timestamp}]</span>
              <span
                className={`px-1 rounded text-[10px] font-bold select-none shrink-0 ${
                  log.type === 'WRITE'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : log.type === 'LOCK'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : log.type === 'EVENT'
                    ? 'bg-purple-950 text-purple-400 border border-purple-800'
                    : log.type === 'WARN'
                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                    : 'bg-blue-950 text-blue-400 border border-blue-800'
                }`}
              >
                {log.type}
              </span>
              <span
                className={`${
                  log.type === 'WRITE'
                    ? 'text-emerald-300 font-semibold'
                    : log.type === 'LOCK'
                    ? 'text-amber-300'
                    : log.type === 'WARN'
                    ? 'text-rose-300'
                    : 'text-slate-300'
                }`}
              >
                {log.message}
              </span>
            </div>
          ))}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  );
};

export default SwarmMonitor;
