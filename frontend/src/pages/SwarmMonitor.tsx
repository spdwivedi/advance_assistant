import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Square,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Server,
  Zap,
  RefreshCw,
  FolderOpen,
  Key,
  Pin,
  Sparkles,
  Globe,
  Copy,
  Check,
  X,
  Eye,
  Filter,
  Sliders,
  ExternalLink,
  Maximize2,
  Minimize2
} from 'lucide-react';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface KeyPoolTelemetry {
  routing_policy: 'GLOBAL_HYBRID' | 'FREE_POOL' | 'PAID_POOL' | 'SINGLE_PINNED';
  pinned_key_id: string | null;
  total_keys: number;
  selected_keys: number;
  active_free: number;
  active_paid: number;
  active_keys?: number;
  exhausted_keys?: number;
  google_keys?: number;
  groq_keys?: number;
  keys_summary?: Array<{
    id: string;
    key: string;
    tier: string;
    label: string;
    is_selected: boolean;
    status: string;
  }>;
}

export interface ExecutionState {
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

export interface SwarmRegistry {
  project_name: string | null;
  project_root: string | null;
  active_workspace: string | null;
  max_available_workers: number;
  domain_locks: Record<string, string>;
  completed_files: string[];
  status: string;
  active_swarm_id?: string;
  orchestrator_engine?: string;
}

export interface ModelQuotaData {
  snippet: string;
  limits: {
    rpm: number;
    tpm: number;
    rpd: number;
  };
}

export interface WorkingLimits {
  rpm: number;
  tpm: number;
  rpd: number;
  max_input_tokens: number;
  max_output_tokens: number;
  thinking_budget: number;
}

export interface StrictLimits {
  rpm: number;
  tpm: number;
  rpd: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
}

export interface ModelHierarchyNode {
  working_limits: WorkingLimits;
  strict_limits: StrictLimits;
  rolling_rpm?: number;
  rolling_tpm?: number;
  current_rpm?: number | null;
  current_tpm?: number | null;
  in_flight_requests?: number;
  in_flight_reserved_tokens?: number;
  requests_today?: number;
  input_tokens_today?: number;
  output_tokens_today?: number;
  thinking_tokens_today?: number;
  total_tokens_today?: number;
}

export interface FinancialShieldData {
  paid_tier_locked: boolean;
  daily_paid_token_cap: number;
  per_build_paid_token_cap: number;
  enforce_working_limits: boolean;
  safety_margin_percent: number;
}

export interface HierarchyData {
  financial_shield?: FinancialShieldData;
  paid_tokens_today?: number;
  paid_tokens_current_build?: number;
  per_build_paid_token_cap?: number;
  active_build_project?: string;
  last_reset_date?: string;
  active_in_flight_leases?: number;
  providers?: Record<string, Record<string, Record<string, ModelHierarchyNode>>>;
}

export interface TelemetryPayload {
  execution_state: ExecutionState;
  swarm_registry: SwarmRegistry;
  quotas: Record<string, ModelQuotaData>;
  knowledge_telemetry: string;
  key_pool?: KeyPoolTelemetry;
  hierarchy?: HierarchyData;
  cost_estimate?: any;
  timestamp: number;
}

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  type: 'INFO' | 'EVENT' | 'LOCK' | 'WRITE' | 'WARN';
  message: string;
}

export interface ScannedFileItem {
  rel_path: string;
  size_bytes: number;
  ext: string;
  last_modified: string;
}

export interface InspectedFileState {
  path: string;
  fullPath?: string;
  content: string;
  sizeBytes: number;
  lineCount: number;
  language: string;
  lastModified?: string;
  loading: boolean;
  error: string | null;
}

// 11 Default registered model categories
const MODEL_CATEGORIES: Record<string, { provider: 'GOOGLE' | 'GROQ' | 'OLLAMA'; tier: 'LOCAL' | 'FLASH' | 'PRO'; color: string }> = {
  'qwen2.5-coder:32b': { provider: 'OLLAMA', tier: 'LOCAL', color: 'text-purple-400 bg-purple-950/80 border-purple-800' },
  'qwen2.5-coder:7b': { provider: 'OLLAMA', tier: 'LOCAL', color: 'text-purple-400 bg-purple-950/80 border-purple-800' },
  'gemini-3.1-pro-preview': { provider: 'GOOGLE', tier: 'PRO', color: 'text-amber-400 bg-amber-950/80 border-amber-800' },
  'gemini-2.5-pro': { provider: 'GOOGLE', tier: 'PRO', color: 'text-amber-400 bg-amber-950/80 border-amber-800' },
  'gemini-3.6-flash': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-3.5-flash': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-3-flash-preview': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-2.5-flash': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
  'gemini-3.5-flash-lite': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-cyan-400 bg-cyan-950/80 border-cyan-800' },
  'gemini-3.1-flash-lite': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-cyan-400 bg-cyan-950/80 border-cyan-800' },
  'gemini-2.5-flash-lite': { provider: 'GOOGLE', tier: 'FLASH', color: 'text-cyan-400 bg-cyan-950/80 border-cyan-800' },
  'llama-3.3-70b-versatile': { provider: 'GROQ', tier: 'PRO', color: 'text-orange-400 bg-orange-950/80 border-orange-800' },
  'llama-3.1-8b-instant': { provider: 'GROQ', tier: 'FLASH', color: 'text-orange-300 bg-orange-950/80 border-orange-800' },
  'qwen-2.5-coder-32b': { provider: 'GROQ', tier: 'PRO', color: 'text-orange-400 bg-orange-950/80 border-orange-800' }
};

// Preset default worker slots (up to 16 dynamic workers)
interface WorkerDefinition {
  id: string;
  role: string;
  displayName: string;
  engine: string;
  provider: 'GOOGLE' | 'GROQ' | 'OLLAMA';
  tierCategory: 'LOCAL_CORE' | 'CLOUD_SWARM' | 'GROQ_LPU';
  taskDescription: string;
}

const DEFAULT_WORKER_PRESETS: WorkerDefinition[] = [
  {
    id: 'worker-orchestrator',
    role: 'Orchestrator',
    displayName: 'Master Orchestrator',
    engine: 'qwen2.5-coder:32b',
    provider: 'OLLAMA',
    tierCategory: 'LOCAL_CORE',
    taskDescription: 'Phase 0 Architect: System blueprint breakdown, task dependencies, and synthesis consolidation.'
  },
  {
    id: 'worker-subagent-1',
    role: 'SubAgent-1',
    displayName: 'SubAgent-1 (Lead Developer)',
    engine: 'gemini-3.6-flash',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'High-Performance Developer: Primary application orchestration and backend API services.'
  },
  {
    id: 'worker-subagent-2',
    role: 'SubAgent-2',
    displayName: 'SubAgent-2 (Core Writer)',
    engine: 'gemini-3.5-flash',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Core Feature Writer: Domain models, database persistence, and operational handlers.'
  },
  {
    id: 'worker-subagent-3',
    role: 'SubAgent-3',
    displayName: 'SubAgent-3 (UI Scaffolder)',
    engine: 'gemini-3.5-flash-lite',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Rapid UI Scaffolder: Component view layout, styling primitives, and route bindings.'
  },
  {
    id: 'worker-subagent-4',
    role: 'SubAgent-4',
    displayName: 'SubAgent-4 (Groq Velocity)',
    engine: 'llama-3.3-70b-versatile',
    provider: 'GROQ',
    tierCategory: 'GROQ_LPU',
    taskDescription: 'Groq Velocity Coder: Ultra-low latency code transforms and algorithmic logic passes.'
  },
  {
    id: 'worker-subagent-5',
    role: 'SubAgent-5',
    displayName: 'SubAgent-5 (Legacy Writer)',
    engine: 'gemini-2.5-flash',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Legacy Feature Writer: Backward compatibility, utilities, and helper migration passes.'
  },
  {
    id: 'worker-subagent-6',
    role: 'SubAgent-6',
    displayName: 'SubAgent-6 (Volume Scaffolder)',
    engine: 'gemini-3.1-flash-lite',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'High-Volume Scaffolder: Large-file declarations, types, schema declarations, and asset stubs.'
  },
  {
    id: 'worker-subagent-7',
    role: 'SubAgent-7',
    displayName: 'SubAgent-7 (Boilerplate Optimizer)',
    engine: 'gemini-2.5-flash-lite',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Boilerplate Optimizer: Config builders, JSON schema serializations, and packaging scripts.'
  },
  {
    id: 'worker-subagent-8',
    role: 'SubAgent-8',
    displayName: 'SubAgent-8 (Beta Prototyper)',
    engine: 'gemini-3-flash-preview',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Beta Prototyper: Experimental module synthesis, exploratory mocks, and staging stubs.'
  },
  {
    id: 'worker-subagent-9',
    role: 'SubAgent-9',
    displayName: 'SubAgent-9 (Local Janitor)',
    engine: 'qwen2.5-coder:7b',
    provider: 'OLLAMA',
    tierCategory: 'LOCAL_CORE',
    taskDescription: 'Local Janitor Agent: Offline linter validation, docstrings, formatting, and file cleanup.'
  },
  {
    id: 'worker-subagent-10',
    role: 'SubAgent-10',
    displayName: 'SubAgent-10 (Groq Instant)',
    engine: 'llama-3.1-8b-instant',
    provider: 'GROQ',
    tierCategory: 'GROQ_LPU',
    taskDescription: 'Groq Instant Worker: Sub-second regex refactoring and mechanical token replacements.'
  },
  {
    id: 'worker-subagent-11',
    role: 'SubAgent-11',
    displayName: 'SubAgent-11 (Groq Qwen)',
    engine: 'qwen-2.5-coder-32b',
    provider: 'GROQ',
    tierCategory: 'GROQ_LPU',
    taskDescription: 'Groq Qwen Coder: Fast contextual analysis and syntax validation.'
  },
  {
    id: 'worker-subagent-12',
    role: 'SubAgent-12',
    displayName: 'SubAgent-12 (Enterprise Architect)',
    engine: 'gemini-2.5-pro',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Enterprise Architect: Contract validation and cross-module interface enforcement.'
  },
  {
    id: 'worker-subagent-13',
    role: 'SubAgent-13',
    displayName: 'SubAgent-13 (Adaptive Worker)',
    engine: 'gemini-3.6-flash',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Dynamic Swarm Expansion Worker: Parallelized module breakdown unit generation.'
  },
  {
    id: 'worker-subagent-14',
    role: 'SubAgent-14',
    displayName: 'SubAgent-14 (Adaptive Worker)',
    engine: 'gemini-3.5-flash',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Dynamic Swarm Expansion Worker: Auxiliary module builder and parallel file writer.'
  },
  {
    id: 'worker-subagent-15',
    role: 'SubAgent-15',
    displayName: 'SubAgent-15 (Adaptive Worker)',
    engine: 'gemini-3.5-flash-lite',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Dynamic Swarm Expansion Worker: Fast parallelized template scaffold pass.'
  },
  {
    id: 'worker-subagent-16',
    role: 'SubAgent-16',
    displayName: 'SubAgent-16 (Adaptive Worker)',
    engine: 'gemini-2.5-flash',
    provider: 'GOOGLE',
    tierCategory: 'CLOUD_SWARM',
    taskDescription: 'Dynamic Swarm Expansion Worker: Deep auxiliary verification and test fixture writer.'
  }
];

// ==========================================
// COMPONENT
// ==========================================

export const SwarmMonitor: React.FC = () => {
  const navigate = useNavigate();

  // Active Tab: 'agents' | 'files' | 'quotas'
  const [activeTab, setActiveTab] = useState<'agents' | 'files' | 'quotas'>('agents');

  // Connection & Telemetry State
  const [connectionMode, setConnectionMode] = useState<'ws' | 'http' | 'connecting'>('connecting');
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());

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
    current_operation: null
  });

  const [swarm, setSwarm] = useState<SwarmRegistry>({
    project_name: 'default_project',
    project_root: '',
    active_workspace: '',
    max_available_workers: 9,
    domain_locks: {},
    completed_files: [],
    status: 'IDLE',
    active_swarm_id: 'GLOBAL_HYBRID_SWARM',
    orchestrator_engine: 'qwen2.5-coder:32b'
  });

  const [hierarchy, setHierarchy] = useState<HierarchyData | null>(null);
  const [legacyQuotas, setLegacyQuotas] = useState<Record<string, ModelQuotaData>>({});
  const [knowledgeTelemetry, setKnowledgeTelemetry] = useState<string>('19 Unified Topic Books | 9 Categories');
  const [keyPool, setKeyPool] = useState<KeyPoolTelemetry>({
    routing_policy: 'GLOBAL_HYBRID',
    pinned_key_id: null,
    total_keys: 0,
    selected_keys: 0,
    active_free: 0,
    active_paid: 0
  });

  // Top Controls Filter States
  const [providerFilter, setProviderFilter] = useState<'ALL' | 'GOOGLE' | 'GROQ' | 'OLLAMA'>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'FREE' | 'PAID' | 'LOCAL'>('ALL');
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState<boolean>(false);
  const [isLifecycleBusy, setIsLifecycleBusy] = useState<boolean>(false);

  // Tab 1: Agent Drawer & Trace Bar States
  const [workerDisplayFilter, setWorkerDisplayFilter] = useState<'all' | 'active'>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isAgentDrawerMinimized, setIsAgentDrawerMinimized] = useState<boolean>(false);
  const [isTraceExpanded, setIsTraceExpanded] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Logs stream
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'INFO',
      message: 'Autonomous Swarm Monitor initialized. 3-Tab Activity Matrix ready.'
    },
    {
      id: 'init-2',
      timestamp: new Date().toLocaleTimeString(),
      type: 'EVENT',
      message: 'Dual-model governor telemetry active. Quota Anchor: 1:30 PM IST (Midnight PT).'
    }
  ]);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const prevCompletedFilesCount = useRef<number>(0);
  const prevLocksRef = useRef<Record<string, string>>({});

  // Tab 2: Generated Files & Code Viewer State
  const [fileSubFilter, setFileSubFilter] = useState<'all' | 'completed' | 'locked' | 'workspace'>('all');
  const [scannedFiles, setScannedFiles] = useState<ScannedFileItem[]>([]);
  const [isScanningWorkspace, setIsScanningWorkspace] = useState<boolean>(false);
  const [inspectedFile, setInspectedFile] = useState<InspectedFileState | null>(null);
  const [isCodeDrawerMinimized, setIsCodeDrawerMinimized] = useState<boolean>(false);
  const [copyCodeSuccess, setCopyCodeSuccess] = useState<boolean>(false);

  // Tab 3: Model Quota Card Expand Sets
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  // Helper log emitter
  const addLog = (type: ConsoleLogEntry['type'], message: string) => {
    setLogs((prev) => [
      ...prev.slice(-200),
      {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message
      }
    ]);
  };

  // ==========================================
  // 1. TELEMETRY CONNECTION (WS + HTTP FALLBACK)
  // ==========================================

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollInterval: any = null;
    let isCleanedUp = false;

    const startHttpPolling = () => {
      if (isCleanedUp) return;
      setConnectionMode('http');
      addLog('WARN', 'WebSocket dropped or unavailable. Falling back to HTTP Polling (2.0s interval).');

      const fetchTelemetryHttp = async () => {
        try {
          const [swarmRes, teleRes, healthRes, hierRes] = await Promise.all([
            fetch('/api/swarm/status'),
            fetch('/api/telemetry'),
            fetch('/api/health'),
            fetch('/api/governor/hierarchy')
          ]);

          if (swarmRes.ok) {
            const swarmData = await swarmRes.json();
            setSwarm((prev) => ({ ...prev, ...swarmData }));
          }

          if (teleRes.ok) {
            const teleData = await teleRes.json();
            if (teleData.models) setLegacyQuotas(teleData.models);
            if (teleData.key_pool) setKeyPool(teleData.key_pool);
          }

          if (healthRes.ok) {
            const healthData = await healthRes.json();
            if (healthData.execution_state) setExecState(healthData.execution_state);
            if (healthData.key_pool) setKeyPool((prev) => healthData.key_pool || prev);
          }

          if (hierRes.ok) {
            const hierData = await hierRes.json();
            if (hierData.hierarchy) setHierarchy(hierData.hierarchy);
          }

          setLastHeartbeat(Date.now());
        } catch (err) {
          // ignore transient poll errors
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
            if (payload.quotas) setLegacyQuotas(payload.quotas);
            if (payload.knowledge_telemetry) setKnowledgeTelemetry(payload.knowledge_telemetry);
            if (payload.key_pool) setKeyPool(payload.key_pool);
            if (payload.hierarchy) setHierarchy(payload.hierarchy);
            setLastHeartbeat(Date.now());

            // Detect newly written files
            const newFiles = payload.swarm_registry?.completed_files || [];
            if (newFiles.length > prevCompletedFilesCount.current) {
              const diff = newFiles.slice(prevCompletedFilesCount.current);
              diff.forEach((file) => {
                const fname = file.split(/[\/\\]/).pop() || file;
                addLog('WRITE', `Verified File Output: ${fname} (${file})`);
              });
              prevCompletedFilesCount.current = newFiles.length;
            }

            // Detect domain lock changes
            const newLocks = payload.swarm_registry?.domain_locks || {};
            const prevLocks = prevLocksRef.current;
            Object.entries(newLocks).forEach(([path, worker]) => {
              if (prevLocks[path] !== worker) {
                const fname = path.split(/[\/\\]/).pop() || path;
                addLog('LOCK', `Domain Lock Acquired by [${worker}] on ${fname}`);
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

  // Auto-scroll execution console
  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isTraceExpanded]);

  // ==========================================
  // 2. QUICK ACTIONS & LIFECYCLE DISPATCHERS
  // ==========================================

  // Policy Switcher Dispatcher
  const handlePolicyChange = async (newPolicy: KeyPoolTelemetry['routing_policy']) => {
    setIsUpdatingPolicy(true);
    try {
      const res = await fetch('/api/keys/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_policy: newPolicy })
      });
      if (res.ok) {
        const data = await res.json();
        setKeyPool((prev) => ({
          ...prev,
          routing_policy: newPolicy,
          pinned_key_id: data.pinned_key_id !== undefined ? data.pinned_key_id : prev.pinned_key_id
        }));
        addLog('EVENT', `Swarm Key Routing Policy updated to [${newPolicy}] via quick-switcher.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        addLog('WARN', `Failed to update policy: ${errData.detail || res.statusText}`);
      }
    } catch (err: any) {
      addLog('WARN', `Policy change error: ${err.message}`);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  // Build Pause / Resume Dispatcher
  const handleTogglePause = async () => {
    const isPausedNow = execState.status === 'PAUSED';
    setIsLifecycleBusy(true);
    try {
      const res = await fetch('/api/execute/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !isPausedNow })
      });
      if (res.ok) {
        const data = await res.json();
        const nextPaused = data.is_paused ?? !isPausedNow;
        setExecState((prev) => ({
          ...prev,
          status: nextPaused ? 'PAUSED' : 'RUNNING'
        }));
        addLog('EVENT', nextPaused ? 'Build execution lifecycle PAUSED.' : 'Build execution lifecycle RESUMED.');
      } else {
        const errData = await res.json().catch(() => ({}));
        addLog('WARN', `Pause action failed: ${errData.detail || res.statusText}`);
      }
    } catch (err: any) {
      addLog('WARN', `Pause error: ${err.message}`);
    } finally {
      setIsLifecycleBusy(false);
    }
  };

  // Build Stop Dispatcher
  const handleStopBuild = async () => {
    if (!window.confirm('Halt the active swarm build process immediately?')) return;
    setIsLifecycleBusy(true);
    try {
      const res = await fetch('/api/execute/stop', {
        method: 'POST'
      });
      if (res.ok) {
        setExecState((prev) => ({
          ...prev,
          is_running: false,
          status: 'CANCELLED'
        }));
        addLog('WARN', 'Swarm execution immediately HALTED by operator request.');
      } else {
        const errData = await res.json().catch(() => ({}));
        addLog('WARN', `Stop action failed: ${errData.detail || res.statusText}`);
      }
    } catch (err: any) {
      addLog('WARN', `Stop error: ${err.message}`);
    } finally {
      setIsLifecycleBusy(false);
    }
  };

  // ==========================================
  // 3. WORKFORCE DATA RESOLUTION (TAB 1)
  // ==========================================

  // Resolve total worker slots (up to 16 dynamic workers based on swarm.max_available_workers)
  const activeWorkerSlots = useMemo(() => {
    const maxWorkers = Math.min(Math.max(swarm.max_available_workers || 9, 8), 16);
    const slots = [
      DEFAULT_WORKER_PRESETS[0], // Orchestrator
      ...DEFAULT_WORKER_PRESETS.slice(1, maxWorkers + 1)
    ];

    // Filter by Provider if selected
    if (providerFilter === 'ALL') {
      return slots;
    }
    return slots.filter((slot) => slot.provider === providerFilter);
  }, [swarm.max_available_workers, providerFilter]);

  // Compute status & locked files for any worker role
  const getWorkerStatusInfo = (role: string) => {
    const isLocked = Object.entries(swarm.domain_locks || {}).find(
      ([_, assigned]) => assigned.toLowerCase() === role.toLowerCase()
    );

    const isOrchestratorActive =
      role === 'Orchestrator' && execState.is_running && (swarm.completed_files.length === 0 || isLocked);

    let statusText: 'WORKING' | 'PAUSED' | 'STANDBY' = 'STANDBY';
    let badgeClass = 'bg-slate-800 text-slate-400 border-slate-700';

    if (execState.status === 'PAUSED' && (isLocked || isOrchestratorActive)) {
      statusText = 'PAUSED';
      badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-600 shadow-glow-amber';
    } else if (isLocked || isOrchestratorActive) {
      statusText = 'WORKING';
      badgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-500 shadow-glow-emerald animate-pulse';
    }

    return {
      status: statusText,
      badge: badgeClass,
      lockedFile: isLocked ? isLocked[0] : null
    };
  };

  // Active only worker list
  const visibleWorkerSlots = useMemo(() => {
    if (workerDisplayFilter === 'all') {
      return activeWorkerSlots;
    }
    return activeWorkerSlots.filter((worker) => {
      const { status } = getWorkerStatusInfo(worker.role);
      return status === 'WORKING' || status === 'PAUSED';
    });
  }, [activeWorkerSlots, workerDisplayFilter, swarm.domain_locks, execState.status, execState.is_running]);

  // Selected Agent Object
  const selectedWorker = useMemo(() => {
    if (!selectedAgentId) return null;
    return DEFAULT_WORKER_PRESETS.find((w) => w.id === selectedAgentId) || null;
  }, [selectedAgentId]);

  // Key routing badge helper for worker cards & drawer
  const getAgentRoutingBadge = (worker: WorkerDefinition) => {
    if (worker.provider === 'OLLAMA') {
      return {
        text: '💻 Local Offline Core',
        color: 'bg-purple-950/80 text-purple-300 border-purple-800/80'
      };
    }
    const policy = keyPool.routing_policy || 'GLOBAL_HYBRID';
    if (policy === 'SINGLE_PINNED') {
      return {
        text: '📌 Pinned Key Channel',
        color: 'bg-purple-950/80 text-purple-300 border-purple-700 shadow-glow-sm'
      };
    }
    if (policy === 'FREE_POOL') {
      return {
        text: '🟢 Free Key Pool',
        color: 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
      };
    }
    if (policy === 'PAID_POOL') {
      return {
        text: '🟡 Paid Key Pool',
        color: 'bg-amber-950/80 text-amber-300 border-amber-700'
      };
    }
    // GLOBAL_HYBRID
    if (worker.engine.toLowerCase().includes('pro')) {
      return {
        text: '🟡 Prioritizing Paid Key Pool',
        color: 'bg-amber-950/80 text-amber-300 border-amber-600'
      };
    }
    return {
      text: '🟢 Prioritizing Free Key Pool',
      color: 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
    };
  };

  // ==========================================
  // 4. GENERATED FILES & CODE INSPECTOR (TAB 2)
  // ==========================================

  // Full workspace scan dispatcher
  const handleScanWorkspace = async () => {
    const targetDir = execState.target_path || swarm.active_workspace || swarm.project_root || '.';
    setIsScanningWorkspace(true);
    try {
      const res = await fetch(`/api/workspace/scan?path=${encodeURIComponent(targetDir)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.files && Array.isArray(data.files)) {
          setScannedFiles(data.files);
          addLog('INFO', `Workspace scan complete: discovered ${data.file_count} total file artifacts.`);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        addLog('WARN', `Workspace scan failed: ${errData.detail || res.statusText}`);
      }
    } catch (err: any) {
      addLog('WARN', `Workspace scan error: ${err.message}`);
    } finally {
      setIsScanningWorkspace(false);
    }
  };

  // Fetch and inspect single code file
  const handleInspectFile = async (filePath: string) => {
    const workspaceDir = execState.target_path || swarm.active_workspace || swarm.project_root || '.';
    setInspectedFile({
      path: filePath,
      content: '',
      sizeBytes: 0,
      lineCount: 0,
      language: 'plaintext',
      loading: true,
      error: null
    });
    setIsCodeDrawerMinimized(false);

    try {
      const res = await fetch(
        `/api/workspace/file?workspace_dir=${encodeURIComponent(workspaceDir)}&file_path=${encodeURIComponent(filePath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setInspectedFile({
          path: data.file_path || filePath,
          fullPath: data.full_path,
          content: data.content || '',
          sizeBytes: data.size_bytes || 0,
          lineCount: data.line_count || (data.content ? data.content.split('\n').length : 0),
          language: data.language || 'plaintext',
          lastModified: data.last_modified,
          loading: false,
          error: null
        });
        addLog('INFO', `Inspected file contents for [${filePath.split(/[\/\\]/).pop()}].`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setInspectedFile((prev) =>
          prev
            ? {
                ...prev,
                loading: false,
                error: errData.detail || `HTTP ${res.status}: ${res.statusText}`
              }
            : null
        );
        addLog('WARN', `Failed to read file ${filePath}: ${errData.detail || res.statusText}`);
      }
    } catch (err: any) {
      setInspectedFile((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error: err.message || 'Network error fetching file content.'
            }
          : null
      );
      addLog('WARN', `Error inspecting file ${filePath}: ${err.message}`);
    }
  };

  // Inspect target file from agent card / inspector drawer
  const handleInspectAgentTarget = (filePath: string) => {
    setActiveTab('files');
    handleInspectFile(filePath);
  };

  // Copy code to clipboard
  const handleCopyCode = async (text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyCodeSuccess(true);
      setTimeout(() => setCopyCodeSuccess(false), 2000);
    } catch (err) {
      console.error('Clipboard copy error:', err);
    }
  };

  // Combined File Entries for Tab 2
  interface UnifiedFileRow {
    path: string;
    status: 'COMPLETED' | 'LOCKED' | 'WORKSPACE';
    assignedWorker?: string;
    sizeBytes?: number;
    lastModified?: string;
  }

  const unifiedFiles = useMemo(() => {
    const list: UnifiedFileRow[] = [];
    const seenPaths = new Set<string>();

    // 1. Locked files first
    Object.entries(swarm.domain_locks || {}).forEach(([p, worker]) => {
      seenPaths.add(p);
      list.push({
        path: p,
        status: 'LOCKED',
        assignedWorker: worker
      });
    });

    // 2. Completed files
    (swarm.completed_files || []).forEach((p) => {
      if (!seenPaths.has(p)) {
        seenPaths.add(p);
        list.push({
          path: p,
          status: 'COMPLETED',
          assignedWorker: 'Swarm Engine'
        });
      }
    });

    // 3. Workspace Scanned Files
    scannedFiles.forEach((scanned) => {
      if (!seenPaths.has(scanned.rel_path)) {
        seenPaths.add(scanned.rel_path);
        list.push({
          path: scanned.rel_path,
          status: 'WORKSPACE',
          sizeBytes: scanned.size_bytes,
          lastModified: scanned.last_modified
        });
      }
    });

    // Filter by sub-category
    if (fileSubFilter === 'completed') {
      return list.filter((f) => f.status === 'COMPLETED');
    }
    if (fileSubFilter === 'locked') {
      return list.filter((f) => f.status === 'LOCKED');
    }
    if (fileSubFilter === 'workspace') {
      return list.filter((f) => f.status === 'WORKSPACE');
    }
    return list;
  }, [swarm.domain_locks, swarm.completed_files, scannedFiles, fileSubFilter]);

  // ==========================================
  // 5. LIVE MODEL QUOTAS (TAB 3)
  // ==========================================

  interface UnifiedModelCard {
    id: string;
    name: string;
    provider: 'GOOGLE' | 'GROQ' | 'OLLAMA';
    tier: 'FREE' | 'PAID' | 'LOCAL';
    node: ModelHierarchyNode;
    legacySnippet?: string;
  }

  const modelQuotaCards = useMemo(() => {
    const cards: UnifiedModelCard[] = [];

    if (hierarchy?.providers) {
      Object.entries(hierarchy.providers).forEach(([provKey, tiers]) => {
        const prov = provKey.toUpperCase() as 'GOOGLE' | 'GROQ' | 'OLLAMA';
        Object.entries(tiers).forEach(([tierKey, models]) => {
          const t = tierKey.toUpperCase() as 'FREE' | 'PAID' | 'LOCAL';
          Object.entries(models).forEach(([modelName, node]) => {
            cards.push({
              id: `${prov}-${t}-${modelName}`,
              name: modelName,
              provider: prov,
              tier: t,
              node,
              legacySnippet: legacyQuotas[modelName]?.snippet
            });
          });
        });
      });
    } else {
      // Fallback to legacy quotas
      Object.entries(MODEL_CATEGORIES).forEach(([modelName, cat]) => {
        const leg = legacyQuotas[modelName];
        const rpmMatch = leg?.snippet?.match(/RPM:\s*(\d+)\/(\d+)/);
        const tpmMatch = leg?.snippet?.match(/TPM:\s*([\d.]+)K?\/([\d.]+)K?/);
        const rpdMatch = leg?.snippet?.match(/RPD:\s*(\d+)\/(\d+)/);

        const rollingRpm = rpmMatch ? parseInt(rpmMatch[1], 10) : 0;
        const strictRpm = rpmMatch ? parseInt(rpmMatch[2], 10) : leg?.limits?.rpm || 10;
        const rollingTpm = tpmMatch ? parseFloat(tpmMatch[1]) * 1000 : 0;
        const strictTpm = tpmMatch ? parseFloat(tpmMatch[2]) * 1000 : leg?.limits?.tpm || 100000;
        const requestsToday = rpdMatch ? parseInt(rpdMatch[1], 10) : 0;
        const strictRpd = rpdMatch ? parseInt(rpdMatch[2], 10) : leg?.limits?.rpd || 1000;

        cards.push({
          id: `${cat.provider}-${cat.tier}-${modelName}`,
          name: modelName,
          provider: cat.provider,
          tier: cat.tier === 'LOCAL' ? 'LOCAL' : cat.tier === 'PRO' ? 'PAID' : 'FREE',
          node: {
            strict_limits: { rpm: strictRpm, tpm: strictTpm, rpd: strictRpd },
            working_limits: {
              rpm: Math.round(strictRpm * 0.85),
              tpm: Math.round(strictTpm * 0.85),
              rpd: Math.round(strictRpd * 0.85),
              max_input_tokens: 32768,
              max_output_tokens: 8192,
              thinking_budget: 2048
            },
            rolling_rpm: rollingRpm,
            rolling_tpm: rollingTpm,
            requests_today: requestsToday,
            in_flight_requests: 0,
            input_tokens_today: 0,
            output_tokens_today: 0,
            thinking_tokens_today: 0,
            total_tokens_today: 0
          },
          legacySnippet: leg?.snippet
        });
      });
    }

    // Apply Filters
    return cards.filter((c) => {
      if (providerFilter !== 'ALL' && c.provider !== providerFilter) {
        return false;
      }
      if (tierFilter !== 'ALL' && c.tier !== tierFilter) {
        return false;
      }
      return true;
    });
  }, [hierarchy, legacyQuotas, providerFilter, tierFilter]);

  // Toggle model expansion
  const toggleModelExpanded = (cardId: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  // Helper calculating progress bar percentages
  const getQuotaPercentages = (node: ModelHierarchyNode) => {
    const rpm = node.rolling_rpm || 0;
    const maxRpm = node.working_limits?.rpm || node.strict_limits?.rpm || 1;
    const rpmPct = Math.min(Math.round((rpm / Math.max(maxRpm, 1)) * 100), 100);

    const tpm = node.rolling_tpm || 0;
    const maxTpm = node.working_limits?.tpm || node.strict_limits?.tpm || 1;
    const tpmPct = Math.min(Math.round((tpm / Math.max(maxTpm, 1)) * 100), 100);

    const isFinancialShield = tpmPct >= 85;

    return { rpm, maxRpm, rpmPct, tpm, maxTpm, tpmPct, isFinancialShield };
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div id="swarm-monitor-page" className="space-y-6 pb-12">
      {/* ------------------------------------------------------------- */}
      {/* 1. COMPACT TOP CONTROL BAR & QUICK ACTIONS                     */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-teal-950/40 border border-emerald-500/20 p-4 sm:p-5 backdrop-blur shadow-2xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Status & Workspace Information */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live WS / Polling Connection Pill */}
            <span
              id="telemetry-connection-pill"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border transition-colors ${
                connectionMode === 'ws'
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-glow-emerald'
                  : connectionMode === 'http'
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              {connectionMode === 'ws' ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>WebSocket Live</span>
                </>
              ) : connectionMode === 'http' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>HTTP Polling</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                  <span>Connecting...</span>
                </>
              )}
            </span>

            {/* Build Status Pill */}
            <span
              id="swarm-build-status-pill"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border ${
                execState.status === 'RUNNING' || execState.is_running
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-glow-emerald animate-pulse'
                  : execState.status === 'PAUSED'
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500 shadow-glow-amber'
                  : execState.status === 'COMPLETED'
                  ? 'bg-blue-950/90 text-blue-300 border-blue-500'
                  : execState.status === 'CANCELLED' || execState.status === 'FAILED'
                  ? 'bg-rose-950/90 text-rose-300 border-rose-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>{execState.is_running ? 'RUNNING' : execState.status || 'IDLE'}</span>
            </span>

            {/* Active Project & Workspace Path Pill */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300 max-w-xs sm:max-w-md truncate"
              title={execState.target_path || swarm.active_workspace || swarm.project_root || 'Target pending'}
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-semibold text-white truncate">
                {execState.project_name || swarm.project_name || 'default_project'}
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400 truncate text-[11px]">
                {execState.target_path || swarm.active_workspace || 'Workspace Ready'}
              </span>
            </div>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Provider Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Provider:</span>
              <select
                id="provider-filter-select"
                aria-label="Provider Filter"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value as any)}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">ALL Providers</option>
                <option value="GOOGLE" className="bg-slate-900 text-slate-200">GOOGLE Cloud</option>
                <option value="GROQ" className="bg-slate-900 text-slate-200">GROQ LPU</option>
                <option value="OLLAMA" className="bg-slate-900 text-slate-200">OLLAMA Local</option>
              </select>
            </div>

            {/* Key Policy Quick Switcher Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Policy:</span>
              <select
                id="key-policy-select"
                aria-label="Key Routing Policy"
                value={keyPool.routing_policy || 'GLOBAL_HYBRID'}
                disabled={isUpdatingPolicy}
                onChange={(e) => handlePolicyChange(e.target.value as any)}
                className="bg-transparent text-indigo-300 font-bold focus:outline-none cursor-pointer text-xs disabled:opacity-50"
              >
                <option value="GLOBAL_HYBRID" className="bg-slate-900 text-slate-200">GLOBAL_HYBRID</option>
                <option value="FREE_POOL" className="bg-slate-900 text-slate-200">FREE_POOL Only</option>
                <option value="PAID_POOL" className="bg-slate-900 text-slate-200">PAID_POOL Only</option>
                <option value="SINGLE_PINNED" className="bg-slate-900 text-slate-200">SINGLE_PINNED</option>
              </select>
            </div>

            {/* Lifecycle: Pause / Resume Button */}
            <button
              id="pause-resume-btn"
              onClick={handleTogglePause}
              disabled={isLifecycleBusy || (!execState.is_running && execState.status !== 'PAUSED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                execState.status === 'PAUSED'
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500 hover:bg-emerald-600/30'
                  : 'bg-amber-600/20 text-amber-300 border-amber-500 hover:bg-amber-600/30'
              }`}
              title={execState.status === 'PAUSED' ? 'Resume execution cycle' : 'Pause active execution'}
            >
              {execState.status === 'PAUSED' ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </>
              )}
            </button>

            {/* Lifecycle: Stop Button */}
            <button
              id="stop-build-btn"
              onClick={handleStopBuild}
              disabled={isLifecycleBusy || !execState.is_running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500 hover:bg-rose-600/30 text-xs font-mono font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Halt running build immediately"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>

            {/* Jump to Global Execution Logs Button */}
            <button
              id="nav-global-logs-btn"
              onClick={() => navigate('/logs')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono transition-colors shadow-sm"
              title="Jump to full-screen execution logs stream"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Execution Logs</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. 3-TAB VIEW SWITCHER BAR                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          id="tab-agents-btn"
          onClick={() => setActiveTab('agents')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'agents'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>Active Agents & Tasks</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-emerald-300 border border-emerald-500/30">
            {Object.keys(swarm.domain_locks || {}).length} Locked
          </span>
        </button>

        <button
          id="tab-files-btn"
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'files'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <FileText className="w-4 h-4 text-blue-400" />
          <span>Generated Files & Code</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-blue-300 border border-blue-500/30">
            {swarm.completed_files?.length || 0} Files
          </span>
        </button>

        <button
          id="tab-quotas-btn"
          onClick={() => setActiveTab('quotas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'quotas'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          <span>Live Model Quotas</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-purple-300 border border-purple-500/30">
            {modelQuotaCards.length} Models
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TAB 1: ACTIVE AGENTS & TASKS                               */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'agents' && (
        <div id="tab-agents-content" className="space-y-5">
          {/* Section Sub-header & Worker Filter Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-white tracking-tight">
                Cooperative Workforce Matrix ({visibleWorkerSlots.length} Displayed)
              </span>
              <span className="text-xs text-slate-400 font-mono hidden md:inline">
                &bull; Click any agent to inspect lock, model routing & code target
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="toggle-worker-display-btn"
                onClick={() => setWorkerDisplayFilter((prev) => (prev === 'all' ? 'active' : 'all'))}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                  workerDisplayFilter === 'active'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500 shadow-glow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {workerDisplayFilter === 'active' ? 'Active Only' : 'Show All Workers'}
              </button>
            </div>
          </div>

          {/* Minimizable / Closable Agent Detail Inspector Banner */}
          {selectedWorker && (
            <div
              id="agent-inspector-banner"
              className="glass-panel p-4 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-slate-900/95 via-emerald-950/20 to-slate-900/95 shadow-xl space-y-3 transition-all"
            >
              {(() => {
                const { status, badge, lockedFile } = getWorkerStatusInfo(selectedWorker.role);
                const routingTag = getAgentRoutingBadge(selectedWorker);

                return (
                  <>
                    <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white tracking-tight">
                              {selectedWorker.displayName}
                            </h3>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badge}`}>
                              {status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono">
                            Assigned Engine: <span className="text-emerald-400">{selectedWorker.engine}</span> ({selectedWorker.provider})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setIsAgentDrawerMinimized(!isAgentDrawerMinimized)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1"
                          title={isAgentDrawerMinimized ? 'Expand inspector' : 'Minimize inspector'}
                        >
                          {isAgentDrawerMinimized ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                          <span className="hidden sm:inline">{isAgentDrawerMinimized ? 'Expand' : 'Minimize'}</span>
                        </button>
                        <button
                          onClick={() => setSelectedAgentId(null)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                          title="Close inspector"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {!isAgentDrawerMinimized && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                        {/* Scope & Task Description */}
                        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Scope Directive</span>
                          <p className="text-slate-200 text-[11px] leading-relaxed">
                            {selectedWorker.taskDescription}
                          </p>
                        </div>

                        {/* Routing & Provider Info */}
                        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Routing & Key Matrix</span>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Channel:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${routingTag.color}`}>
                              {routingTag.text}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-400 text-[11px]">
                            <span>Tier Category:</span>
                            <span className="text-slate-200">{selectedWorker.tierCategory}</span>
                          </div>
                        </div>

                        {/* File Lock & Actions */}
                        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Active Domain Lock</span>
                          <div className="text-[11px] text-slate-300 truncate font-mono" title={lockedFile || 'None'}>
                            {lockedFile ? (
                              <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                {lockedFile.split(/[\/\\]/).pop()}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">No exclusive lock currently held.</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            {lockedFile && (
                              <button
                                onClick={() => handleInspectAgentTarget(lockedFile)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Inspect Code</span>
                              </button>
                            )}

                            <button
                              onClick={() => navigate('/logs')}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] transition-colors"
                            >
                              <Terminal className="w-3 h-3 text-blue-400" />
                              <span>View Logs</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Minimalist Workforce Grid (Each Card Shows Exactly 4 Key Items) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {visibleWorkerSlots.map((worker) => {
              const { status, badge, lockedFile } = getWorkerStatusInfo(worker.role);
              const isSelected = selectedAgentId === worker.id;

              return (
                <div
                  key={worker.id}
                  id={worker.id}
                  onClick={() => setSelectedAgentId(isSelected ? null : worker.id)}
                  className={`glass-panel p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/20 shadow-glow-emerald ring-1 ring-emerald-500/40'
                      : 'border-slate-800 hover:border-emerald-500/40 hover:bg-slate-900/60'
                  }`}
                >
                  {/* Item 1: Agent ID & Role */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-6 h-6 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                        <Cpu className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-xs text-white truncate" title={worker.displayName}>
                        {worker.role} &bull; <span className="text-slate-400 font-normal">{worker.displayName.replace(/SubAgent-\d+\s*/, '').replace(/[()]/g, '') || 'Worker'}</span>
                      </span>
                    </div>

                    {/* Item 3: Status Badge */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${badge}`}>
                      {status === 'WORKING' ? '🟢 WORKING' : status === 'PAUSED' ? '⏸️ PAUSED' : '⚪ STANDBY'}
                    </span>
                  </div>

                  {/* Item 2: Model & Provider Pill */}
                  <div className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded bg-slate-950/70 border border-slate-800/80">
                    <span className="text-slate-300 truncate font-semibold" title={worker.engine}>
                      {worker.engine}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        worker.provider === 'OLLAMA'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : worker.provider === 'GROQ'
                          ? 'bg-orange-950 text-orange-300 border border-orange-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {worker.provider}
                    </span>
                  </div>

                  {/* Item 4: Target File Pill */}
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded bg-slate-950/90 border border-slate-800/90 truncate"
                    title={lockedFile || 'Idle — Ready for lock'}
                  >
                    <Lock className={`w-3 h-3 shrink-0 ${lockedFile ? 'text-amber-400' : 'text-slate-600'}`} />
                    <span className={lockedFile ? 'text-amber-300 font-semibold truncate' : 'text-slate-500 italic truncate'}>
                      {lockedFile ? lockedFile.split(/[\/\\]/).pop() : 'Idle — Ready for lock'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Minimizable Live Execution Trace Bar (Bottom of Tab 1) */}
          <div className="pt-2">
            {!isTraceExpanded ? (
              /* Compact 1-Line Summary Bar */
              <div
                id="compact-trace-bar"
                className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-950/90 border border-slate-800 font-mono text-xs shadow-inner"
              >
                <div className="flex items-center gap-2.5 truncate max-w-xl sm:max-w-3xl">
                  <Terminal className="w-4 h-4 text-blue-400 shrink-0" />
                  {logs.length > 0 && (
                    <>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          logs[logs.length - 1].type === 'WRITE'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : logs[logs.length - 1].type === 'LOCK'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : logs[logs.length - 1].type === 'WARN'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-blue-950 text-blue-400 border border-blue-800'
                        }`}
                      >
                        {logs[logs.length - 1].type}
                      </span>
                      <span className="text-slate-500 text-[11px] shrink-0">
                        [{logs[logs.length - 1].timestamp}]
                      </span>
                      <span className="text-slate-300 truncate">
                        {logs[logs.length - 1].message}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-500 text-[11px] hidden md:inline">
                    {logs.length} events logged
                  </span>
                  <button
                    id="expand-trace-btn"
                    onClick={() => setIsTraceExpanded(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                  >
                    <span>Expand Trace</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => navigate('/logs')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/40 text-xs transition-colors"
                    title="Open full-screen global execution logs"
                  >
                    <span>/logs</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              /* Expanded Terminal Strip */
              <div id="expanded-trace-panel" className="space-y-2 rounded-xl bg-slate-950 border border-slate-800 p-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white font-mono">
                    <Terminal className="w-4 h-4 text-blue-400" />
                    <span>Real-Time Execution Console Stream ({logs.length} events)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAutoScroll(!autoScroll)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors flex items-center gap-1.5 border ${
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
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-mono transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>

                    <button
                      onClick={() => setIsTraceExpanded(false)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
                    >
                      <span>Minimize Trace</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => navigate('/logs')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/40 text-xs font-mono transition-colors"
                    >
                      <span>Global Logs</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div
                  id="execution-console-stream"
                  className="h-56 rounded-lg bg-black/80 border border-slate-900 p-3 font-mono text-xs overflow-y-auto space-y-1 shadow-inner"
                >
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-600 select-none shrink-0 text-[11px]">[{log.timestamp}]</span>
                      <span
                        className={`px-1 rounded text-[9px] font-bold select-none shrink-0 ${
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
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. TAB 2: GENERATED FILES & CODE INSPECTOR                    */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'files' && (
        <div id="tab-files-content" className="space-y-4">
          {/* Sub-Filters & Workspace Scanner Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFileSubFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors border ${
                  fileSubFilter === 'all'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-sm'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                All Files ({unifiedFiles.length})
              </button>

              <button
                onClick={() => setFileSubFilter('completed')}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors border ${
                  fileSubFilter === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-glow-sm'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                ✅ Completed ({swarm.completed_files?.length || 0})
              </button>

              <button
                onClick={() => setFileSubFilter('locked')}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors border ${
                  fileSubFilter === 'locked'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-glow-amber'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                🔒 Locked ({Object.keys(swarm.domain_locks || {}).length})
              </button>

              <button
                onClick={() => setFileSubFilter('workspace')}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors border ${
                  fileSubFilter === 'workspace'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-glow-sm'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                📁 Workspace Scan ({scannedFiles.length})
              </button>
            </div>

            <button
              id="scan-workspace-btn"
              onClick={handleScanWorkspace}
              disabled={isScanningWorkspace}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 text-xs font-mono font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningWorkspace ? 'animate-spin' : ''}`} />
              <span>{isScanningWorkspace ? 'Scanning Workspace...' : 'Scan Full Workspace'}</span>
            </button>
          </div>

          {/* Minimizable / Collapsible Code Inspector Drawer */}
          {inspectedFile && (
            <div
              id="code-inspector-drawer"
              className="glass-panel rounded-xl border border-blue-500/40 bg-slate-950 shadow-2xl overflow-hidden transition-all"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 font-mono text-xs">
                <div className="flex items-center gap-2 truncate max-w-lg">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="font-bold text-white truncate" title={inspectedFile.path}>
                    {inspectedFile.path}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-blue-950 text-blue-300 border border-blue-800">
                    {inspectedFile.language}
                  </span>
                  <span className="text-slate-400 text-[11px] hidden sm:inline">
                    {inspectedFile.lineCount} lines &bull; {(inspectedFile.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCode(inspectedFile.content)}
                    disabled={inspectedFile.loading || !inspectedFile.content}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors disabled:opacity-40"
                    title="Copy source code to clipboard"
                  >
                    {copyCodeSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copyCodeSuccess ? 'Copied!' : 'Copy Code'}</span>
                  </button>

                  <button
                    onClick={() => setIsCodeDrawerMinimized(!isCodeDrawerMinimized)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                    title={isCodeDrawerMinimized ? 'Expand Code View' : 'Minimize Code View'}
                  >
                    {isCodeDrawerMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => setInspectedFile(null)}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                    title="Close Inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              {!isCodeDrawerMinimized && (
                <div className="p-0 max-h-96 overflow-auto font-mono text-xs bg-slate-950">
                  {inspectedFile.loading ? (
                    <div className="p-8 flex items-center justify-center gap-2 text-slate-400">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                      <span>Reading file from active workspace securely...</span>
                    </div>
                  ) : inspectedFile.error ? (
                    <div className="p-4 m-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                      <div className="font-bold flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Inspection Blocked / Error</span>
                      </div>
                      <p>{inspectedFile.error}</p>
                    </div>
                  ) : (
                    <div className="flex text-slate-300">
                      {/* Line Number Gutter */}
                      <div className="select-none text-right pr-3 pl-3 py-3 text-slate-600 bg-slate-900/60 border-r border-slate-800 text-[11px] leading-5">
                        {inspectedFile.content.split('\n').map((_, idx) => (
                          <div key={idx}>{idx + 1}</div>
                        ))}
                      </div>
                      {/* Code Content */}
                      <pre className="p-3 overflow-x-auto text-[11px] leading-5 text-slate-200 font-mono w-full">
                        <code>{inspectedFile.content}</code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Files List Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden shadow-inner">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-6 sm:col-span-6">File Path</div>
              <div className="col-span-3 sm:col-span-2">Status</div>
              <div className="col-span-3 sm:col-span-2 hidden sm:block">Assigned Worker</div>
              <div className="col-span-3 sm:col-span-2 text-right">Action</div>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
              {unifiedFiles.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-mono text-xs">
                  No files match current filter criteria. Run "Scan Full Workspace" to inspect existing disk files.
                </div>
              ) : (
                unifiedFiles.map((row) => (
                  <div
                    key={row.path}
                    className="grid grid-cols-12 items-center px-4 py-2 hover:bg-slate-900/50 transition-colors font-mono text-xs"
                  >
                    <div className="col-span-6 sm:col-span-6 truncate pr-2" title={row.path}>
                      <span className="font-semibold text-white">
                        {row.path.split(/[\/\\]/).pop()}
                      </span>
                      <span className="text-slate-500 text-[11px] pl-2 hidden md:inline">
                        {row.path}
                      </span>
                    </div>

                    <div className="col-span-3 sm:col-span-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          row.status === 'COMPLETED'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600'
                            : row.status === 'LOCKED'
                            ? 'bg-amber-950/80 text-amber-400 border-amber-600'
                            : 'bg-blue-950/80 text-blue-400 border-blue-600'
                        }`}
                      >
                        {row.status === 'COMPLETED' ? (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        ) : row.status === 'LOCKED' ? (
                          <Lock className="w-2.5 h-2.5" />
                        ) : (
                          <FolderOpen className="w-2.5 h-2.5" />
                        )}
                        <span>{row.status}</span>
                      </span>
                    </div>

                    <div className="col-span-3 sm:col-span-2 hidden sm:block truncate text-slate-400 text-[11px]">
                      {row.assignedWorker || '—'}
                    </div>

                    <div className="col-span-3 sm:col-span-2 text-right">
                      <button
                        onClick={() => handleInspectFile(row.path)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/40 text-xs transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View Code</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. TAB 3: LIVE MODEL QUOTAS & GOVERNOR GAUGES                 */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'quotas' && (
        <div id="tab-quotas-content" className="space-y-4">
          {/* Header & Secondary Tier Filter Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-white tracking-tight">
                Live Engine Token Quotas & 85% Financial Shield ({modelQuotaCards.length} Models)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 text-xs font-mono pr-1">Tier:</span>
              {(['ALL', 'FREE', 'PAID', 'LOCAL'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors border ${
                    tierFilter === t
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-glow-sm'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}

              <button
                onClick={() => navigate('/governor')}
                className="flex items-center gap-1 ml-2 px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 text-xs font-mono hover:bg-indigo-600/30 transition-colors"
                title="Configure working limits in Token Governor"
              >
                <Sliders className="w-3 h-3" />
                <span>/governor</span>
              </button>
            </div>
          </div>

          {/* Model Cards Grid (Default Collapsed) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modelQuotaCards.map((card) => {
              const { rpm, maxRpm, rpmPct, tpm, maxTpm, tpmPct, isFinancialShield } = getQuotaPercentages(card.node);
              const isExpanded = expandedModels.has(card.id);

              return (
                <div
                  key={card.id}
                  id={`model-card-${card.name}`}
                  className={`glass-panel p-4 rounded-xl border transition-all space-y-3 ${
                    isFinancialShield
                      ? 'border-amber-500/60 bg-amber-950/20 shadow-glow-amber'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header: Name, Provider/Tier Badge, Financial Shield Pill */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <h4 className="font-mono text-xs font-bold text-white truncate" title={card.name}>
                        {card.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isFinancialShield && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <ShieldAlert className="w-2.5 h-2.5" /> 85% CAP
                        </span>
                      )}

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          card.provider === 'OLLAMA'
                            ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                            : card.provider === 'GROQ'
                            ? 'bg-orange-950/80 text-orange-300 border-orange-800'
                            : card.tier === 'PAID'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-blue-950/80 text-blue-300 border-blue-800'
                        }`}
                      >
                        {card.provider} &bull; {card.tier}
                      </span>
                    </div>
                  </div>

                  {/* 60s RPM & TPM Progress Bars */}
                  <div className="space-y-2 text-[11px] font-mono">
                    {/* RPM Bar */}
                    <div>
                      <div className="flex justify-between text-slate-400 text-[10px] mb-0.5">
                        <span>RPM: {rpm} / {maxRpm}</span>
                        <span>{rpmPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${rpmPct}%` }}
                        />
                      </div>
                    </div>

                    {/* TPM Bar (with 85% Shield Color) */}
                    <div>
                      <div className="flex justify-between text-slate-400 text-[10px] mb-0.5">
                        <span className={isFinancialShield ? 'text-amber-400 font-semibold' : ''}>
                          TPM: {(tpm / 1000).toFixed(1)}K / {(maxTpm / 1000).toFixed(0)}K
                        </span>
                        <span className={isFinancialShield ? 'text-amber-400 font-bold' : ''}>
                          {tpmPct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isFinancialShield ? 'bg-amber-400' : 'bg-purple-500'
                          }`}
                          style={{ width: `${tpmPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* In-Flight Leases Pill & Expand Toggle */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] font-mono">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>Leases: <strong className="text-slate-200">{card.node.in_flight_requests || 0}</strong> active</span>
                    </span>

                    <button
                      onClick={() => toggleModelExpanded(card.id)}
                      className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                    >
                      <span className="text-[10px]">{isExpanded ? 'Less' : 'Details'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded Breakdown */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-800 space-y-2.5 font-mono text-[11px]">
                      {/* Discrete Token Breakdown Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                          <span className="text-slate-500 block">Input Tokens</span>
                          <span className="font-bold text-slate-200">
                            {(card.node.input_tokens_today || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                          <span className="text-slate-500 block">Output Tokens</span>
                          <span className="font-bold text-slate-200">
                            {(card.node.output_tokens_today || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                          <span className="text-slate-500 block">Thinking Tokens</span>
                          <span className="font-bold text-slate-200">
                            {(card.node.thinking_tokens_today || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                          <span className="text-slate-500 block">Requests Today</span>
                          <span className="font-bold text-slate-200">
                            {card.node.requests_today || 0} / {card.node.strict_limits?.rpd || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Working vs Strict Limits Table */}
                      <div className="rounded bg-slate-950/90 border border-slate-800 p-2 text-[10px] space-y-1">
                        <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1 font-bold">
                          <span>Metric</span>
                          <span>Working Limit</span>
                          <span>Strict Limit</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>RPM</span>
                          <span>{card.node.working_limits?.rpm ?? '—'}</span>
                          <span className="text-slate-500">{card.node.strict_limits?.rpm ?? '—'}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>TPM</span>
                          <span>{((card.node.working_limits?.tpm || 0) / 1000).toFixed(0)}K</span>
                          <span className="text-slate-500">{((card.node.strict_limits?.tpm || 0) / 1000).toFixed(0)}K</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Max Input</span>
                          <span>{(card.node.working_limits?.max_input_tokens || 0).toLocaleString()}</span>
                          <span className="text-slate-500">{(card.node.strict_limits?.max_input_tokens || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Max Output</span>
                          <span>{(card.node.working_limits?.max_output_tokens || 0).toLocaleString()}</span>
                          <span className="text-slate-500">{(card.node.strict_limits?.max_output_tokens || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Thinking Budget</span>
                          <span className="text-purple-400">{(card.node.working_limits?.thinking_budget || 0).toLocaleString()}</span>
                          <span className="text-slate-500">—</span>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate('/governor')}
                        className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Configure in Governor (/governor)</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SwarmMonitor;
