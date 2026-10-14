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
  CheckCircle,
  HardDrive,
  Trash2,
  Plus,
  X,
  Globe,
  Lock,
  AlertTriangle,
  SlidersHorizontal,
  Rocket
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

interface LoadedModelInfo {
  name: string;
  size_vram_gb: number;
  size_total_gb: number;
  expires_at?: string;
}

interface VramTelemetry {
  is_ollama_online: boolean;
  budget_gb: number;
  used_gb: number;
  available_gb: number;
  usage_percent: number;
  active_loaded_models: LoadedModelInfo[];
}

interface OllamaTagModel {
  name: string;
  tag: string;
  size_gb: number;
  parameter_size: string;
  quantization_level: string;
  modified_at?: string;
}

interface SwarmProfile {
  id: string;
  name: string;
  description: string;
  orchestrator: string;
  worker_tier: string;
  default_concurrency: number;
}

interface SwarmProfilesConfig {
  active_swarm_id: string;
  orchestrator_engine: string;
  max_concurrency_workers: number;
  swarms: SwarmProfile[];
}

const DEFAULT_SWARMS: SwarmProfile[] = [
  {
    id: 'GLOBAL_HYBRID_SWARM',
    name: 'Global Hybrid Adaptive Swarm',
    description: 'Cloud Pro/Ollama 32B for Architecture; Cloud Flash & Local 7B for Parallel Workers.',
    orchestrator: 'qwen2.5-coder:32b',
    worker_tier: 'HIGH_RPM_TPM',
    default_concurrency: 8
  },
  {
    id: 'FULLSTACK_CLOUD_SWARM',
    name: 'High-Throughput Cloud Swarm',
    description: 'Gemini Pro Orchestrator paired with 4,000 RPM Flash/Lite Workers.',
    orchestrator: 'gemini-2.5-pro',
    worker_tier: 'HIGHEST_RPM_TPM',
    default_concurrency: 12
  },
  {
    id: 'AIR_GAPPED_LOCAL_SWARM',
    name: 'Air-Gapped Private Local Swarm',
    description: 'Zero external API calls. Runs exclusively on Ollama local weights.',
    orchestrator: 'qwen2.5-coder:32b',
    worker_tier: 'OFFLINE_PURE',
    default_concurrency: 4
  }
];

const ORCHESTRATOR_OPTIONS = [
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro (Preview)',
    tier: 'Cloud Pro',
    badge: '☁️ 25-150 RPM',
    tag: 'Google Cloud',
    desc: 'Deepest Frontier Reasoning, 2M Context Window, Advanced Multi-turn Architecture.'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tier: 'Cloud Pro',
    badge: '☁️ 150 RPM',
    tag: 'Google Cloud',
    desc: 'Enterprise Flagship Architect, 1M Context Window, Exhaustive System Design.'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tier: 'Cloud High-Tier',
    badge: '☁️ 1,000 RPM',
    tag: 'Google Cloud',
    desc: 'High-Throughput Fast Architect, Low Latency, 2M Context Token Horizon.'
  },
  {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen 2.5 Coder 32B',
    tier: 'Local 32B',
    badge: '⚡ Local Weights',
    tag: 'Local Ollama',
    desc: 'Heavyweight Local Architect, Complex AST Refactoring, 19.8 GB Hybrid Paged.'
  },
  {
    id: 'qwen2.5-coder:14b',
    name: 'Qwen 2.5 Coder 14B',
    tier: 'Local 14B',
    badge: '⚡ Local Weights',
    tag: 'Local Ollama',
    desc: 'Balanced Local Architect, Fast Syntax Tree Introspection, 9.0 GB Footprint.'
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B',
    tier: 'Local 7B',
    badge: '🟢 Pure GPU Safe',
    tag: 'Local Ollama',
    desc: 'Fast Pure-GPU Architect, 0s Latency, Fits Entirely in RTX 4060 8GB VRAM.'
  },
  {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    tier: 'Local 8B',
    badge: '🟢 Pure GPU Safe',
    tag: 'Local Ollama',
    desc: 'Chain-of-Thought Reasoner, Algorithmic Logic & Root-Cause Proof Steps.'
  }
];

const getVramSafetyTier = (sizeGb: number): { tier: string; badge: string; color: string } => {
  if (sizeGb <= 5.2) {
    return { tier: 'SAFE_GPU', badge: '🟢 Pure GPU Safe', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
  } else if (sizeGb <= 8.0) {
    return { tier: 'HIGH_LOAD', badge: '🟡 High VRAM Load', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  } else if (sizeGb <= 16.0) {
    return { tier: 'PAGED_HYBRID', badge: '🟡 Hybrid Paged (RAM)', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' };
  } else {
    return { tier: 'OOM_HAZARDOUS', badge: '🔴 OOM Hazard (>16GB)', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
  }
};

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

  // Tab 2 (VRAM Arbitrator & Local Ollama Engine) States
  const [vramData, setVramData] = useState<VramTelemetry | null>(null);
  const [ollamaTags, setOllamaTags] = useState<OllamaTagModel[]>([]);
  const [vramLoading, setVramLoading] = useState<boolean>(false);
  const [scavenging, setScavenging] = useState<boolean>(false);
  const [scavengeMsg, setScavengeMsg] = useState<{ text: string; success: boolean } | null>(null);
  const [tagSearchQuery, setTagSearchQuery] = useState<string>('');

  // Co-Residency Simulator States
  const [simOrchestrator, setSimOrchestrator] = useState<string>('qwen2.5-coder:7b');
  const [simWorker, setSimWorker] = useState<string>('qwen2.5-coder:1.5b');
  const [simContextOverhead, setSimContextOverhead] = useState<number>(0.8);

  // Tab 3 (Swarm Rosters & Roles) States
  const [swarmConfig, setSwarmConfig] = useState<SwarmProfilesConfig | null>(null);
  const [activeSwarmId, setActiveSwarmId] = useState<string>('GLOBAL_HYBRID_SWARM');
  const [orchestratorEngine, setOrchestratorEngine] = useState<string>('qwen2.5-coder:32b');
  const [maxConcurrency, setMaxConcurrency] = useState<number>(8);
  const [customSwarms, setCustomSwarms] = useState<SwarmProfile[]>(DEFAULT_SWARMS);
  const [swarmSaving, setSwarmSaving] = useState<boolean>(false);
  const [swarmSaveMsg, setSwarmSaveMsg] = useState<{ text: string; success: boolean } | null>(null);

  // Custom Swarm Modal/Drawer States
  const [showCreateSwarm, setShowCreateSwarm] = useState<boolean>(false);
  const [newSwarmName, setNewSwarmName] = useState<string>('');
  const [newSwarmId, setNewSwarmId] = useState<string>('');
  const [newSwarmDesc, setNewSwarmDesc] = useState<string>('');
  const [newSwarmOrchestrator, setNewSwarmOrchestrator] = useState<string>('qwen2.5-coder:32b');
  const [newSwarmTier, setNewSwarmTier] = useState<string>('HIGH_RPM_TPM');
  const [newSwarmConcurrency, setNewSwarmConcurrency] = useState<number>(8);
  const [createSwarmError, setCreateSwarmError] = useState<string | null>(null);

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

      // 3. Fetch Real-Time VRAM Telemetry
      try {
        const vramRes = await fetch('/api/bridge/vram');
        if (vramRes.ok) {
          const vData = await vramRes.json();
          if (vData.vram) setVramData(vData.vram);
        }
      } catch (e) {
        console.warn('VRAM telemetry fetch error:', e);
      }

      // 4. Fetch Live Installed Ollama Tags
      try {
        const tagsRes = await fetch('/api/bridge/ollama/tags');
        if (tagsRes.ok) {
          const tData = await tagsRes.json();
          if (tData.models && Array.isArray(tData.models)) {
            setOllamaTags(tData.models);
          }
        }
      } catch (e) {
        console.warn('Ollama tags fetch error:', e);
      }

      // 5. Fetch Dynamic Swarm Profiles
      try {
        const swarmsRes = await fetch('/api/swarms/profiles');
        if (swarmsRes.ok) {
          const swData = await swarmsRes.json();
          setSwarmConfig(swData);
          if (swData.active_swarm_id) setActiveSwarmId(swData.active_swarm_id);
          if (swData.orchestrator_engine) setOrchestratorEngine(swData.orchestrator_engine);
          if (swData.max_concurrency_workers) setMaxConcurrency(Number(swData.max_concurrency_workers));
          if (swData.swarms && Array.isArray(swData.swarms) && swData.swarms.length > 0) {
            setCustomSwarms(swData.swarms);
          }
        }
      } catch (e) {
        console.warn('Swarm profiles fetch error:', e);
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

  // Re-fetch VRAM telemetry & installed tags on demand
  const fetchVramAndTags = useCallback(async () => {
    setVramLoading(true);
    try {
      const [vRes, tRes] = await Promise.all([
        fetch('/api/bridge/vram'),
        fetch('/api/bridge/ollama/tags')
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.vram) setVramData(vData.vram);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.models && Array.isArray(tData.models)) {
          setOllamaTags(tData.models);
        }
      }
    } catch (err) {
      console.warn('Error refreshing VRAM and tags:', err);
    } finally {
      setVramLoading(false);
    }
  }, []);

  // Flush all idle model VRAM allocations
  const handleScavengeAll = async () => {
    setScavenging(true);
    setScavengeMsg(null);
    try {
      const res = await fetch('/api/bridge/vram/scavenge', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        const count = data.scavenged_models?.length || 0;
        setScavengeMsg({
          text: `Flushed ${count} active model(s) from GPU VRAM. Headroom fully restored.`,
          success: true
        });
        const vRes = await fetch('/api/bridge/vram');
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.vram) setVramData(vData.vram);
        }
      } else {
        setScavengeMsg({
          text: data.error || 'Failed to scavenge idle VRAM.',
          success: false
        });
      }
    } catch (err: any) {
      setScavengeMsg({ text: `Scavenge error: ${err.message || err}`, success: false });
    } finally {
      setScavenging(false);
    }
  };

  // Unload single model from VRAM
  const handleUnloadModel = async (modelName: string) => {
    try {
      const res = await fetch(`/api/bridge/vram/scavenge?model_name=${encodeURIComponent(modelName)}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setScavengeMsg({ text: `Unloaded ${modelName} from GPU VRAM.`, success: true });
        const vRes = await fetch('/api/bridge/vram');
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.vram) setVramData(vData.vram);
        }
      }
    } catch (err: any) {
      setScavengeMsg({ text: `Failed to unload ${modelName}: ${err.message || err}`, success: false });
    }
  };

  // Available local models for Co-Residency Simulator
  const availableLocalModels = useMemo(() => {
    const map = new Map<string, { name: string; size_gb: number }>();
    if (ollamaTags.length > 0) {
      ollamaTags.forEach((t) => {
        map.set(t.name, { name: t.name, size_gb: t.size_gb });
      });
    }
    models
      .filter((m) => m.provider === 'OLLAMA_LOCAL')
      .forEach((m) => {
        if (!map.has(m.name)) {
          map.set(m.name, { name: m.name, size_gb: m.size_gb });
        }
      });
    if (map.size === 0) {
      map.set('qwen2.5-coder:32b', { name: 'qwen2.5-coder:32b', size_gb: 19.8 });
      map.set('codestral:22b', { name: 'codestral:22b', size_gb: 12.2 });
      map.set('qwen2.5-coder:14b', { name: 'qwen2.5-coder:14b', size_gb: 9.0 });
      map.set('qwen2.5-coder:7b', { name: 'qwen2.5-coder:7b', size_gb: 4.7 });
      map.set('sqlcoder:7b', { name: 'sqlcoder:7b', size_gb: 4.8 });
      map.set('llama3-groq-tool-use:8b', { name: 'llama3-groq-tool-use:8b', size_gb: 4.9 });
      map.set('deepseek-r1:8b', { name: 'deepseek-r1:8b', size_gb: 4.9 });
      map.set('qwen2.5-coder:3b', { name: 'qwen2.5-coder:3b', size_gb: 2.2 });
      map.set('qwen2.5-coder:1.5b', { name: 'qwen2.5-coder:1.5b', size_gb: 1.2 });
    }
    return Array.from(map.values());
  }, [ollamaTags, models]);

  // Lookup model size in GB
  const getModelSize = useCallback(
    (modelName: string): number => {
      if (!modelName || modelName === 'none') return 0;
      const match = availableLocalModels.find((m) => m.name === modelName);
      if (match) return match.size_gb;
      if (modelName.includes('32b')) return 19.8;
      if (modelName.includes('22b')) return 12.2;
      if (modelName.includes('14b')) return 9.0;
      if (modelName.includes('7b') || modelName.includes('8b')) return 4.8;
      if (modelName.includes('3b')) return 2.2;
      if (modelName.includes('1.5b') || modelName.includes('1b')) return 1.2;
      return 4.7;
    },
    [availableLocalModels]
  );

  // Compute Co-Residency Simulation
  const orchestratorFootprint = getModelSize(simOrchestrator);
  const workerFootprint = simWorker === 'none' ? 0 : getModelSize(simWorker);
  const contextFootprint = simContextOverhead;
  const totalSimFootprint = Math.round((orchestratorFootprint + workerFootprint + contextFootprint) * 100) / 100;
  const simHeadroom = Math.max(0, Math.round((8.0 - totalSimFootprint) * 100) / 100);

  const simVerdict = useMemo(() => {
    if (totalSimFootprint <= 7.2) {
      return {
        badge: '🟢 Co-Residency Safe (Both models fit in Pure VRAM)',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        description:
          'Zero CPU offloading. Peak GDDR6 token velocity with zero PCIe offload latency across both orchestrator and worker models simultaneously.'
      };
    } else if (totalSimFootprint <= 8.5) {
      return {
        badge: '🟡 Partial RAM Offload (Slight TPS reduction)',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        description:
          'Combined weights exceed 7.2 GB operational target. Windows/CUDA driver will page overflow layers into system RAM via PCIe, causing minor token generation latency (~20-40% TPS degradation).'
      };
    } else {
      return {
        badge: '🔴 VRAM Overflow Warning (Models will swap/thrash)',
        badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        description:
          'Footprint exceeds 8.0 GB VRAM boundary significantly. High risk of memory thrashing or CUDA Out-Of-Memory. Switch worker to lightweight qwen2.5-coder:1.5b (1.2 GB) or run models sequentially in serial mode.'
      };
    }
  }, [totalSimFootprint]);

  // Filtered tags for Local Ollama grid
  const filteredTags = useMemo(() => {
    const list = ollamaTags.length > 0 ? ollamaTags : [
      { name: 'qwen2.5-coder:32b', tag: 'qwen2.5-coder:32b', size_gb: 19.8, parameter_size: '32B', quantization_level: 'Q4_K_M' },
      { name: 'codestral:22b', tag: 'codestral:22b', size_gb: 12.2, parameter_size: '22B', quantization_level: 'Q4_K_M' },
      { name: 'qwen2.5-coder:7b', tag: 'qwen2.5-coder:7b', size_gb: 4.7, parameter_size: '7B', quantization_level: 'Q4_K_M' },
      { name: 'sqlcoder:7b', tag: 'sqlcoder:7b', size_gb: 4.8, parameter_size: '7B', quantization_level: 'Q4_K_M' },
      { name: 'llama3-groq-tool-use:8b', tag: 'llama3-groq-tool-use:8b', size_gb: 4.9, parameter_size: '8B', quantization_level: 'Q4_K_M' },
      { name: 'deepseek-r1:8b', tag: 'deepseek-r1:8b', size_gb: 4.9, parameter_size: '8B', quantization_level: 'Q4_K_M' },
      { name: 'qwen2.5-coder:1.5b', tag: 'qwen2.5-coder:1.5b', size_gb: 1.2, parameter_size: '1.5B', quantization_level: 'Q4_K_M' }
    ];
    if (!tagSearchQuery.trim()) return list;
    const q = tagSearchQuery.toLowerCase();
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tag.toLowerCase().includes(q) ||
        t.parameter_size.toLowerCase().includes(q) ||
        t.quantization_level.toLowerCase().includes(q)
    );
  }, [ollamaTags, tagSearchQuery]);

  // Save active swarm profiles configuration
  const handleSaveSwarmConfig = async () => {
    setSwarmSaving(true);
    setSwarmSaveMsg(null);
    try {
      const payload = {
        active_swarm_id: activeSwarmId,
        orchestrator_engine: orchestratorEngine,
        max_concurrency_workers: maxConcurrency,
        swarms: customSwarms
      };
      const res = await fetch('/api/swarms/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSwarmSaveMsg({
          text: 'Swarm Roster & Orchestrator Roles Activated - Saved to .agent_memory/swarm_profiles.json',
          success: true
        });
        setTimeout(() => setSwarmSaveMsg(null), 5000);
      } else {
        setSwarmSaveMsg({
          text: data.detail || data.error || 'Failed to update swarm profiles.',
          success: false
        });
      }
    } catch (err: any) {
      setSwarmSaveMsg({ text: `Error updating swarm profiles: ${err.message || err}`, success: false });
    } finally {
      setSwarmSaving(false);
    }
  };

  // Add custom swarm roster
  const handleAddCustomSwarm = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSwarmError(null);
    const id = newSwarmId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const name = newSwarmName.trim();
    if (!id || !name) {
      setCreateSwarmError('Please provide both a Swarm ID and Name.');
      return;
    }
    if (customSwarms.some((s) => s.id === id)) {
      setCreateSwarmError(`Swarm ID "${id}" already exists.`);
      return;
    }

    const newSwarm: SwarmProfile = {
      id,
      name,
      description: newSwarmDesc.trim() || 'User configured custom swarm roster.',
      orchestrator: newSwarmOrchestrator,
      worker_tier: newSwarmTier,
      default_concurrency: newSwarmConcurrency
    };

    const updated = [...customSwarms, newSwarm];
    setCustomSwarms(updated);
    setActiveSwarmId(id);
    setOrchestratorEngine(newSwarmOrchestrator);
    setMaxConcurrency(newSwarmConcurrency);
    setShowCreateSwarm(false);
    setNewSwarmName('');
    setNewSwarmId('');
    setNewSwarmDesc('');

    try {
      await fetch('/api/swarms/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_swarm_id: id,
          orchestrator_engine: newSwarmOrchestrator,
          max_concurrency_workers: newSwarmConcurrency,
          swarms: updated
        })
      });
      setSwarmSaveMsg({
        text: `Custom Swarm "${name}" created and activated!`,
        success: true
      });
      setTimeout(() => setSwarmSaveMsg(null), 5000);
    } catch (err) {
      console.warn('Auto-save error on swarm creation:', err);
    }
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
      {/* TAB 2: VRAM ARBITRATOR & LOCAL OLLAMA ENGINE                        */}
      {/* ==================================================================== */}
      {activeTab === 'vram' && (
        <div className="space-y-6">
          {/* Hardware & Live Status Header Banner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    NVIDIA GeForce RTX 4060 VRAM Arbitrator
                  </h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    8.0 GB GDDR6
                  </span>
                  {vramData?.is_ollama_online ? (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ollama Online (127.0.0.1:11434)
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 font-mono">
                      <AlertTriangle className="w-3 h-3" />
                      Ollama Standalone / Offline
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Active GPU memory budgeting, 1-click idle VRAM scavengers, and dual-model co-residency simulation.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                type="button"
                id="refresh-vram-btn"
                onClick={fetchVramAndTags}
                disabled={vramLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${vramLoading ? "animate-spin" : ""}`} />
                <span>Refresh Hardware & Tags</span>
              </button>

              <button
                type="button"
                id="scavenge-all-btn"
                onClick={handleScavengeAll}
                disabled={scavenging}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Flame className={`w-3.5 h-3.5 ${scavenging ? "animate-pulse" : ""}`} />
                <span>{scavenging ? 'Purging VRAM...' : 'Scavenge & Flush All Idle VRAM'}</span>
              </button>
            </div>
          </div>

          {/* Scavenge Banner Feedback */}
          {scavengeMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                scavengeMsg.success
                  ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                  : "bg-rose-950/40 border-rose-800/60 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {scavengeMsg.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{scavengeMsg.text}</span>
              </div>
              <button
                onClick={() => setScavengeMsg(null)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>
          )}
          {/* Hardware Telemetry Gauge Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <span>RTX 4060 Real-Time Memory Telemetry</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Safe Operational Ceiling: <span className="text-emerald-400 font-mono font-semibold">7.20 GB</span> (~90%) • Display Buffer: <span className="text-slate-400 font-mono">0.80 GB</span>
                </div>
              </div>

              {/* Usage percentage badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Current Load:</span>
                <span
                  className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg border ${
                    (vramData?.usage_percent || 0) > 90
                      ? "bg-rose-950/40 border-rose-800 text-rose-300"
                      : (vramData?.usage_percent || 0) > 65
                      ? "bg-amber-950/40 border-amber-800 text-amber-300"
                      : "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                  }`}
                >
                  {vramData?.usage_percent?.toFixed(1) || '0.0'}% Used
                </span>
              </div>
            </div>

            {/* 3 Metric Stats Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  VRAM Allocated
                </div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {vramData?.used_gb?.toFixed(2) || '0.00'}{' '}
                  <span className="text-xs text-slate-400 font-normal">/ 8.00 GB</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Active weights in GPU memory
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Available Headroom
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {vramData?.available_gb?.toFixed(2) || '8.00'}{' '}
                  <span className="text-xs text-slate-400 font-normal">GB</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Unallocated GDDR6 headroom
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Resident Local Models
                </div>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  {vramData?.active_loaded_models?.length || 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Models currently warm in VRAM
                </div>
              </div>
            </div>

            {/* VRAM Telemetry Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">0.0 GB</span>
                <span className="text-emerald-400">5.2 GB (Pure Safe)</span>
                <span className="text-amber-400">7.2 GB (Target Limit)</span>
                <span className="text-rose-400">8.0 GB (Hardware Ceiling)</span>
              </div>

              <div className="h-4 rounded-full bg-slate-950 border border-slate-800 p-0.5 overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (vramData?.usage_percent || 0) > 90
                      ? "bg-gradient-to-r from-amber-500 to-rose-500"
                      : (vramData?.usage_percent || 0) > 65
                      ? "bg-gradient-to-r from-emerald-500 to-amber-500"
                      : "bg-gradient-to-r from-cyan-500 to-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, vramData?.usage_percent || 0))}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  &le; 65% (&le; 5.2 GB): Pure GPU Safe
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  66% - 88%: High VRAM Load
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  &gt; 88%: Paging / OOM Hazard
                </span>
              </div>
            </div>

            {/* Resident Models List & Individual Unload */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-blue-400" />
                  <span>Resident Loaded Models in VRAM</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  From Ollama /api/ps
                </span>
              </div>

              {!vramData?.active_loaded_models || vramData.active_loaded_models.length === 0 ? (
                <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-5 text-center text-xs text-slate-400">
                  ✨ No models currently resident in GPU memory (0.00 GB active footprint). Full 8.00 GB VRAM headroom is idle and available.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {vramData.active_loaded_models.map((mod, idx) => (
                    <div
                      key={`${mod.name}-${idx}`}
                      className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-3 shadow-md transition-all"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-sm text-white truncate flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>{mod.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                          <span>VRAM: <strong className="text-amber-400">{mod.size_vram_gb.toFixed(2)} GB</strong></span>
                          <span>Total: {mod.size_total_gb.toFixed(2)} GB</span>
                          {mod.expires_at && (
                            <span className="text-slate-500 truncate" title={`Expires at ${mod.expires_at}`}>
                              Timer: {new Date(mod.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnloadModel(mod.name)}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
                        title={`Unload ${mod.name} immediately`}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Unload</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* ================================================================ */}
          {/* DUAL-MODEL VRAM STAGING CALCULATOR (CO-RESIDENCY SIMULATOR)       */}
          {/* ================================================================ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                <Sliders className="w-4 h-4" />
                <span>Dual-Model VRAM Staging Calculator (Co-Residency Simulator)</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                Test Multi-Agent Local Co-Residency on RTX 4060 8.0 GB
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                Simulate whether your chosen Local Orchestrator and Local SubAgent Worker can execute concurrently in pure GDDR6 VRAM without triggering CUDA system RAM paging.
              </p>
            </div>

            {/* Simulator Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Dropdown 1: Primary Orchestrator */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  1. Primary / Orchestrator Model
                </label>
                <select
                  id="sim-orchestrator-select"
                  value={simOrchestrator}
                  onChange={(e) => setSimOrchestrator(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 transition-all"
                >
                  {availableLocalModels.map((m) => (
                    <option key={`orch-${m.name}`} value={m.name}>
                      {m.name} ({m.size_gb.toFixed(1)} GB)
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Footprint:</span>
                  <span className="font-bold text-indigo-400">{orchestratorFootprint.toFixed(2)} GB</span>
                </div>
              </div>

              {/* Dropdown 2: Secondary Worker */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  2. Secondary / Swarm Worker
                </label>
                <select
                  id="sim-worker-select"
                  value={simWorker}
                  onChange={(e) => setSimWorker(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-500 transition-all"
                >
                  <option value="none">None - Single Model Mode (0.0 GB)</option>
                  {availableLocalModels.map((m) => (
                    <option key={`worker-${m.name}`} value={m.name}>
                      {m.name} ({m.size_gb.toFixed(1)} GB)
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Footprint:</span>
                  <span className="font-bold text-cyan-400">{workerFootprint.toFixed(2)} GB</span>
                </div>
              </div>

              {/* Context Window Overhead */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  3. Context KV-Cache Overhead
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '2048 ctx', val: 0.4, sub: '~0.4 GB' },
                    { label: '4096 ctx', val: 0.8, sub: '~0.8 GB' },
                    { label: '8192 ctx', val: 1.5, sub: '~1.5 GB' }
                  ].map((ctx) => (
                    <button
                      key={ctx.label}
                      type="button"
                      onClick={() => setSimContextOverhead(ctx.val)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-mono text-center border transition-all ${
                        simContextOverhead === ctx.val
                          ? "bg-amber-600/20 border-amber-500 text-amber-300 font-bold"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div>{ctx.label}</div>
                      <div className="text-[10px] text-slate-500">{ctx.sub}</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>KV Overhead:</span>
                  <span className="font-bold text-amber-400">{contextFootprint.toFixed(2)} GB</span>
                </div>
              </div>
            </div>

            {/* Computed Output & Visual Footprint Bar */}
            <div className="bg-slate-950 rounded-xl p-5 border border-slate-800/90 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Total Estimated VRAM Footprint
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-0.5">
                    {totalSimFootprint.toFixed(2)}{' '}
                    <span className="text-xs text-slate-400 font-normal">/ 8.00 GB</span>
                    <span className="text-xs text-slate-500 font-normal ml-2">
                      ({Math.round((totalSimFootprint / 8.0) * 100)}% capacity)
                    </span>
                  </div>
                </div>

                {/* Verdict Badge */}
                <div className={`px-4 py-2 rounded-xl border text-xs font-bold ${simVerdict.className} flex items-center gap-2 self-start sm:self-auto`}>
                  {simVerdict.badge}
                </div>
              </div>

              {/* Multi-Segment Stacked Footprint Bar */}
              <div className="space-y-1.5">
                <div className="h-4 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex">
                  {/* Orchestrator segment */}
                  <div
                    className="bg-indigo-500 h-full transition-all"
                    style={{ width: `${Math.min(100, (orchestratorFootprint / 8.0) * 100)}%` }}
                    title={`Orchestrator: ${orchestratorFootprint.toFixed(2)} GB`}
                  />
                  {/* Worker segment */}
                  {workerFootprint > 0 && (
                    <div
                      className="bg-cyan-500 h-full transition-all"
                      style={{ width: `${Math.min(100, (workerFootprint / 8.0) * 100)}%` }}
                      title={`Worker: ${workerFootprint.toFixed(2)} GB`}
                    />
                  )}
                  {/* Context KV segment */}
                  <div
                    className="bg-amber-500 h-full transition-all"
                    style={{ width: `${Math.min(100, (contextFootprint / 8.0) * 100)}%` }}
                    title={`Context Buffer: ${contextFootprint.toFixed(2)} GB`}
                  />
                  {/* Free headroom */}
                  {simHeadroom > 0 && (
                    <div
                      className="bg-slate-850 h-full transition-all"
                      style={{ width: `${(simHeadroom / 8.0) * 100}%` }}
                      title={`Free Headroom: ${simHeadroom.toFixed(2)} GB`}
                    />
                  )}
                </div>

                {/* Bar Legend */}
                <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                    Orchestrator ({orchestratorFootprint.toFixed(1)} GB)
                  </span>
                  {workerFootprint > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                      Worker ({workerFootprint.toFixed(1)} GB)
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                    KV Cache ({contextFootprint.toFixed(1)} GB)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-700" />
                    Free Headroom ({simHeadroom.toFixed(1)} GB)
                  </span>
                </div>
              </div>

              {/* Explanatory Guidance */}
              <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800/80 pt-3">
                {simVerdict.description}
              </p>
            </div>
          </div>
          {/* ================================================================ */}
          {/* INSTALLED LOCAL OLLAMA MODELS TABLE/GRID                          */}
          {/* ================================================================ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span>Installed Local Ollama Models</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    {filteredTags.length} Discovered
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Weights installed on this workstation with hardware safety classifications.
                </p>
              </div>

              {/* Search filter for tags */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter local models..."
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {filteredTags.length === 0 ? (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-8 text-center space-y-2">
                <HardDrive className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="text-xs font-semibold text-slate-300">No Local Models Match Filter</div>
                <p className="text-[11px] text-slate-500">
                  Ensure Ollama daemon is running or install additional models with <code className="text-slate-300 font-mono">ollama pull qwen2.5-coder:7b</code>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTags.map((tagMod, i) => {
                  const safety = getVramSafetyTier(tagMod.size_gb);
                  const isCopied = copiedModelId === tagMod.name;

                  return (
                    <div
                      key={`${tagMod.name}-${idx}`}
                      className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between shadow-md transition-all group"
                    >
                      <div>
                        {/* Top: Name & Copy */}
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono font-bold text-sm text-white group-hover:text-purple-300 transition-colors truncate">
                            {tagMod.name}
                          </span>
                          <button
                            onClick={() => copyToClipboard(tagMod.name, tagMod.name)}
                            className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-900 transition-colors"
                            title="Copy model tag"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Safety Tier Badge */}
                        <div className="mt-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border font-mono ${safety.className}`}>
                            {safety.badge}
                          </span>
                        </div>

                        {/* Metrics Pills */}
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                          <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-1.5">
                            <div className="text-[9px] text-slate-500 uppercase font-semibold">Params</div>
                            <div className="text-xs font-bold font-mono text-slate-200 mt-0.5">
                              {tagMod.parameter_size || 'Unknown'}
                            </div>
                          </div>
                          <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-1.5">
                            <div className="text-[9px] text-slate-500 uppercase font-semibold">Quant</div>
                            <div className="text-xs font-bold font-mono text-purple-300 mt-0.5">
                              {tagMod.quantization_level || 'Q4_K_M'}
                            </div>
                          </div>
                          <div className="bg-slate-900/80 border border-slate-800/80 rounded-lg p-1.5">
                            <div className="text-[9px] text-slate-500 uppercase font-semibold">Size</div>
                            <div className="text-xs font-bold font-mono text-amber-400 mt-0.5">
                              {tagMod.size_gb.toFixed(1)} GB
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quick action buttons to load into Simulator */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSimOrchestrator(tagMod.name)}
                          className="px-2.5 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold transition-all flex items-center gap-1"
                          title="Set as Primary Orchestrator in Simulator"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>Sim: Orch</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSimWorker(tagMod.name)}
                          className="px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold transition-all flex items-center gap-1"
                          title="Set as Swarm Worker in Simulator"
                        >
                          <Bot className="w-3 h-3" />
                          <span>Sim: Worker</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ==================================================================== */}
      {/* TAB 3: SWARM ROSTERS, ROLES & CONCURRENCY BUILDER                  */}
      {/* ==================================================================== */}
      {activeTab === 'swarms' && (
        <div className="space-y-6">
          {/* Header & Active Summary Banner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Dynamic Swarm Rosters & Worker Roles
                  </h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                    Multi-Agent Mesh
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Configure Phase 0 Master Orchestrator planning engines, empirical worker role assignments, and dynamic concurrency ceilings.
                </p>
              </div>
            </div>

            {/* Top Right Save & Status */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                type="button"
                id="toggle-create-swarm-btn"
                onClick={() => setShowCreateSwarm(!showCreateSwarm)}
                className="px-3.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                {showCreateSwarm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{showCreateSwarm ? 'Close Creator' : 'Create Custom Swarm'}</span>
              </button>

              <button
                type="button"
                id="save-swarm-config-btn"
                onClick={handleSaveSwarmConfig}
                disabled={swarmSaving}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${swarmSaving ? "animate-spin" : ""}`} />
                <span>{swarmSaving ? 'Saving Profiles...' : 'Save & Activate Swarm'}</span>
              </button>
            </div>
          </div>

          {/* Swarm Save Banner Feedback */}
          {swarmSaveMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                swarmSaveMsg.success
                  ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                  : "bg-rose-950/40 border-rose-800/60 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {swarmSaveMsg.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{swarmSaveMsg.text}</span>
              </div>
              <button
                onClick={() => setSwarmSaveMsg(null)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* ================================================================ */}
          {/* 1. SWARM ROSTER PRESETS GRID                                      */}
          {/* ================================================================ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Swarm Roster Presets</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select an active multi-agent profile to pre-fill orchestrator and worker concurrency defaults.
                </p>
              </div>

              <div className="text-xs font-mono text-slate-400">
                Active ID: <strong className="text-emerald-400">{activeSwarmId}</strong>
              </div>
            </div>

            {/* Custom Swarm Creator Collapsible Form */}
            {showCreateSwarm && (
              <form
                onSubmit={handleAddCustomSwarm}
                className="bg-slate-950 border border-emerald-500/30 rounded-xl p-5 space-y-4 shadow-lg animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>Create Custom Swarm Roster</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateSwarm(false)}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>

                {createSwarmError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{createSwarmError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Swarm Identifier (Unique ID)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. FRONTEND_SPRINT_SWARM"
                      value={newSwarmId}
                      onChange={(e) => setNewSwarmId(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Display Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. High-Velocity Frontend Sprint Team"
                      value={newSwarmName}
                      onChange={(e) => setNewSwarmName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Swarm Description & Objective
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Optimized for rapid TypeScript / React component authoring with high-speed Flash workers."
                    value={newSwarmDesc}
                    onChange={(e) => setNewSwarmDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Default Orchestrator
                    </label>
                    <select
                      value={newSwarmOrchestrator}
                      onChange={(e) => setNewSwarmOrchestrator(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    >
                      {ORCHESTRATOR_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.tier})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Worker Rate Tier
                    </label>
                    <select
                      value={newSwarmTier}
                      onChange={(e) => setNewSwarmTier(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="HIGH_RPM_TPM">HIGH_RPM_TPM (Flash & 7B)</option>
                      <option value="HIGHEST_RPM_TPM">HIGHEST_RPM_TPM (Flash-Lite 4K RPM)</option>
                      <option value="PRO_PLAN">PRO_PLAN (Deep Reasoning)</option>
                      <option value="OFFLINE_PURE">OFFLINE_PURE (Local Only)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Default Concurrency (1 - 16)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={newSwarmConcurrency}
                      onChange={(e) => setNewSwarmConcurrency(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateSwarm(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
                  >
                    Save & Activate Roster
                  </button>
                </div>
              </form>
            )}

            {/* Presets Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {customSwarms.map((sw) => {
                const isActive = activeSwarmId === sw.id;
                let iconEl = <Layers className="w-5 h-5 text-emerald-400" />;
                if (sw.id === 'GLOBAL_HYBRID_SWARM') iconEl = <Globe className="w-5 h-5 text-blue-400" />;
                if (sw.id === 'FULLSTACK_CLOUD_SWARM') iconEl = <Zap className="w-5 h-5 text-purple-400" />;
                if (sw.id === 'AIR_GAPPED_LOCAL_SWARM') iconEl = <Lock className="w-5 h-5 text-amber-400" />;

                return (
                  <div
                    key={sw.id}
                    onClick={() => {
                      setActiveSwarmId(sw.id);
                      setOrchestratorEngine(sw.orchestrator);
                      setMaxConcurrency(sw.default_concurrency);
                    }}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between shadow-lg relative ${
                      isActive
                        ? "bg-slate-900 border-emerald-500/70 shadow-emerald-500/10 ring-1 ring-emerald-500/30"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                    }`}
                  >
                    <div>
                      {/* Top Row: Icon + Active Pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                          {iconEl}
                        </div>
                        {isActive ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3" /> Active Swarm
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-900 text-slate-500 border border-slate-800">
                            Preset
                          </span>
                        )}
                      </div>

                      <div className="mt-3">
                        <h4 className="font-bold text-sm text-white group-hover:text-emerald-300">
                          {sw.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          {sw.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-[11px] font-mono">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Orchestrator:</span>
                        <span className="font-bold text-slate-200 truncate max-w-[140px]" title={sw.orchestrator}>
                          {sw.orchestrator}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Worker Tier:</span>
                        <span className="text-blue-300">{sw.worker_tier}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Default Workers:</span>
                        <span className="text-emerald-400 font-bold">{sw.default_concurrency} Workers</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* ================================================================ */}
          {/* 2. PHASE 0 MASTER ORCHESTRATOR ROLE ASSIGNMENT                    */}
          {/* ================================================================ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-purple-400 text-xs font-bold uppercase tracking-wider">
                <Bot className="w-4 h-4" />
                <span>Phase 0 Master Orchestrator Role Assignment</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                Designate Master System Architecture & Planning Engine
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                The Master Orchestrator analyzes high-level instructions, resolves module dependency graphs, generates multi-file blueprints, and governs memory book defragmentation before parallel sub-agent handoff.
              </p>
            </div>

            {/* Selection Grid for Orchestrator */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {ORCHESTRATOR_OPTIONS.map((opt) => {
                const isSelected = orchestratorEngine === opt.id;
                const isCloud = opt.tag === 'Google Cloud';

                return (
                  <div
                    key={opt.id}
                    onClick={() => setOrchestratorEngine(opt.id)}
                    className={`cursor-pointer rounded-xl p-4 border transition-all flex flex-col justify-between shadow-md ${
                      isSelected
                        ? "bg-slate-900 border-purple-500/70 shadow-purple-500/10 ring-1 ring-purple-500/30"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-sm text-white flex items-center gap-1.5 truncate">
                            <span>{opt.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {opt.id}
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 font-mono shrink-0">
                            <Check className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                            isCloud
                              ? "bg-cyan-950/40 border-cyan-800/60 text-cyan-300"
                              : "bg-purple-950/40 border-purple-800/60 text-purple-300"
                          }`}>
                            {opt.badge}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {opt.desc}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-500">Tier: {opt.tier}</span>
                      <span className={isCloud ? 'text-cyan-400' : 'text-purple-400'}>
                        {opt.tag}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* ================================================================ */}
          {/* 3. DYNAMIC SWARM WORKER CONCURRENCY SCALING (1 to 16)             */}
          {/* ================================================================ */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                  <span>Swarm Worker Concurrency Scaling</span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Parallel Sub-Agent Execution Ceiling
                </h3>
              </div>

              {/* Number display */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Ceiling:</span>
                <span className="text-xl font-bold font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/30">
                  {maxConcurrency} Workers
                </span>
              </div>
            </div>

            {/* Slider Control */}
            <div className="space-y-4">
              <div className="space-y-2">
                <input
                  id="concurrency-slider"
                  type="range"
                  min={1}
                  max={16}
                  value={maxConcurrency}
                  onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>1 Worker (Serial)</span>
                  <span>4 Workers (Local Safe)</span>
                  <span>8 Workers (Standard)</span>
                  <span>12 Workers (Burst)</span>
                  <span>16 Workers (Max Concurrency)</span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-400 font-semibold mr-1">Presets:</span>
                {[
                  { count: 1, label: '1 (Serial)' },
                  { count: 4, label: '4 (Local Safe)' },
                  { count: 8, label: '8 (Hybrid Default)' },
                  { count: 12, label: '12 (Cloud High)' },
                  { count: 16, label: '16 (Max Burst)' }
                ].map((preset) => (
                  <button
                    key={preset.count}
                    type="button"
                    onClick={() => setMaxConcurrency(preset.count)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium border transition-all ${
                      maxConcurrency === preset.count
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* 3 Range Brackets Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className={`p-3.5 rounded-xl border ${
                  maxConcurrency <= 4
                    ? "bg-emerald-950/30 border-emerald-500/50 text-emerald-300"
                    : "bg-slate-950/50 border-slate-800/80 text-slate-400"
                }`}>
                  <div className="text-xs font-bold font-mono">1 - 4 Workers</div>
                  <div className="text-[11px] mt-0.5">Recommended for OFFLINE_PURE & Local 8GB GPU safety.</div>
                </div>

                <div className={`p-3.5 rounded-xl border ${
                  maxConcurrency >= 5 && maxConcurrency <= 9
                    ? "bg-blue-950/30 border-blue-500/50 text-blue-300"
                    : "bg-slate-950/50 border-slate-800/80 text-slate-400"
                }`}>
                  <div className="text-xs font-bold font-mono">5 - 9 Workers</div>
                  <div className="text-[11px] mt-0.5">Standard balanced hybrid swarm across cloud & local models.</div>
                </div>

                <div className={`p-3.5 rounded-xl border ${
                  maxConcurrency >= 10
                    ? "bg-purple-950/30 border-purple-500/50 text-purple-300"
                    : "bg-slate-950/50 border-slate-800/80 text-slate-400"
                }`}>
                  <div className="text-xs font-bold font-mono">10 - 16 Workers</div>
                  <div className="text-[11px] mt-0.5">High-Concurrency Burst Mode for 4,000 RPM Flash-Lite pools.</div>
                </div>
              </div>

              {/* Dynamic Advisory Banners */}
              {maxConcurrency > 4 && (orchestratorEngine.includes('qwen') || orchestratorEngine.includes('deepseek') || activeSwarmId === 'AIR_GAPPED_LOCAL_SWARM') && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>High Local Concurrency Warning:</strong> Running &gt;4 parallel local workers on an 8GB GPU may trigger GPU thread contention or CPU paging. Recommend 1-4 workers for pure local execution.
                  </span>
                </div>
              )}

              {maxConcurrency > 9 && (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center gap-2.5">
                  <Rocket className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>
                    <strong>High-Concurrency Burst Mode Active:</strong> Scaled to {maxConcurrency} parallel agents. Optimized for Google Flash-Lite 4,000 RPM pools and multi-API key rotation.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Persist Action Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Active Blueprint: </span>
              <span className="font-mono text-emerald-400">{activeSwarmId}</span> with{' '}
              <span className="font-mono text-purple-400">{orchestratorEngine}</span> orchestrator and{' '}
              <span className="font-mono text-cyan-400">{maxConcurrency} workers</span>.
            </div>

            <button
              type="button"
              onClick={handleSaveSwarmConfig}
              disabled={swarmSaving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:via-teal-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className={`w-4 h-4 ${swarmSaving ? "animate-spin" : ""}`} />
              <span>{swarmSaving ? 'Activating Profile...' : 'Save & Activate Swarm Configuration'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentHub;