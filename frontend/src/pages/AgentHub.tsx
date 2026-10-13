import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bot,
  Cpu,
  Database,
  Wrench,
  Sparkles,
  ShieldCheck,
  Activity,
  Search,
  Zap,
  Check,
  ExternalLink,
  Layers,
  Sliders,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  Server,
  Flame,
  ArrowUpRight,
  Code,
  Terminal,
  Copy,
  Gauge,
  Clock,
  Filter,
  CheckCircle
} from 'lucide-react';

interface SafetyTier {
  tier: string;
  badge: string;
  description: string;
}

interface ModelProfile {
  id: string;
  name: string;
  provider: 'OLLAMA_LOCAL' | 'GOOGLE_GEMINI' | string;
  size_gb: number;
  safety: SafetyTier;
  primary_track: string;
  supported_tracks: string[];
  empirical_scores: Record<string, string | number>;
  tps_average: number;
  active_params: number | string;
  capabilities?: string[];
  description?: string;
}

interface BestInClassEntry {
  primary: string;
  fallback: string;
  title?: string;
}

interface BridgeStatus {
  status: string;
  is_connected: boolean;
  root_path: string | null;
  is_ollama_online: boolean;
  ollama_api_base: string;
}

// Built-in resilient fallback catalog matching empirical benchmarks
const DEFAULT_MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'codestral:22b',
    name: 'codestral:22b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 12.2,
    safety: {
      tier: 'PAGED_HYBRID',
      badge: '🟡 Hybrid CPU/GPU Paged',
      description: 'Requires partial CPU/RAM offloading. Moderate paging latency.'
    },
    primary_track: 'AGENTIC_CODE_FIM',
    supported_tracks: ['AGENTIC_CODE_FIM', 'GENERAL_CODE', 'REFACTORING'],
    empirical_scores: { 'Code FIM': '9.8/10', 'Refactor': '9.6/10', 'Tools': '9.2/10' },
    tps_average: 38.4,
    active_params: '22B',
    capabilities: ['Fill-In-Middle', 'Autonomous Patching', 'AST Refactoring'],
    description: 'Empirical #1 Local Code Generation engine with native fill-in-the-middle syntax.'
  },
  {
    id: 'qwen2.5-coder:32b',
    name: 'qwen2.5-coder:32b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 19.8,
    safety: {
      tier: 'OOM_HAZARDOUS',
      badge: '🔴 OOM Hazard',
      description: 'High probability of CUDA Out-Of-Memory on 8GB VRAM without CPU paging.'
    },
    primary_track: 'SYSTEM_ARCHITECT',
    supported_tracks: ['SYSTEM_ARCHITECT', 'AGENTIC_CODE_FIM', 'DEEP_PLANNING'],
    empirical_scores: { 'Architecture': '10/10', 'Code': '9.6/10', 'Planning': '9.5/10' },
    tps_average: 24.1,
    active_params: '32B',
    capabilities: ['System Architecture', 'Multi-file Refactoring', 'Coherent Planning'],
    description: 'Heavyweight local planning engine. Outstanding architectural coherence and complex reasoning.'
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'qwen2.5-coder:7b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.7,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Fits entirely within 8GB VRAM with zero paging overhead.'
    },
    primary_track: 'BALANCED_WORKER',
    supported_tracks: ['AGENTIC_CODE_FIM', 'GENERAL_CODE', 'UNIT_TESTS'],
    empirical_scores: { 'Code': '8.9/10', 'Throughput': '9.5/10', 'Tool Call': '8.8/10' },
    tps_average: 68.2,
    active_params: '7B',
    capabilities: ['High TPS Worker', 'Fast Scaffolding', 'Unit Test Generation'],
    description: 'Primary local swarm worker. Fits entirely within RTX 4060 8GB VRAM with zero paging penalty.'
  },
  {
    id: 'sqlcoder:7b',
    name: 'sqlcoder:7b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.8,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Fits entirely within 8GB VRAM with zero paging overhead.'
    },
    primary_track: 'SQL_DATABASE',
    supported_tracks: ['SQL_DATABASE', 'SCHEMA_ANALYSIS', 'ANALYTICS'],
    empirical_scores: { 'Text-to-SQL': '10/10', 'Schema Join': '9.8/10', 'Aggregations': '9.6/10' },
    tps_average: 62.5,
    active_params: '7B',
    capabilities: ['Text-to-SQL', 'Schema Introspection', 'Complex Joins'],
    description: 'Domain-tuned SQL champion. Outperforms general 70B models on multi-table schema join tasks.'
  },
  {
    id: 'llama3-groq-tool-use:8b',
    name: 'llama3-groq-tool-use:8b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.9,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Fits entirely within 8GB VRAM with zero paging overhead.'
    },
    primary_track: 'TOOL_CALLING',
    supported_tracks: ['TOOL_CALLING', 'JSON_STRICT', 'AGENT_DISPATCH'],
    empirical_scores: { 'Tool Calling': '10/10', 'JSON Strict': '9.9/10', 'Schema Conform': '9.7/10' },
    tps_average: 58.7,
    active_params: '8B',
    capabilities: ['Strict JSON Schemas', 'Function Calling', 'Zero Hallucinations'],
    description: 'Trained exclusively on Groq-style tool schemas. Eliminates JSON hallucination and syntax errors.'
  },
  {
    id: 'deepseek-r1:8b',
    name: 'deepseek-r1:8b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.9,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Fits entirely within 8GB VRAM with zero paging overhead.'
    },
    primary_track: 'COT_REASONING',
    supported_tracks: ['COT_REASONING', 'DEBUGGING', 'ALGORITHMS'],
    empirical_scores: { 'CoT Reasoning': '10/10', 'Root Cause': '9.8/10', 'Proof Steps': '9.7/10' },
    tps_average: 54.3,
    active_params: '8B',
    capabilities: ['Chain-of-Thought', 'Root Cause Analysis', 'Algorithmic Proofs'],
    description: 'Empirical local reasoning champion. Excels at complex debugging and stepwise logic chains.'
  },
  {
    id: 'qwen2.5-coder:1.5b',
    name: 'qwen2.5-coder:1.5b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 1.2,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Fits entirely within 8GB VRAM with zero paging overhead.'
    },
    primary_track: 'FAST_BOILERPLATE',
    supported_tracks: ['FAST_BOILERPLATE', 'DOCSTRINGS', 'TYPES'],
    empirical_scores: { 'Speed': '10/10', 'Syntax': '8.7/10', 'Scaffolding': '9.1/10' },
    tps_average: 142.0,
    active_params: '1.5B',
    capabilities: ['140+ TPS', 'Rapid Scaffolding', 'Type Hints & Docs'],
    description: 'Ultra-fast local model for real-time autocomplete, scaffolding, and docstrings.'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'gemini-2.5-pro',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: 'Zero local VRAM footprint. Bounded by Google AI Studio API rate quotas.'
    },
    primary_track: 'DEEP_REASONING_PRO',
    supported_tracks: ['ARCHITECTURE', 'DEEP_REASONING', 'LONG_CONTEXT'],
    empirical_scores: { 'Deep Reasoning': '10/10', '1M Context': '10/10', 'Architecture': '9.9/10' },
    tps_average: 42.0,
    active_params: 'Pro Tier',
    capabilities: ['1M Context Window', 'Full Repo Ingestion', 'Exhaustive Review'],
    description: 'Flagship Google Pro reasoning engine. Handles entire repository context windows.'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'gemini-2.5-flash',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: 'Zero local VRAM footprint. Bounded by Google AI Studio API rate quotas.'
    },
    primary_track: 'HIGH_RPM_GENERAL',
    supported_tracks: ['PARALLEL_WORKER', 'AGENTIC_CODE', 'SEARCH_GROUNDING'],
    empirical_scores: { 'Throughput': '9.9/10', 'Agentic Code': '9.4/10', 'Tool Calling': '9.5/10' },
    tps_average: 110.0,
    active_params: 'Flash Tier',
    capabilities: ['4,000 RPM Capable', 'Search Grounding', 'Parallel Swarms'],
    description: 'Highest throughput cloud model. Ideal for high-concurrency swarm task distribution.'
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'gemini-2.0-flash-lite',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: 'Zero local VRAM footprint. Bounded by Google AI Studio API rate quotas.'
    },
    primary_track: 'LIGHTWEIGHT_CLOUD',
    supported_tracks: ['MICRO_TASKS', 'SUMMARIZATION', 'HIGH_CONCURRENCY'],
    empirical_scores: { 'Latency': '10/10', 'Efficiency': '9.8/10', 'Summaries': '9.2/10' },
    tps_average: 135.0,
    active_params: 'Lite Tier',
    capabilities: ['Sub-second Latency', 'Quick Summaries', 'High Free Quota'],
    description: 'Budget and free-tier optimized worker. Minimal latency for small utility transforms.'
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'gemini-3.1-pro-preview',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: 'Zero local VRAM footprint. Bounded by Google AI Studio API rate quotas.'
    },
    primary_track: 'NEXTGEN_REASONING',
    supported_tracks: ['FRONTIER_REASONING', 'SYNTHESIS', 'COMPLEX_ALGORITHMS'],
    empirical_scores: { 'Frontier Logic': '10/10', 'Synthesis': '9.9/10', 'Benchmark': '9.8/10' },
    tps_average: 36.0,
    active_params: 'Preview Tier',
    capabilities: ['Next-Gen Reasoning', 'Deep Synthesis', 'Frontier Logic'],
    description: 'Next-generation preview model for hardest algorithmic and architectural challenges.'
  }
];

const DEFAULT_BEST_IN_CLASS: Record<string, BestInClassEntry> = {
  AGENTIC_CODE_FIM: {
    primary: 'codestral:22b',
    fallback: 'qwen2.5-coder:7b',
    title: 'Agentic Code (FIM)'
  },
  SQL_DATABASE: {
    primary: 'sqlcoder:7b',
    fallback: 'qwen2.5-coder:7b',
    title: 'SQL Analytics & Schema'
  },
  TOOL_CALLING: {
    primary: 'llama3-groq-tool-use:8b',
    fallback: 'hermes3:8b',
    title: 'Strict Tool Calling'
  },
  COT_REASONING: {
    primary: 'deepseek-r1:8b',
    fallback: 'qwen2.5-coder:7b',
    title: 'CoT Reasoning & Logic'
  },
  FAST_BOILERPLATE: {
    primary: 'qwen2.5-coder:1.5b',
    fallback: 'tinyllama:1.1b',
    title: 'Fast Boilerplate'
  }
};

export const AgentHub: React.FC = () => {
  // Tab Management
  const [activeTab, setActiveTab] = useState<'matrix' | 'vram' | 'swarms'>('matrix');

  // Data States
  const [models, setModels] = useState<ModelProfile[]>(DEFAULT_MODEL_PROFILES);
  const [bestInClass, setBestInClass] = useState<Record<string, BestInClassEntry>>(DEFAULT_BEST_IN_CLASS);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  // Filters & Search
  const [providerFilter, setProviderFilter] = useState<'ALL' | 'GOOGLE_GEMINI' | 'OLLAMA_LOCAL'>('ALL');
  const [safetyFilter, setSafetyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchBridgeData = useCallback(async () => {
    try {
      // 1. Fetch Bridge Status
      const statusRes = await fetch('/api/bridge/status');
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setBridgeStatus(sData);
      }

      // 2. Fetch Bridge Models & Matrices
      const modelsRes = await fetch('/api/bridge/models');
      if (modelsRes.ok) {
        const mData = await modelsRes.json();
        if (mData.models && Array.isArray(mData.models) && mData.models.length > 0) {
          // Merge incoming models with catalog descriptions & capabilities
          const merged = mData.models.map((m: any) => {
            const fallbackMatch = DEFAULT_MODEL_PROFILES.find((d) => d.id === m.id || d.name === m.name);
            return {
              ...m,
              capabilities: m.capabilities || fallbackMatch?.capabilities || ['General Intelligence'],
              description: m.description || fallbackMatch?.description || `${m.name} active profile.`
            };
          });
          setModels(merged);
        }
        if (mData.best_in_class && typeof mData.best_in_class === 'object') {
          const bic: Record<string, BestInClassEntry> = {};
          Object.entries(mData.best_in_class).forEach(([k, v]: [string, any]) => {
            bic[k] = {
              primary: v.primary || 'unknown',
              fallback: v.fallback || 'none',
              title: DEFAULT_BEST_IN_CLASS[k]?.title || k.replace(/_/g, ' ')
            };
          });
          setBestInClass(bic);
        }
      }
    } catch (err) {
      console.warn('Bridge API fetch error, using resilient fallbacks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBridgeData();
  }, [fetchBridgeData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchBridgeData();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedModelId(id);
    setTimeout(() => setCopiedModelId(null), 2000);
  };

  // Filtered Model Roster
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      // Provider filter
      if (providerFilter === 'GOOGLE_GEMINI' && m.provider !== 'GOOGLE_GEMINI') return false;
      if (providerFilter === 'OLLAMA_LOCAL' && m.provider !== 'OLLAMA_LOCAL') return false;

      // Safety filter
      if (safetyFilter !== 'ALL') {
        if (safetyFilter === 'SAFE_GPU' && m.safety?.tier !== 'SAFE_GPU') return false;
        if (safetyFilter === 'PAGED_HYBRID' && m.safety?.tier !== 'PAGED_HYBRID') return false;
        if (safetyFilter === 'OOM_HAZARDOUS' && m.safety?.tier !== 'OOM_HAZARDOUS') return false;
        if (safetyFilter === 'CLOUD_UNMETERED' && m.safety?.tier !== 'CLOUD_UNMETERED') return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
        const matchesTrack = m.primary_track.toLowerCase().includes(query);
        const matchesCaps = m.capabilities?.some((c) => c.toLowerCase().includes(query));
        const matchesParams = String(m.active_params).toLowerCase().includes(query);
        if (!matchesName && !matchesTrack && !matchesCaps && !matchesParams) return false;
      }

      return true;
    });
  }, [models, providerFilter, safetyFilter, searchQuery]);

  // Counts for pills
  const totalCount = models.length;
  const cloudCount = models.filter((m) => m.provider === 'GOOGLE_GEMINI').length;
  const localCount = models.filter((m) => m.provider === 'OLLAMA_LOCAL').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER & TESTING BRIDGE STATUS                                */}
      {/* ==================================================================== */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Agent & Model Intelligence Hub
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Matrix v6.0
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Empirical capability benchmarks, RTX 4060 VRAM arbitrations, and dynamic swarm rosters.
              </p>
            </div>
          </div>
        </div>

        {/* Right Status Pill & Refresh */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {bridgeStatus?.is_connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-glow-emerald" />
              <span>🟢 Connected to Testing Suite</span>
              {bridgeStatus.root_path && (
                <span className="hidden xl:inline text-[11px] text-emerald-300/70 border-l border-emerald-500/30 pl-2">
                  {bridgeStatus.root_path.split('/').pop()}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>🟡 Standalone Mode (Active Fallbacks)</span>
            </div>
          )}

          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all"
            title="Refresh Matrices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. 3-TAB SWITCHER ARCHITECTURE                                       */}
      {/* ==================================================================== */}
      <nav className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'matrix'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>📊 Model Capability Matrix & Scores</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-black/30 ml-1">
            {models.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('vram')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'vram'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>⚡ VRAM Arbitrator & Local Models</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
            Stage 10.2
          </span>
        </button>

        <button
          onClick={() => setActiveTab('swarms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'swarms'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span>🛠️ Swarm Rosters & Role Builder</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
            Stage 10.2
          </span>
        </button>
      </nav>

      {/* ==================================================================== */}
      {/* TAB 1: MODEL CAPABILITY MATRIX & EMPIRICAL SCORES                    */}
      {/* ==================================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* ---------------------------------------------------------------- */}
          {/* BEST-IN-CLASS EMPIRICAL CHAMPIONS BANNER                         */}
          {/* ---------------------------------------------------------------- */}
          <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
                <h2 className="text-base font-bold text-white tracking-wide">
                  Empirical Benchmark Champions
                </h2>
                <span className="text-xs text-slate-400 font-normal ml-2 hidden sm:inline">
                  Top-performing models validated on NVIDIA RTX 4060 8GB & Cloud Matrices
                </span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                5 Active Tracks
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* Track 1: Agentic Code FIM */}
              <div className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-blue-500/30 rounded-xl p-3.5 flex flex-col justify-between hover:border-blue-400 transition-all shadow-md group">
                <div>
                  <div className="flex items-center justify-between text-xs text-blue-400 mb-1.5">
                    <span className="font-semibold flex items-center gap-1">
                      <Code className="w-3.5 h-3.5" /> Agentic Code (FIM)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">#1 Top</span>
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors font-mono">
                    {bestInClass.AGENTIC_CODE_FIM?.primary || 'codestral:22b'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Fill-in-the-middle syntax champion for auto-patching and refactors.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Fallback:</span>
                  <span className="text-slate-300 font-mono text-[10px]">
                    {bestInClass.AGENTIC_CODE_FIM?.fallback || 'qwen2.5-coder:7b'}
                  </span>
                </div>
              </div>

              {/* Track 2: SQL Analytics */}
              <div className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-emerald-500/30 rounded-xl p-3.5 flex flex-col justify-between hover:border-emerald-400 transition-all shadow-md group">
                <div>
                  <div className="flex items-center justify-between text-xs text-emerald-400 mb-1.5">
                    <span className="font-semibold flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" /> SQL Analytics
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">#1 Top</span>
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors font-mono">
                    {bestInClass.SQL_DATABASE?.primary || 'sqlcoder:7b'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Multi-table join schemas, SQL queries, and metadata introspection.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Fallback:</span>
                  <span className="text-slate-300 font-mono text-[10px]">
                    {bestInClass.SQL_DATABASE?.fallback || 'qwen2.5-coder:7b'}
                  </span>
                </div>
              </div>

              {/* Track 3: Tool Calling */}
              <div className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-purple-500/30 rounded-xl p-3.5 flex flex-col justify-between hover:border-purple-400 transition-all shadow-md group">
                <div>
                  <div className="flex items-center justify-between text-xs text-purple-400 mb-1.5">
                    <span className="font-semibold flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5" /> Strict Tool Calling
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">#1 Top</span>
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors font-mono truncate" title={bestInClass.TOOL_CALLING?.primary || 'llama3-groq-tool-use:8b'}>
                    {bestInClass.TOOL_CALLING?.primary || 'llama3-groq-tool-use:8b'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Rigid JSON output schema validation with zero format drift.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Fallback:</span>
                  <span className="text-slate-300 font-mono text-[10px]">
                    {bestInClass.TOOL_CALLING?.fallback || 'hermes3:8b'}
                  </span>
                </div>
              </div>

              {/* Track 4: CoT Reasoning */}
              <div className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-amber-500/30 rounded-xl p-3.5 flex flex-col justify-between hover:border-amber-400 transition-all shadow-md group">
                <div>
                  <div className="flex items-center justify-between text-xs text-amber-400 mb-1.5">
                    <span className="font-semibold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> CoT Reasoning
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">#1 Top</span>
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors font-mono">
                    {bestInClass.COT_REASONING?.primary || 'deepseek-r1:8b'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Deep chain-of-thought logic for algorithmic analysis & bug triage.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Fallback:</span>
                  <span className="text-slate-300 font-mono text-[10px]">
                    {bestInClass.COT_REASONING?.fallback || 'qwen2.5-coder:7b'}
                  </span>
                </div>
              </div>

              {/* Track 5: Fast Boilerplate */}
              <div className="bg-gradient-to-b from-slate-800/90 to-slate-900/90 border border-rose-500/30 rounded-xl p-3.5 flex flex-col justify-between hover:border-rose-400 transition-all shadow-md group">
                <div>
                  <div className="flex items-center justify-between text-xs text-rose-400 mb-1.5">
                    <span className="font-semibold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> Fast Boilerplate
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">#1 Top</span>
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-rose-300 transition-colors font-mono">
                    {bestInClass.FAST_BOILERPLATE?.primary || 'qwen2.5-coder:1.5b'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    140+ TPS throughput for scaffolding, docstrings & inline hints.
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Fallback:</span>
                  <span className="text-slate-300 font-mono text-[10px]">
                    {bestInClass.FAST_BOILERPLATE?.fallback || 'tinyllama:1.1b'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* SEARCH, PROVIDER FILTER TABS & VRAM SAFETY FILTERS               */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            {/* Provider Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                onClick={() => setProviderFilter('ALL')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  providerFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Models ({totalCount})
              </button>
              <button
                onClick={() => setProviderFilter('GOOGLE_GEMINI')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  providerFilter === 'GOOGLE_GEMINI'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>☁️ Google Cloud</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30">{cloudCount}</span>
              </button>
              <button
                onClick={() => setProviderFilter('OLLAMA_LOCAL')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  providerFilter === 'OLLAMA_LOCAL'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>⚡ Local Ollama</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30">{localCount}</span>
              </button>
            </div>

            {/* Hardware Safety Quick Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Safety Tier:</span>
              </span>
              <select
                value={safetyFilter}
                onChange={(e) => setSafetyFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="ALL">All Hardware Tiers</option>
                <option value="SAFE_GPU">🟢 Pure GPU Safe (&le; 5.2 GB)</option>
                <option value="PAGED_HYBRID">🟡 Hybrid CPU/GPU Paged (5.3 - 16 GB)</option>
                <option value="OOM_HAZARDOUS">🔴 OOM Hazard (&gt; 16 GB)</option>
                <option value="CLOUD_UNMETERED">☁️ Cloud Hosted (Unmetered)</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models, tracks, capabilities..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* COMPREHENSIVE MODEL CARD GRID                                    */}
          {/* ---------------------------------------------------------------- */}
          {filteredModels.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Bot className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-300">No Models Match Filter Criteria</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try clearing your search query or selecting "All Models" / "All Hardware Tiers" to display the full intelligence catalog.
              </p>
              <button
                onClick={() => {
                  setProviderFilter('ALL');
                  setSafetyFilter('ALL');
                  setSearchQuery('');
                }}
                className="mt-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredModels.map((model) => {
                const isCloud = model.provider === 'GOOGLE_GEMINI';
                const isCopied = copiedModelId === model.id;

                // Safety badge styling
                let safetyBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
                if (model.safety?.tier === 'SAFE_GPU') {
                  safetyBadgeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
                } else if (model.safety?.tier === 'PAGED_HYBRID') {
                  safetyBadgeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
                } else if (model.safety?.tier === 'OOM_HAZARDOUS') {
                  safetyBadgeClass = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
                } else if (model.safety?.tier === 'CLOUD_UNMETERED') {
                  safetyBadgeClass = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
                }

                return (
                  <div
                    key={model.id}
                    className="bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between shadow-lg transition-all relative group"
                  >
                    {/* Top Row: Model Name & Provider Badge */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-white group-hover:text-blue-300 transition-colors truncate">
                              {model.name}
                            </span>
                            <button
                              onClick={() => copyToClipboard(model.name, model.id)}
                              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-800"
                              title="Copy model identifier"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {model.description || 'Calibrated intelligence profile.'}
                          </div>
                        </div>

                        {/* Provider Badge */}
                        <div className="shrink-0">
                          {isCloud ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                              ☁️ Google Cloud
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/60">
                              ⚡ Local Ollama
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hardware Safety Tag Banner */}
                      <div className="mt-3">
                        <div
                          className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border font-medium ${safetyBadgeClass}`}
                        >
                          <span className="font-semibold">{model.safety?.badge || 'Hardware Calibrated'}</span>
                          <span className="text-[10px] opacity-80 font-mono">
                            {isCloud ? 'Unmetered VRAM' : `${model.size_gb.toFixed(1)} GB on disk`}
                          </span>
                        </div>
                        {model.safety?.description && (
                          <div className="text-[10px] text-slate-500 mt-1 px-1">
                            {model.safety.description}
                          </div>
                        )}
                      </div>

                      {/* Primary Track & Telemetry Metrics */}
                      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
                          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Params</div>
                          <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">
                            {model.active_params || (isCloud ? 'Cloud' : '7B')}
                          </div>
                        </div>
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
                          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Disk / VRAM</div>
                          <div className="text-xs font-bold text-slate-200 mt-0.5 font-mono">
                            {isCloud ? '0.0 GB' : `${model.size_gb.toFixed(1)} GB`}
                          </div>
                        </div>
                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
                          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Benchmark</div>
                          <div className="text-xs font-bold text-emerald-400 mt-0.5 font-mono">
                            {model.tps_average > 0 ? `${model.tps_average.toFixed(0)} TPS` : 'Cloud Rate'}
                          </div>
                        </div>
                      </div>

                      {/* Primary Track Pill */}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-medium">Primary Track:</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/50 font-mono">
                          {model.primary_track}
                        </span>
                      </div>

                      {/* Empirical Scores Pills */}
                      {model.empirical_scores && Object.keys(model.empirical_scores).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-800/70">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                            Audit Evaluation Scores
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(model.empirical_scores).map(([metric, score]) => (
                              <span
                                key={metric}
                                className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 flex items-center gap-1 font-mono"
                              >
                                <span className="text-slate-400">{metric}:</span>
                                <span className="text-amber-400 font-bold">{String(score)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Capabilities Tags */}
                    {model.capabilities && model.capabilities.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800/80">
                        <div className="flex flex-wrap gap-1">
                          {model.capabilities.map((cap, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-400 border border-slate-700/60"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: VRAM ARBITRATOR & LOCAL MODELS (STUBBED FOR STAGE 10.2)      */}
      {/* ==================================================================== */}
      {activeTab === 'vram' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
            <Zap className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
              ⚡ Stage 10.2 Capability
            </div>
            <h2 className="text-xl font-bold text-white">
              VRAM Arbitrator & Local Ollama Allocator
            </h2>
            <p className="text-sm text-slate-400">
              Real-time NVIDIA RTX 4060 8GB VRAM allocation telemetry, 1-click idle model scavengers, live Ollama installed tags discovery, and paging safeguards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto text-left pt-4">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Gauge className="w-4 h-4" /> Live VRAM Telemetry
              </div>
              <p className="text-xs text-slate-400">
                Queries <code className="text-slate-300">/api/bridge/vram</code> to display active GPU memory allocations, resident models, and safety headroom.
              </p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <RefreshCw className="w-4 h-4" /> 1-Click VRAM Scavenger
              </div>
              <p className="text-xs text-slate-400">
                Dispatches <code className="text-slate-300">keep_alive: 0</code> via <code className="text-slate-300">/api/bridge/vram/scavenge</code> to instantly purge idle allocations.
              </p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                <Server className="w-4 h-4" /> Installed Tags Discovery
              </div>
              <p className="text-xs text-slate-400">
                Inspects <code className="text-slate-300">/api/bridge/ollama/tags</code> to discover local weights installed on the machine with parameter sizes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: SWARM ROSTERS & ROLE BUILDER (STUBBED FOR STAGE 10.2)        */}
      {/* ==================================================================== */}
      {activeTab === 'swarms' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <Sliders className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2 max-w-xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
              🛠️ Stage 10.2 Capability
            </div>
            <h2 className="text-xl font-bold text-white">
              Dynamic Swarm Rosters & Role Builder
            </h2>
            <p className="text-sm text-slate-400">
              Customizable swarm profiles with persistent storage in <code className="text-slate-300">.agent_memory/swarm_profiles.json</code>, orchestrator assignment, and concurrency ceilings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto text-left pt-4">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs">
                <Layers className="w-4 h-4" /> Swarm Profile Presets
              </div>
              <p className="text-xs text-slate-400">
                Instantly switch between Global Hybrid Adaptive Swarm, High-Throughput Cloud Swarm, and Air-Gapped Private Local Swarm.
              </p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs">
                <Bot className="w-4 h-4" /> Orchestrator Assignment
              </div>
              <p className="text-xs text-slate-400">
                Designate primary planning engines (<code className="text-slate-300">qwen2.5-coder:32b</code>, <code className="text-slate-300">gemini-2.5-pro</code>) for system architecture.
              </p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Sliders className="w-4 h-4" /> Concurrency & Worker Tiers
              </div>
              <p className="text-xs text-slate-400">
                Configure concurrency ceilings (up to 12 parallel sub-agents) and assign specialized roles across empirical tracks.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentHub;
