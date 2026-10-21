import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Cpu,
  Zap,
  Activity,
  Shield,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  HardDrive,
  Terminal,
  Play,
  Plus,
  X,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Info,
  Trash2,
  ArrowRight,
  Clock,
  FileText,
  Search,
  Filter,
  Key,
  Users,
  CheckSquare,
  Square
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS & HARDWARE MATRIX INTERFACES
// ============================================================================

export interface SafetyTier {
  tier: string;
  badge: string;
  description?: string;
  color?: string;
  className?: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  provider: 'GOOGLE_GEMINI' | 'GROQ' | 'OLLAMA_LOCAL' | string;
  size_gb: number;
  safety: SafetyTier;
  primary_track: string;
  supported_tracks: string[];
  empirical_scores: Record<string, string>;
  tps_average: number;
  active_params: string;
  capabilities: string[];
  description: string;
}

export interface BestInClassEntry {
  primary: string;
  fallback: string;
  title: string;
}

export interface BridgeStatus {
  connected: boolean;
  bridge_root: string;
  version?: string;
  timestamp?: string;
}

export interface LoadedModelInfo {
  name: string;
  size_vram_gb: number;
  expires_at?: string;
  size_vram?: number;
}

export interface VramTelemetry {
  budget_gb: number;
  used_gb: number;
  free_gb: number;
  utilization_percent: number;
  loaded_models: LoadedModelInfo[];
}

export interface OllamaTagModel {
  name: string;
  modified_at: string;
  size: number;
  size_gb: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface CatalogModelItem {
  model_name: string;
  provider: string;
  tier: string;
  strict_limits: { rpm: number; tpm: number; rpd: number; max_input_tokens?: number; max_output_tokens?: number };
  working_limits: { rpm: number; tpm: number; rpd: number; max_input_tokens?: number; max_output_tokens?: number; thinking_budget?: number };
  safety_margin_percent?: number;
  keys_available?: boolean;
  active_key_count?: number;
}

export interface RegisteredKeyOption {
  id: string;
  key?: string;
  label?: string;
  provider?: string;
  tier?: string;
  safety_margin_percent?: number;
}

export interface SwarmProfile {
  id: string;
  name: string;
  description: string;
  orchestrator: string;
  worker_tier: string;
  default_concurrency: number;
  worker_models?: string[];
  max_models_used?: number;
  routing_strategy?: 'ROUND_ROBIN' | 'QUOTA_WEIGHTED';
  preferred_key_id?: string;
}

export interface SwarmProfilesConfig {
  active_swarm_id: string;
  max_concurrency_workers: number;
  swarms: SwarmProfile[];
  primary_orchestrator?: string;
  orchestrator_engine?: string;
  worker_models?: string[];
  max_models_used?: number;
  routing_strategy?: 'ROUND_ROBIN' | 'QUOTA_WEIGHTED';
  preferred_key_id?: string;
}

// Default Swarm Profiles Matching v6.0 Production Config
const DEFAULT_SWARMS: SwarmProfile[] = [
  {
    id: 'GLOBAL_HYBRID_SWARM',
    name: 'Global Hybrid Adaptive Swarm',
    description: 'Cloud Pro/Ollama 32B for Architecture; Cloud Flash & Local 7B for Parallel Workers.',
    orchestrator: 'qwen2.5-coder:32b',
    worker_tier: 'HIGH_RPM_TPM',
    worker_models: ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'qwen2.5-coder:7b'],
    max_models_used: 2,
    routing_strategy: 'ROUND_ROBIN',
    default_concurrency: 8
  },
  {
    id: 'FULLSTACK_CLOUD_SWARM',
    name: 'High-Throughput Cloud Swarm',
    description: 'Gemini Pro Orchestrator paired with 4,000 RPM Flash/Lite Workers.',
    orchestrator: 'gemini-2.5-pro',
    worker_tier: 'HIGHEST_RPM_TPM',
    worker_models: ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-3.5-flash'],
    max_models_used: 3,
    routing_strategy: 'ROUND_ROBIN',
    default_concurrency: 12
  },
  {
    id: 'AIR_GAPPED_LOCAL_SWARM',
    name: 'Air-Gapped Private Local Swarm',
    description: 'Zero external API calls. Runs exclusively on Ollama local weights.',
    orchestrator: 'qwen2.5-coder:32b',
    worker_tier: 'OFFLINE_PURE',
    worker_models: ['qwen2.5-coder:7b', 'codestral:22b'],
    max_models_used: 2,
    routing_strategy: 'ROUND_ROBIN',
    default_concurrency: 4
  }
];

// Phase 0 Master Orchestrator Options (Now including Groq LPU models)
export const ORCHESTRATOR_OPTIONS = [
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
    id: 'qwen-2.5-coder-32b',
    name: 'Qwen 2.5 Coder 32B (Groq LPU)',
    tier: 'Cloud Groq LPU',
    badge: '⚡ 395 TPS Ultra-Fast',
    tag: 'Groq Cloud',
    desc: 'High-speed Groq LPU reasoning & AST refactoring. 30 RPM, 395 TPS token velocity.'
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq LPU)',
    tier: 'Cloud Groq LPU',
    badge: '⚡ 280 TPS Flagship',
    tag: 'Groq Cloud',
    desc: 'Frontier 70B Reasoning on Groq LPUs. 30 RPM, 128K context window.'
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    tier: 'Cloud Frontier',
    badge: '☁️ 1K RPM | 2M TPM',
    tag: 'Google Cloud',
    desc: 'Next-Gen Premier Architect, Unlimited RPD, 850 RPM Safe Working Limits.'
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B',
    tier: 'Local Flagship',
    badge: '🟢 Pure GPU Safe (60+ TPS)',
    tag: 'Local Ollama',
    desc: 'Primary Sub-8GB Champion. Fits entirely in RTX 4060 8GB VRAM at 60+ TPS.'
  },
  {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    tier: 'Local Reasoning',
    badge: '🟢 Pure GPU Safe (55+ TPS)',
    tag: 'Local Ollama',
    desc: 'Reasoning Champion. Chain-of-thought proofs & zero-cloud-cost debugging at 55+ TPS.'
  },
  {
    id: 'qwen2.5-coder:1.5b',
    name: 'Qwen 2.5 Coder 1.5B',
    tier: 'Local Ultra-Fast',
    badge: '🟢 Pure GPU Safe (90+ TPS)',
    tag: 'Local Ollama',
    desc: 'Lightning Fast Boilerplate Champion. 1.2 GB Footprint running at 90+ TPS.'
  },
  {
    id: 'sqlcoder:7b',
    name: 'SQLCoder 7B',
    tier: 'Local SQL Champion',
    badge: '🟢 Pure GPU Safe (65+ TPS)',
    tag: 'Local Ollama',
    desc: 'Specialized SQL DDL, migrations, and relational query generator at 65+ TPS.'
  },
  {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen 2.5 Coder 32B (Offloaded)',
    tier: 'Local 32B (RAM Paged)',
    badge: '⚠️ 1-2 TPS Offloading',
    tag: 'Local Ollama',
    desc: 'Demoted to non-default. Pages to host RAM on 8GB VRAM, resulting in 1-2 TPS.'
  }
];

// Deliverable 1.1: Returns both color and className identically
export const safeFixed = (val: any, digits: number = 2, fallback: string = '0.00'): string => {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'number' ? val : parseFloat(val);
  return !isNaN(num) && isFinite(num) ? num.toFixed(digits) : fallback;
};

export const formatLimitVal = (val: any): string => {
  if (val === null || val === undefined) return 'Unlimited';
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'unlimited') return 'Unlimited';
    const parsed = parseFloat(val);
    if (isNaN(parsed)) return val;
    val = parsed;
  }
  if (typeof val === 'number') {
    if (val <= 0) return 'Unlimited';
    if (val >= 1000000) return `${(val / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
    return val.toString();
  }
  return String(val);
};

export const SLEEK_SWARM_ROLES_META = [
  {
    role: 'Architect',
    tier: 'HIGH',
    costBadge: 'Cloud Pro/Argon',
    isLocal: false,
    color: 'border-blue-500/40 bg-blue-950/30 text-blue-300',
    desc: 'High-level system design & Phase 0 decomposition',
    preferred: ['gemini-4-argon', 'gemini-2.5-flash', 'qwen2.5-coder:7b']
  },
  {
    role: 'Scaffolder',
    tier: 'LOCAL',
    costBadge: 'Local ($0)',
    isLocal: true,
    color: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300',
    desc: 'File trees, configs, dirs, boilerplate, package setup',
    preferred: ['qwen2.5-coder:7b', 'qwen2.5-coder:1.5b']
  },
  {
    role: 'Coder',
    tier: 'AUTO',
    costBadge: 'Cloud Free / Auto',
    isLocal: false,
    color: 'border-indigo-500/40 bg-indigo-950/30 text-indigo-300',
    desc: 'Core feature logic, complex algorithms & routes',
    preferred: ['gemini-3.6-flash', 'gemini-2.5-flash', 'qwen2.5-coder:7b']
  },
  {
    role: 'Database',
    tier: 'AUTO',
    costBadge: 'Local / Auto ($0)',
    isLocal: true,
    color: 'border-amber-500/40 bg-amber-950/30 text-amber-300',
    desc: 'SQL schemas, migrations, ORM models',
    preferred: ['sqlcoder:7b', 'qwen2.5-coder:7b', 'gemini-2.5-flash']
  },
  {
    role: 'Healer',
    tier: 'LOCAL',
    costBadge: 'Local ($0)',
    isLocal: true,
    color: 'border-purple-500/40 bg-purple-950/30 text-purple-300',
    desc: 'Phase 3 syntax fixes, test retry loops, bug fixing',
    preferred: ['deepseek-r1:8b', 'qwen2.5-coder:7b']
  },
  {
    role: 'Velocity',
    tier: 'FAST',
    costBadge: 'Cloud Free / Fast',
    isLocal: false,
    color: 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300',
    desc: 'High-throughput batch generation & documentation',
    preferred: ['gemini-4-argon', 'gemini-3.5-flash-lite', 'qwen2.5-coder:1.5b']
  }
];

export const getVramSafetyTier = (sizeGb: any): { tier: string; badge: string; color: string; className: string } => {
  const safeSize = (typeof sizeGb === 'number' && !isNaN(sizeGb)) ? sizeGb : 0;
  if (safeSize <= 5.2) {
    const cls = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    return { tier: 'SAFE_GPU', badge: '🟢 Pure GPU Safe', color: cls, className: cls };
  } else if (sizeGb <= 8.0) {
    const cls = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return { tier: 'HIGH_LOAD', badge: '🟡 High VRAM Load', color: cls, className: cls };
  } else if (sizeGb <= 16.0) {
    const cls = 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    return { tier: 'PAGED_HYBRID', badge: '🟡 Hybrid Paged (RAM)', color: cls, className: cls };
  } else {
    const cls = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    return { tier: 'OOM_HAZARDOUS', badge: '🔴 OOM Hazard (>16GB)', color: cls, className: cls };
  }
};

// Deliverable 1.2: Complete catalog including Groq, Google, and Ollama
export const DEFAULT_MODEL_PROFILES: ModelProfile[] = [
  // --- GROQ CLOUD MODELS ---
  {
    id: 'qwen-2.5-coder-32b',
    name: 'qwen-2.5-coder-32b',
    provider: 'GROQ',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '⚡ Cloud Groq LPU',
      description: 'Hosted on Groq Tensor Streaming Processor LPU. 30 RPM, 395 TPS token velocity.'
    },
    primary_track: 'AGENTIC_CODE_FIM',
    supported_tracks: ['AGENTIC_CODE_FIM', 'GENERAL_CODE', 'REFACTORING'],
    empirical_scores: { 'Code FIM': '9.8/10', 'Velocity': '395 TPS', 'Latency': '0.12s' },
    tps_average: 395.0,
    active_params: '32B',
    capabilities: ['LPU Inference', 'Sub-second AST Parsing', 'Zero VRAM Footprint'],
    description: 'Ultra-fast Qwen 32B Code generation hosted on Groq LPUs. Unmatched token generation velocity.'
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'llama-3.3-70b-versatile',
    provider: 'GROQ',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '⚡ Cloud Groq LPU',
      description: 'Flagship open-weights 70B model running at 280 TPS on Groq LPUs.'
    },
    primary_track: 'COT_REASONING',
    supported_tracks: ['COT_REASONING', 'GENERAL_CODE', 'SYSTEM_ARCHITECTURE'],
    empirical_scores: { 'Reasoning': '9.7/10', 'Velocity': '280 TPS', 'Context': '128k' },
    tps_average: 280.0,
    active_params: '70B',
    capabilities: ['High Context Horizon', 'Deep Multi-Hop Synthesis', 'LPU Acceleration'],
    description: 'Meta flagship Llama 3.3 70B running at full speed on Groq LPUs for architecture and reasoning.'
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'llama-3.1-8b-instant',
    provider: 'GROQ',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '⚡ Cloud Groq LPU',
      description: 'Blazing fast 750+ TPS lightweight worker for sub-agent tooling and verification.'
    },
    primary_track: 'FAST_ROUTING',
    supported_tracks: ['FAST_ROUTING', 'TOOL_DISPATCH', 'SYNTAX_VALIDATION'],
    empirical_scores: { 'Velocity': '750 TPS', 'Tool Call': '9.5/10', 'Latency': '0.08s' },
    tps_average: 750.0,
    active_params: '8B',
    capabilities: ['Instant Response', 'High RPM Tooling', 'Deterministic Routing'],
    description: 'Lightning-fast 750 TPS lightweight worker for routing, linting, and rapid tooling verification.'
  },

  // --- GOOGLE GEMINI CLOUD MODELS ---
  {
    id: 'gemini-3.1-pro-preview',
    name: 'gemini-3.1-pro-preview',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: 'Hosted on Google Cloud TPU v5e clusters. 25-150 RPM quota tier.'
    },
    primary_track: 'SYSTEM_ARCHITECTURE',
    supported_tracks: ['SYSTEM_ARCHITECTURE', 'COT_REASONING', 'AGENTIC_CODE_FIM'],
    empirical_scores: { 'Reasoning': '9.9/10', 'Code': '9.8/10', 'Context': '2M' },
    tps_average: 68.0,
    active_params: 'Frontier Mixture',
    capabilities: ['2M Context Window', 'Multi-file Reasoning', 'Complex Architecture'],
    description: 'Google frontier multimodal architect model with 2M context window.'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'gemini-2.5-pro',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: 'Hosted on Google Cloud TPU v5e clusters. 150 RPM tier.'
    },
    primary_track: 'SYSTEM_ARCHITECTURE',
    supported_tracks: ['SYSTEM_ARCHITECTURE', 'COT_REASONING', 'GENERAL_CODE'],
    empirical_scores: { 'Reasoning': '9.8/10', 'Architecture': '9.9/10', 'FIM': '9.5/10' },
    tps_average: 65.0,
    active_params: 'Enterprise Pro',
    capabilities: ['1M Context Window', 'Exhaustive Decomposition', 'AST Verification'],
    description: 'Enterprise production-grade system architect with high accuracy and deep reasoning.'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'gemini-3.6-flash',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: '1,000 RPM cloud fast tier. Ideal for concurrent sub-agent swarms.'
    },
    primary_track: 'AGENTIC_CODE_FIM',
    supported_tracks: ['AGENTIC_CODE_FIM', 'GENERAL_CODE', 'TOOL_CALLING'],
    empirical_scores: { 'Velocity': '140 TPS', 'Code': '9.6/10', 'Tools': '9.7/10' },
    tps_average: 140.0,
    active_params: 'Fast MoE',
    capabilities: ['2M Context Horizon', '1,000 RPM Throughput', 'Low Latency'],
    description: 'Next-gen balanced flash model optimized for parallel coding workers.'
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'gemini-3.5-flash-lite',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: '4,000 RPM high throughput tier for boilerplate and linting.'
    },
    primary_track: 'FAST_BOILERPLATE',
    supported_tracks: ['FAST_BOILERPLATE', 'TOOL_DISPATCH'],
    empirical_scores: { 'Velocity': '210 TPS', 'Boilerplate': '9.4/10' },
    tps_average: 210.0,
    active_params: 'Lite Flash',
    capabilities: ['Ultra High RPM', 'Instant Turnaround', 'Cost Optimized'],
    description: 'Maximum throughput sub-agent model for boilerplate and documentation.'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'gemini-2.5-flash',
    provider: 'GOOGLE_GEMINI',
    size_gb: 0.0,
    safety: {
      tier: 'CLOUD_UNMETERED',
      badge: '☁️ Cloud Hosted',
      description: '1,000 RPM high throughput tier.'
    },
    primary_track: 'GENERAL_CODE',
    supported_tracks: ['GENERAL_CODE', 'TOOL_CALLING'],
    empirical_scores: { 'Velocity': '125 TPS', 'Code': '9.5/10' },
    tps_average: 125.0,
    active_params: 'Flash Base',
    capabilities: ['1M Context', 'Parallel Workers', 'Consistent Tool Calling'],
    description: 'Workhorse cloud worker model for general purpose code generation.'
  },

  // --- LOCAL OLLAMA MODELS ---
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
      tier: 'PAGED_HYBRID',
      badge: '🟡 Hybrid Paged (RAM)',
      description: 'Heavyweight model. Pages layers into system memory via PCIe.'
    },
    primary_track: 'AGENTIC_CODE_FIM',
    supported_tracks: ['AGENTIC_CODE_FIM', 'SYSTEM_ARCHITECTURE', 'COT_REASONING'],
    empirical_scores: { 'Code FIM': '9.7/10', 'Architecture': '9.8/10', 'Refactor': '9.5/10' },
    tps_average: 24.1,
    active_params: '32.5B',
    capabilities: ['Complex AST Introspection', 'Autonomous Architecture', 'Multi-File Patching'],
    description: 'Heavyweight local architect capable of full codebase refactoring.'
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'qwen2.5-coder:7b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.7,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Fits entirely within RTX 4060 8GB VRAM. 0s offload latency.'
    },
    primary_track: 'GENERAL_CODE',
    supported_tracks: ['GENERAL_CODE', 'FAST_BOILERPLATE', 'TOOL_CALLING'],
    empirical_scores: { 'Code': '9.3/10', 'Velocity': '68 TPS', 'Safety': '10/10' },
    tps_average: 68.2,
    active_params: '7.6B',
    capabilities: ['Zero CPU Overhead', '68+ TPS Velocity', 'Sub-second AST'],
    description: 'Fast pure GPU worker model delivering zero latency on 8GB VRAM.'
  },
  {
    id: 'sqlcoder:7b',
    name: 'sqlcoder:7b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.8,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Specialized SQL model. Runs in pure GPU VRAM.'
    },
    primary_track: 'SQL_DATABASE',
    supported_tracks: ['SQL_DATABASE', 'SCHEMA_MIGRATIONS', 'ANALYTICS_QUERY'],
    empirical_scores: { 'SQL Gen': '9.9/10', 'DDL Migration': '9.7/10', 'Schema': '9.8/10' },
    tps_average: 62.5,
    active_params: '7B',
    capabilities: ['SQL Synthesis', 'PostgreSQL / SQLite Native', 'Zero Halucination'],
    description: 'Premier SQL and schema engine for relational database engineering.'
  },
  {
    id: 'llama3-groq-tool-use:8b',
    name: 'llama3-groq-tool-use:8b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 4.9,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Strict tool calling model running locally.'
    },
    primary_track: 'TOOL_CALLING',
    supported_tracks: ['TOOL_CALLING', 'STRICT_JSON', 'API_DISPATCH'],
    empirical_scores: { 'Tool Call': '9.8/10', 'JSON Syntax': '9.9/10', 'Schema': '9.6/10' },
    tps_average: 59.8,
    active_params: '8B',
    capabilities: ['Strict JSON Mode', 'Zero Syntax Drift', 'Structured Schema Output'],
    description: 'Specialized function-calling and tool routing engine.'
  },
  {
    id: 'deepseek-r1:8b',
    name: 'deepseek-r1:8b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 5.1,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Reasoning model fitting in 8GB VRAM.'
    },
    primary_track: 'COT_REASONING',
    supported_tracks: ['COT_REASONING', 'ALGORITHMIC_PROOF', 'ROOT_CAUSE_ANALYSIS'],
    empirical_scores: { 'Reasoning': '9.8/10', 'Math/Logic': '9.7/10', 'Proof': '9.6/10' },
    tps_average: 44.5,
    active_params: '8B',
    capabilities: ['Chain-of-Thought', 'Reflective Self-Correction', 'Step-by-Step Logic'],
    description: 'DeepSeek R1 reasoning engine for mathematical proofs and logic diagnosis.'
  },
  {
    id: 'qwen2.5-coder:1.5b',
    name: 'qwen2.5-coder:1.5b',
    provider: 'OLLAMA_LOCAL',
    size_gb: 1.2,
    safety: {
      tier: 'SAFE_GPU',
      badge: '🟢 Pure GPU Safe',
      description: 'Lightweight boilerplate engine. Uses only 1.2 GB VRAM.'
    },
    primary_track: 'FAST_BOILERPLATE',
    supported_tracks: ['FAST_BOILERPLATE', 'DOCSTRING_GEN', 'TYPE_ANNOTATIONS'],
    empirical_scores: { 'Velocity': '112 TPS', 'Boilerplate': '9.2/10', 'Typing': '9.5/10' },
    tps_average: 112.4,
    active_params: '1.5B',
    capabilities: ['112+ TPS Velocity', 'Instant Turnaround', 'Minimal Footprint'],
    description: 'Ultra-lightweight local model for documentation, typing, and scaffolding.'
  }
];

export const DEFAULT_BEST_IN_CLASS: Record<string, BestInClassEntry> = {
  AGENTIC_CODE_FIM: {
    primary: 'codestral:22b',
    fallback: 'qwen-2.5-coder-32b',
    title: 'Agentic Code (FIM)'
  },
  SQL_DATABASE: {
    primary: 'sqlcoder:7b',
    fallback: 'qwen2.5-coder:7b',
    title: 'SQL Analytics & Schema'
  },
  TOOL_CALLING: {
    primary: 'llama3-groq-tool-use:8b',
    fallback: 'llama-3.1-8b-instant',
    title: 'Strict Tool Calling'
  },
  COT_REASONING: {
    primary: 'deepseek-r1:8b',
    fallback: 'llama-3.3-70b-versatile',
    title: 'CoT Reasoning & Logic'
  },
  FAST_BOILERPLATE: {
    primary: 'qwen2.5-coder:1.5b',
    fallback: 'gemini-3.5-flash-lite',
    title: 'Fast Boilerplate'
  }
};

// ============================================================================
// MAIN COMPONENT: AGENT & MODEL HUB
// ============================================================================

export const AgentHub: React.FC = () => {
  const navigate = useNavigate();

  // Tab Navigation: 'matrix' | 'vram' | 'swarms'
  const [activeTab, setActiveTab] = useState<'matrix' | 'vram' | 'swarms'>('matrix');

  // Data States
  const [models, setModels] = useState<ModelProfile[]>(DEFAULT_MODEL_PROFILES);
  const [bestInClass, setBestInClass] = useState<Record<string, BestInClassEntry>>(DEFAULT_BEST_IN_CLASS);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  // Progressive Disclosure: Collapsible sections & cards
  const [championsExpanded, setChampionsExpanded] = useState<boolean>(false);
  const [expandedModelIds, setExpandedModelIds] = useState<Record<string, boolean>>({});
  const [simExpanded, setSimExpanded] = useState<boolean>(true);
  const [expandedTagIds, setExpandedTagIds] = useState<Record<string, boolean>>({});
  const [expandedSwarmNotes, setExpandedSwarmNotes] = useState<Record<string, boolean>>({});

  // Filters & Search (Multi-Provider Support)
  const [providerFilter, setProviderFilter] = useState<'ALL' | 'GOOGLE_GEMINI' | 'GROQ' | 'OLLAMA_LOCAL'>('ALL');
  const [safetyFilter, setSafetyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Tab 2 (VRAM Arbitrator & Local Ollama Engine) States
  const [vramData, setVramData] = useState<VramTelemetry | null>(null);
  const [ollamaTags, setOllamaTags] = useState<OllamaTagModel[]>([]);
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
  const [activeWorkerModels, setActiveWorkerModels] = useState<string[]>([
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'qwen2.5-coder:7b'
  ]);
  const [activeMaxModelsUsed, setActiveMaxModelsUsed] = useState<number>(2);
  const [activeRoutingStrategy, setActiveRoutingStrategy] = useState<'ROUND_ROBIN' | 'QUOTA_WEIGHTED'>('ROUND_ROBIN');
  const [activePreferredKeyId, setActivePreferredKeyId] = useState<string>('AUTO');
  const [catalogModels, setCatalogModels] = useState<CatalogModelItem[]>([]);
  const [registeredKeys, setRegisteredKeys] = useState<RegisteredKeyOption[]>([]);
  const [rosterFilter, setRosterFilter] = useState<'ALL' | 'GOOGLE_FREE' | 'GOOGLE_PAID' | 'GROQ_FREE' | 'GROQ_PAID' | 'OLLAMA_LOCAL'>('ALL');
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

  // Copy to clipboard helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedModelId(id);
    setTimeout(() => setCopiedModelId(null), 2000);
  };

  // Toggle card expansion
  const toggleExpandModel = (id: string) => {
    setExpandedModelIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Provider badge helper
  const getProviderInfo = (provider: string) => {
    const p = (provider || '').toUpperCase();
    if (p.includes('GEMINI') || p.includes('GOOGLE')) {
      return {
        name: 'Google Cloud',
        badge: '☁️ Google',
        cls: 'bg-blue-950/60 text-blue-300 border-blue-800/50'
      };
    }
    if (p.includes('GROQ')) {
      return {
        name: 'Groq Cloud',
        badge: '⚡ Groq',
        cls: 'bg-amber-950/60 text-amber-300 border-amber-800/50'
      };
    }
    return {
      name: 'Local Ollama',
      badge: '💻 Ollama',
      cls: 'bg-purple-950/60 text-purple-300 border-purple-800/50'
    };
  };

  // ----------------------------------------------------------------------------
  // DATA FETCHING & SYNCHRONIZATION
  // ----------------------------------------------------------------------------
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
          // Ensure Groq and Google profiles exist in list
          DEFAULT_MODEL_PROFILES.forEach((dm) => {
            if (!merged.some((m: ModelProfile) => m.name === dm.name || m.id === dm.id)) {
              merged.push(dm);
            }
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

      // 5. Fetch Dynamic Swarm Profiles, Model Catalog & Keys
      try {
        const [swarmsRes, catRes, keysRes] = await Promise.all([
          fetch('/api/swarms/profiles'),
          fetch('/api/models/catalog'),
          fetch('/api/keys')
        ]);

        if (swarmsRes.ok) {
          const swData = await swarmsRes.json();
          setSwarmConfig(swData);
          if (swData.active_swarm_id) setActiveSwarmId(swData.active_swarm_id);
          if (swData.primary_orchestrator) setOrchestratorEngine(swData.primary_orchestrator);
          if (swData.orchestrator_engine) setOrchestratorEngine(swData.orchestrator_engine);
          if (swData.worker_models && swData.worker_models.length > 0) {
            setActiveWorkerModels(swData.worker_models);
          }
          if (swData.max_models_used) setActiveMaxModelsUsed(swData.max_models_used);
          if (swData.routing_strategy) setActiveRoutingStrategy(swData.routing_strategy);
          if (swData.preferred_key_id) setActivePreferredKeyId(swData.preferred_key_id);
          if (swData.max_concurrency_workers) setMaxConcurrency(swData.max_concurrency_workers);
          if (swData.swarms && Array.isArray(swData.swarms)) setCustomSwarms(swData.swarms);
        }

        if (catRes.ok) {
          const cData = await catRes.json();
          if (cData.catalog) {
            const flattened: CatalogModelItem[] = [];
            Object.values(cData.catalog).forEach((provObj: any) => {
              Object.values(provObj).forEach((tierObj: any) => {
                if (tierObj?.models && Array.isArray(tierObj.models)) {
                  flattened.push(...tierObj.models);
                }
              });
            });
            setCatalogModels(flattened);
          }
        }

        if (keysRes.ok) {
          const kData = await keysRes.json();
          if (kData.keys) setRegisteredKeys(kData.keys);
        }
      } catch (e) {
        console.warn('Swarm profiles or catalog fetch error:', e);
      }
    } catch (err) {
      console.error('Failed to load Agent Hub bridge data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBridgeData();
    const interval = setInterval(fetchBridgeData, 10000);
    return () => clearInterval(interval);
  }, [fetchBridgeData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchBridgeData();
  };

  // ----------------------------------------------------------------------------
  // TAB 2: VRAM ARBITRATOR ACTIONS
  // ----------------------------------------------------------------------------
  const handleScavengeAll = async () => {
    setScavenging(true);
    setScavengeMsg(null);
    try {
      const res = await fetch('/api/bridge/vram/scavenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.status === 'success') {
        setScavengeMsg({ text: 'All idle model weights successfully purged from VRAM.', success: true });
        if (data.vram) setVramData(data.vram);
      } else {
        setScavengeMsg({ text: data.result?.message || 'Purge finished with warnings.', success: false });
      }
    } catch (err: any) {
      setScavengeMsg({ text: `Failed to purge VRAM: ${err.message}`, success: false });
    } finally {
      setScavenging(false);
      setTimeout(() => setScavengeMsg(null), 4000);
    }
  };

  const handleUnloadModel = async (modelName: string) => {
    try {
      const res = await fetch(`/api/bridge/vram/scavenge?model_name=${encodeURIComponent(modelName)}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.vram) setVramData(data.vram);
      fetchBridgeData();
    } catch (err) {
      console.error('Failed to unload model:', err);
    }
  };

  // ----------------------------------------------------------------------------
  // TAB 2: CO-RESIDENCY SIMULATOR CALCULATIONS
  // ----------------------------------------------------------------------------
  const orchestratorFootprint = useMemo(() => {
    const found = models.find((m) => m.name === simOrchestrator || m.id === simOrchestrator);
    return found ? found.size_gb : 4.7;
  }, [simOrchestrator, models]);

  const workerFootprint = useMemo(() => {
    const found = models.find((m) => m.name === simWorker || m.id === simWorker);
    return found ? found.size_gb : 1.2;
  }, [simWorker, models]);

  const contextFootprint = useMemo(() => {
    return simContextOverhead;
  }, [simContextOverhead]);

  const totalSimFootprint = useMemo(() => {
    const sumFp = (orchestratorFootprint || 0) + (workerFootprint || 0) + (contextFootprint || 0); return +(safeFixed(sumFp, 2, "0.00"));
  }, [orchestratorFootprint, workerFootprint, contextFootprint]);

  // Deliverable 1.1: simVerdict returns both badgeColor and className identically
  const simVerdict = useMemo(() => {
    if (totalSimFootprint <= 7.2) {
      const cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      return {
        badge: '🟢 Co-Residency Safe (Both models fit in Pure VRAM)',
        badgeColor: cls,
        className: cls,
        description:
          'Zero CPU offloading. Peak GDDR6 token velocity with zero PCIe offload latency across both orchestrator and worker models simultaneously.'
      };
    } else if (totalSimFootprint <= 8.5) {
      const cls = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      return {
        badge: '🟡 Partial RAM Offload (Slight TPS reduction)',
        badgeColor: cls,
        className: cls,
        description:
          'Combined weights exceed 7.2 GB operational target. Windows/CUDA driver will page overflow layers into system RAM via PCIe, causing minor token generation latency (~20-40% TPS degradation).'
      };
    } else {
      const cls = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      return {
        badge: '🔴 VRAM Overflow Warning (Models will swap/thrash)',
        badgeColor: cls,
        className: cls,
        description:
          'Footprint exceeds 8.0 GB VRAM boundary significantly. High risk of memory thrashing or CUDA Out-Of-Memory. Switch worker to lightweight qwen2.5-coder:1.5b (1.2 GB) or run models sequentially in serial mode.'
      };
    }
  }, [totalSimFootprint]);

  // ----------------------------------------------------------------------------
  // TAB 3: SWARM PROFILES & ORCHESTRATOR ACTIONS
  // ----------------------------------------------------------------------------
  const handleSaveSwarmConfig = async (
    overrideActiveId?: string,
    overrideOrch?: string,
    overrideWorkerModels?: string[],
    overrideMaxModels?: number,
    overrideRouting?: 'ROUND_ROBIN' | 'QUOTA_WEIGHTED',
    overrideKeyId?: string
  ) => {
    setSwarmSaving(true);
    setSwarmSaveMsg(null);

    const activeId = overrideActiveId || activeSwarmId;
    const orch = overrideOrch || orchestratorEngine;
    const workers = overrideWorkerModels || activeWorkerModels;
    const maxMod = overrideMaxModels || activeMaxModelsUsed;
    const routing = overrideRouting || activeRoutingStrategy;
    const keyId = overrideKeyId || activePreferredKeyId;

    const payload: SwarmProfilesConfig = {
      active_swarm_id: activeId,
      max_concurrency_workers: maxConcurrency,
      primary_orchestrator: orch,
      orchestrator_engine: orch,
      worker_models: workers,
      max_models_used: maxMod,
      routing_strategy: routing,
      preferred_key_id: keyId,
      swarms: customSwarms.map((s) => {
        if (s.id === activeId) {
          return {
            ...s,
            orchestrator: orch,
            worker_models: workers,
            max_models_used: maxMod,
            routing_strategy: routing,
            default_concurrency: maxConcurrency
          };
        }
        return s;
      })
    };

    try {
      const res = await fetch('/api/swarms/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSwarmConfig(payload);
        if (overrideActiveId) setActiveSwarmId(overrideActiveId);
        if (overrideOrch) setOrchestratorEngine(overrideOrch);
        setSwarmSaveMsg({ text: 'Swarm profile, multi-model roster & 85% limits saved & activated successfully!', success: true });
      } else {
        setSwarmSaveMsg({ text: 'Failed to persist swarm configuration.', success: false });
      }
    } catch (err: any) {
      setSwarmSaveMsg({ text: `Save error: ${err.message}`, success: false });
    } finally {
      setSwarmSaving(false);
      setTimeout(() => setSwarmSaveMsg(null), 4000);
    }
  };

  const handleToggleActiveWorker = (mName: string) => {
    setActiveWorkerModels((prev) => {
      if (prev.includes(mName)) {
        if (prev.length <= 1) return prev;
        const updated = prev.filter((m) => m !== mName);
        if (activeMaxModelsUsed > updated.length) setActiveMaxModelsUsed(updated.length);
        return updated;
      } else {
        return [...prev, mName];
      }
    });
  };

  const filteredCatalogModels = useMemo(() => {
    if (!catalogModels || catalogModels.length === 0) return [];
    return catalogModels.filter((m) => {
      if (rosterFilter === 'ALL') return true;
      if (rosterFilter === 'GOOGLE_FREE') return m.provider === 'GOOGLE' && m.tier === 'FREE';
      if (rosterFilter === 'GOOGLE_PAID') return m.provider === 'GOOGLE' && m.tier === 'PAID';
      if (rosterFilter === 'GROQ_FREE') return m.provider === 'GROQ' && m.tier === 'FREE';
      if (rosterFilter === 'GROQ_PAID') return m.provider === 'GROQ' && m.tier === 'PAID';
      if (rosterFilter === 'OLLAMA_LOCAL') return m.provider === 'OLLAMA';
      return true;
    });
  }, [catalogModels, rosterFilter]);

  const handleSetAsOrchestrator = (modelId: string) => {
    setOrchestratorEngine(modelId);
    handleSaveSwarmConfig(activeSwarmId, modelId);
  };

  const handleAddCustomSwarm = () => {
    setCreateSwarmError(null);
    if (!newSwarmName.trim() || !newSwarmId.trim()) {
      setCreateSwarmError('Please enter both a Swarm Name and unique ID.');
      return;
    }

    const cleanId = newSwarmId.trim().toUpperCase().replace(/\s+/g, '_');
    if (customSwarms.some((s) => s.id === cleanId)) {
      setCreateSwarmError(`A swarm profile with ID '${cleanId}' already exists.`);
      return;
    }

    const newProfile: SwarmProfile = {
      id: cleanId,
      name: newSwarmName.trim(),
      description: newSwarmDesc.trim() || 'Custom user configured swarm team.',
      orchestrator: newSwarmOrchestrator,
      worker_tier: newSwarmTier,
      default_concurrency: newSwarmConcurrency
    };

    const updated = [...customSwarms, newProfile];
    setCustomSwarms(updated);
    setShowCreateSwarm(false);
    setNewSwarmName('');
    setNewSwarmId('');
    setNewSwarmDesc('');

    // Persist immediately
    const payload: SwarmProfilesConfig = {
      active_swarm_id: activeSwarmId,
      max_concurrency_workers: maxConcurrency,
      primary_orchestrator: orchestratorEngine,
      swarms: updated
    };
    fetch('/api/swarms/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  // ----------------------------------------------------------------------------
  // FILTERING LOGIC
  // ----------------------------------------------------------------------------
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      // 1. Provider Filter
      if (providerFilter !== 'ALL') {
        const provUpper = (m.provider || '').toUpperCase();
        if (providerFilter === 'GOOGLE_GEMINI' && !provUpper.includes('GEMINI') && !provUpper.includes('GOOGLE')) return false;
        if (providerFilter === 'GROQ' && !provUpper.includes('GROQ')) return false;
        if (providerFilter === 'OLLAMA_LOCAL' && !provUpper.includes('OLLAMA')) return false;
      }

      // 2. Safety Tier Filter
      if (safetyFilter !== 'ALL') {
        if (m.safety?.tier !== safetyFilter) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = m.name.toLowerCase().includes(q);
        const trackMatch = m.primary_track?.toLowerCase().includes(q);
        const descMatch = m.description?.toLowerCase().includes(q);
        const capsMatch = m.capabilities?.some((c) => c.toLowerCase().includes(q));
        if (!nameMatch && !trackMatch && !descMatch && !capsMatch) return false;
      }

      return true;
    });
  }, [models, providerFilter, safetyFilter, searchQuery]);

  const filteredTags = useMemo(() => {
    return ollamaTags.filter((t) => {
      if (!tagSearchQuery.trim()) return true;
      const q = tagSearchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.details?.family?.toLowerCase().includes(q);
    });
  }, [ollamaTags, tagSearchQuery]);

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. COMPACT TOP BAR & 3-TAB SWITCHER                                  */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Left: Title & Bridge Status Pill */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>Agent & Model Hub</span>
              </h2>
              <p className="text-xs text-slate-400">
                Capability matrices, 8GB VRAM arbitrator, and swarm roster builder
              </p>
            </div>

            {/* Bridge Status Pill */}
            {bridgeStatus?.connected ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Suite Connected</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/70 text-amber-300 border border-amber-800/60 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Standalone Mode</span>
              </span>
            )}
          </div>

          {/* Right Quick Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* 1. Provider Quick-Filter Dropdown */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs shadow-inner">
              <Filter className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <select
                aria-label="Provider Quick Filter"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value as any)}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer"
                title="Filter models by provider"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">All Providers</option>
                <option value="GOOGLE_GEMINI" className="bg-slate-900 text-slate-200">☁️ Google Cloud</option>
                <option value="GROQ" className="bg-slate-900 text-slate-200">⚡ Groq Cloud LPU</option>
                <option value="OLLAMA_LOCAL" className="bg-slate-900 text-slate-200">💻 Local Ollama</option>
              </select>
            </div>

            {/* 2. Active Swarm Quick-Select Dropdown */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs shadow-inner">
              <Sliders className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <select
                aria-label="Active Swarm Quick Select"
                value={activeSwarmId}
                onChange={(e) => {
                  const sId = e.target.value;
                  setActiveSwarmId(sId);
                  handleSaveSwarmConfig(sId);
                }}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[150px] truncate"
                title="Switch active swarm roster profile"
              >
                {customSwarms.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Global Logs Shortcut Button */}
            <button
              onClick={() => navigate('/logs')}
              title="Jump to Full-Screen Log Center"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 text-xs font-semibold text-blue-300 transition-colors shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="hidden sm:inline">📜 Global Logs</span>
            </button>

            {/* 4. Sync Button */}
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              title="Refresh bridge models, VRAM, and swarm telemetry"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold border border-slate-700 transition-colors shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* 3-Tab Switcher Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>1. Model Matrix</span>
            <span className="bg-black/40 text-slate-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {filteredModels.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('vram')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'vram'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>2. VRAM Arbitrator (8GB)</span>
            {vramData && (
              <span className="bg-black/40 text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {safeFixed(vramData?.used_gb, 1, "0.0")} / 8.0 GB
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('swarms')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'swarms'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>3. Swarm & Role Builder</span>
            <span className="bg-black/40 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {customSwarms.length} Swarms
            </span>
          </button>
        </div>
      </div>

      {/* Global Toast Feedback */}
      {scavengeMsg && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs shadow-md animate-fade-in border ${
            scavengeMsg.success
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
              : 'bg-amber-950/70 border-amber-800 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{scavengeMsg.text}</span>
          </div>
          <button onClick={() => setScavengeMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {swarmSaveMsg && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs shadow-md animate-fade-in border ${
            swarmSaveMsg.success
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/70 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{swarmSaveMsg.text}</span>
          </div>
          <button onClick={() => setSwarmSaveMsg(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: MODEL MATRIX (Minimalist Cards + Expandable Details)           */}
      {/* ==================================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-5">
          {/* 1. Collapsible Empirical Champions Strip */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏆 Best-in-Class Empirical Champions (5 Tracks)</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
                  (Curated from multi-model empirical test suites)
                </span>
              </div>

              <button
                onClick={() => setChampionsExpanded(!championsExpanded)}
                className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors shrink-0"
              >
                <span>{championsExpanded ? 'Hide Champions' : 'Show Champions'}</span>
                {championsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {championsExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3 pt-3 border-t border-slate-800 animate-fade-in">
                {Object.entries(bestInClass).map(([key, champion]) => (
                  <div key={key} className="bg-slate-950 border border-slate-800/90 rounded-lg p-3 space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase truncate">{champion.title}</div>
                    <div className="font-mono text-xs font-bold text-white truncate">{champion.primary}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">Fallback: {champion.fallback}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Compact Filter & Search Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl shadow-black/20 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Provider Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-400 mr-1">Provider:</span>
              <button
                onClick={() => setProviderFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  providerFilter === 'ALL'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All ({models.length})
              </button>
              <button
                onClick={() => setProviderFilter('GOOGLE_GEMINI')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  providerFilter === 'GOOGLE_GEMINI'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ☁️ Google
              </button>
              <button
                onClick={() => setProviderFilter('GROQ')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  providerFilter === 'GROQ'
                    ? 'bg-amber-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ⚡ Groq LPU
              </button>
              <button
                onClick={() => setProviderFilter('OLLAMA_LOCAL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  providerFilter === 'OLLAMA_LOCAL'
                    ? 'bg-purple-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                💻 Local Ollama
              </button>
            </div>

            {/* Hardware Safety Dropdown & Search Input */}
            <div className="flex items-center gap-2">
              <select
                aria-label="Hardware Safety Filter"
                value={safetyFilter}
                onChange={(e) => setSafetyFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="ALL">Safety: All Tiers</option>
                <option value="SAFE_GPU">🟢 Pure GPU Safe (&le;5.2GB)</option>
                <option value="PAGED_HYBRID">🟡 Hybrid Paged (&le;16GB)</option>
                <option value="OOM_HAZARDOUS">🔴 OOM Hazard (&gt;16GB)</option>
                <option value="CLOUD_UNMETERED">☁️ Cloud Hosted</option>
              </select>

              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search model or track..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Minimalist Model Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredModels.map((model, idx) => {
              const prov = getProviderInfo(model.provider);
              const isExpanded = Boolean(expandedModelIds[model.id || model.name]);
              const safety = model.safety?.tier ? model.safety : getVramSafetyTier(model.size_gb);
              const safetyCls = safety.className || safety.color || 'text-slate-400 bg-slate-800 border-slate-700';

              return (
                <div
                  key={`${model.id || model.name}-${idx}`}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 shadow-lg transition-all space-y-3"
                >
                  {/* Row 1: Model Name, Copy Button & Provider Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-sm text-white truncate" title={model.name}>
                        {model.name}
                      </span>
                      <button
                        onClick={() => copyToClipboard(model.name, model.id || model.name)}
                        className="text-slate-500 hover:text-slate-300 p-0.5"
                        title="Copy model identifier"
                      >
                        {copiedModelId === (model.id || model.name) ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${prov.cls}`}>
                      {prov.badge}
                    </span>
                  </div>

                  {/* Row 2: Track Pill, Safety Pill & Details Toggle */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/70 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {model.primary_track}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${safetyCls}`}>
                        {model.safety?.badge || (model.size_gb === 0 ? '☁️ Cloud' : '⚡ Local')}
                      </span>
                      {model.tps_average > 0 && (
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                          {Math.round(model.tps_average)} TPS
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => toggleExpandModel(model.id || model.name)}
                      className="flex items-center gap-0.5 text-[11px] font-semibold text-blue-400 hover:text-blue-300 shrink-0 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Details ▴' : 'Details ▾'}</span>
                    </button>
                  </div>

                  {/* Expandable Drawer */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-3 text-xs animate-fade-in">
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {model.description}
                      </p>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Params</div>
                          <div className="font-mono font-bold text-white text-xs">{model.active_params || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">VRAM / Weight</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {model.size_gb > 0 ? `${model.size_gb} GB` : 'Cloud Hosted'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Throughput</div>
                          <div className="font-mono font-bold text-emerald-400 text-xs">
                            {model.tps_average > 0 ? `${Math.round(model.tps_average)} TPS` : 'Cloud Auto'}
                          </div>
                        </div>
                      </div>

                      {/* Empirical Scores */}
                      {model.empirical_scores && Object.keys(model.empirical_scores).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400 font-semibold">Audit Scores:</span>
                          {Object.entries(model.empirical_scores).map(([k, v]) => (
                            <span key={k} className="text-[10px] px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 font-mono border border-slate-700/60">
                              {k}: <strong className="text-blue-300">{v}</strong>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Capabilities tags */}
                      {model.capabilities && model.capabilities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {model.capabilities.map((cap, cIdx) => (
                            <span key={cIdx} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-800/40">
                              {cap}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 1-Click Set as Phase 0 Orchestrator Button */}
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => handleSetAsOrchestrator(model.id || model.name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Set as Phase 0 Orchestrator</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: VRAM ARBITRATOR (8GB) & CO-RESIDENCY SIMULATOR                */}
      {/* ==================================================================== */}
      {activeTab === 'vram' && (
        <div className="space-y-5">
          {/* 1. Compact RTX 4060 8.0 GB Live Telemetry Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>NVIDIA RTX 4060 8.0 GB Hardware VRAM Arbitrator</span>
                </h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span>Used: <strong className="text-amber-400">{safeFixed(vramData?.used_gb, 2, "0.00")} GB</strong></span>
                  <span>•</span>
                  <span>Free Headroom: <strong className="text-emerald-400">{safeFixed(vramData?.free_gb, 2, "8.00")} GB</strong></span>
                  <span>•</span>
                  <span>Resident Models: <strong className="text-white">{vramData?.loaded_models?.length || 0}</strong></span>
                </div>
              </div>

              {/* Scavenge & Flush Button */}
              <button
                onClick={handleScavengeAll}
                disabled={scavenging}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-900/30 cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <Trash2 className={`w-3.5 h-3.5 ${scavenging ? 'animate-spin' : ''}`} />
                <span>{scavenging ? 'Purging VRAM...' : '🔥 Scavenge & Flush Idle VRAM'}</span>
              </button>
            </div>

            {/* 8.0 GB Visual Progress Bar */}
            <div className="space-y-1">
              <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex">
                <div
                  style={{ width: `${Math.min(100, Math.max(0, ((vramData?.used_gb || 0) / 8.0) * 100))}%` }}
                  className={`h-full transition-all duration-300 ${
                    (vramData?.used_gb || 0) > 7.2 ? 'bg-rose-500' : (vramData?.used_gb || 0) > 5.0 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Loaded Models Chips with Unload Buttons */}
            {vramData?.loaded_models && vramData.loaded_models.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 font-semibold">Active in Memory:</span>
                {vramData.loaded_models.map((mod, idx) => (
                  <div
                    key={`${mod.name}-${idx}`}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                  >
                    <span className="font-mono text-white font-medium">{mod.name}</span>
                    <span className="text-[10px] text-amber-400 font-mono font-bold">
                      {safeFixed(mod.size_vram_gb ?? (mod.size_vram ? mod.size_vram / 1073741824 : 0), 1, "0.0")} GB
                    </span>
                    <button
                      onClick={() => handleUnloadModel(mod.name)}
                      className="text-slate-500 hover:text-rose-400 p-0.5"
                      title="Unload model weights"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Collapsible Dual-Model Co-Residency Simulator */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/20">
            {/* Simulator Header / Summary Bar */}
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>🧪 Co-Residency Simulator</span>
                </h4>
                {/* Live Verdict Pill in Header */}
                <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${simVerdict.className}`}>
                  {safeFixed(totalSimFootprint, 2, "0.00")} / 8.00 GB • {simVerdict.badge.split('(')[0].trim()}
                </span>
              </div>

              <button
                onClick={() => setSimExpanded(!simExpanded)}
                className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors self-start sm:self-auto"
              >
                <span>{simExpanded ? 'Collapse Simulator' : 'Expand Simulator'}</span>
                {simExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Simulator Body */}
            {simExpanded && (
              <div className="p-5 border-t border-slate-800 space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Orchestrator Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Primary Orchestrator</label>
                    <select
                      value={simOrchestrator}
                      onChange={(e) => setSimOrchestrator(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (4.7 GB)</option>
                      <option value="codestral:22b">codestral:22b (12.2 GB - Paged)</option>
                      <option value="qwen2.5-coder:14b">qwen2.5-coder:14b (9.0 GB - Paged)</option>
                      <option value="deepseek-r1:8b">deepseek-r1:8b (5.1 GB)</option>
                      <option value="sqlcoder:7b">sqlcoder:7b (4.8 GB)</option>
                    </select>
                  </div>

                  {/* Secondary Worker Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Secondary Worker</label>
                    <select
                      value={simWorker}
                      onChange={(e) => setSimWorker(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="qwen2.5-coder:1.5b">qwen2.5-coder:1.5b (1.2 GB - Ideal)</option>
                      <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (4.7 GB)</option>
                      <option value="llama3-groq-tool-use:8b">llama3-groq-tool-use:8b (4.9 GB)</option>
                      <option value="sqlcoder:7b">sqlcoder:7b (4.8 GB)</option>
                    </select>
                  </div>

                  {/* Context KV-Cache Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Context Window KV-Cache</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '8k', val: 0.8 },
                        { label: '16k', val: 1.6 },
                        { label: '32k', val: 3.2 }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setSimContextOverhead(item.val)}
                          className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            simContextOverhead === item.val
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {item.label} ({item.val}GB)
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4-Segment Visual Bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="h-4 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
                    <div
                      style={{ width: `${Math.min(100, (orchestratorFootprint / 8.0) * 100)}%` }}
                      className="bg-purple-600 h-full"
                      title={`Orchestrator: ${orchestratorFootprint} GB`}
                    />
                    <div
                      style={{ width: `${Math.min(100, (workerFootprint / 8.0) * 100)}%` }}
                      className="bg-blue-500 h-full"
                      title={`Worker: ${workerFootprint} GB`}
                    />
                    <div
                      style={{ width: `${Math.min(100, (contextFootprint / 8.0) * 100)}%` }}
                      className="bg-amber-500 h-full"
                      title={`KV Cache: ${contextFootprint} GB`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-600"></span> Orch: {orchestratorFootprint}GB</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Worker: {workerFootprint}GB</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> KV Cache: {contextFootprint}GB</span>
                    </div>
                    <span className="text-slate-300 font-bold">
                      Total: {totalSimFootprint} / 8.00 GB ({Math.round((totalSimFootprint / 8.0) * 100)}%)
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  {simVerdict.description}
                </p>
              </div>
            )}
          </div>

          {/* 3. Minimalist Installed Local Ollama Models Grid */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span>Installed Local Ollama Models</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                    {ollamaTags.length} Discovered
                  </span>
                </h4>
              </div>

              <div className="relative sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  placeholder="Filter local weights..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredTags.map((tagMod, idx) => {
                const isTagExpanded = Boolean(expandedTagIds[tagMod.name]);
                const safety = getVramSafetyTier(tagMod.size_gb);

                return (
                  <div
                    key={`${tagMod.name}-${idx}`}
                    className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 shadow-md transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-xs text-white truncate" title={tagMod.name}>
                        {tagMod.name}
                      </span>
                      <button
                        onClick={() => copyToClipboard(tagMod.name, tagMod.name)}
                        className="text-slate-500 hover:text-slate-300 p-0.5"
                      >
                        {copiedModelId === tagMod.name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-300 font-semibold">
                          {safeFixed(tagMod.size_gb, 1, "0.0")} GB
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${safety.className}`}>
                          {safety.badge}
                        </span>
                      </div>

                      <button
                        onClick={() => setExpandedTagIds((prev) => ({ ...prev, [tagMod.name]: !prev[tagMod.name] }))}
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                      >
                        {isTagExpanded ? 'Hide ▴' : 'Inspect ▾'}
                      </button>
                    </div>

                    {isTagExpanded && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs animate-fade-in">
                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/80 p-2 rounded border border-slate-800">
                          <div><span className="text-slate-500">Family:</span> <span className="font-mono text-slate-300">{tagMod.details?.family || 'N/A'}</span></div>
                          <div><span className="text-slate-500">Params:</span> <span className="font-mono text-slate-300">{tagMod.details?.parameter_size || 'N/A'}</span></div>
                          <div><span className="text-slate-500">Quant:</span> <span className="font-mono text-slate-300">{tagMod.details?.quantization_level || 'N/A'}</span></div>
                          <div><span className="text-slate-500">Format:</span> <span className="font-mono text-slate-300">{tagMod.details?.format || 'GGUF'}</span></div>
                        </div>

                        {/* Quick Sim buttons */}
                        <div className="flex items-center justify-end gap-1.5 pt-1">
                          <button
                            onClick={() => {
                              setSimOrchestrator(tagMod.name);
                              setSimExpanded(true);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-800/60 text-[10px] font-semibold"
                          >
                            Sim: Orch
                          </button>
                          <button
                            onClick={() => {
                              setSimWorker(tagMod.name);
                              setSimExpanded(true);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-800/60 text-[10px] font-semibold"
                          >
                            Sim: Worker
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: SWARM ROSTERS & ROLE BUILDER                                  */}
      {/* ==================================================================== */}
      {activeTab === 'swarms' && (
        <div className="space-y-6">
          {/* Section 1: Swarm Roster Cards */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>Configured Swarm Roster Profiles</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Select a pre-configured team architecture or author custom worker topologies
                </p>
              </div>

              <button
                onClick={() => setShowCreateSwarm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Custom Swarm</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {customSwarms.map((swarm, idx) => {
                const isActive = activeSwarmId === swarm.id;
                const showNotes = Boolean(expandedSwarmNotes[swarm.id]);

                return (
                  <div
                    key={`${swarm.id}-${idx}`}
                    onClick={() => {
                      setActiveSwarmId(swarm.id);
                      setOrchestratorEngine(swarm.orchestrator);
                      setMaxConcurrency(swarm.default_concurrency);
                    }}
                    className={`rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? 'bg-emerald-950/40 border-emerald-500/80 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-white truncate">{swarm.name}</span>
                        {isActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shrink-0">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-300 font-mono">
                        <div><span className="text-slate-500">Orchestrator:</span> <strong className="text-white">{swarm.orchestrator}</strong></div>
                        <div><span className="text-slate-500">Concurrency:</span> <strong className="text-emerald-400">{swarm.default_concurrency} Workers</strong></div>
                        {swarm.worker_models && swarm.worker_models.length > 0 && (
                          <div>
                            <span className="text-slate-500 block text-[11px] mb-1">
                              Worker Roster ({Math.min(swarm.max_models_used || swarm.worker_models.length, swarm.worker_models.length)}/{swarm.worker_models.length} active • {swarm.routing_strategy || 'ROUND_ROBIN'}):
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {swarm.worker_models.map((wm, wIdx) => (
                                <span key={wIdx} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300">
                                  {wm}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {showNotes && (
                        <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 leading-relaxed animate-fade-in">
                          {swarm.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs mt-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedSwarmNotes((prev) => ({ ...prev, [swarm.id]: !prev[swarm.id] }));
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        {showNotes ? 'Hide notes' : 'View notes'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveSwarmConfig(swarm.id, swarm.orchestrator);
                        }}
                        className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
                      >
                        Activate &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

                    {/* Section 1.5: 6 Sleek Swarm Roles (<8GB Local Hardware Optimized) */}
          <div className="bg-slate-900/90 border border-indigo-900/40 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>6 Sleek Swarm Roles (&lt;8GB Local Hardware Optimized &amp; Zero Cloud Cost)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  High-volume file, test, and dependency operations delegated to 100% free local models running at 30-70+ TPS
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-bold self-start sm:self-auto">
                ⚡ RTX 4060 8GB Ready
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SLEEK_SWARM_ROLES_META.map((r) => (
                <div
                  key={r.role}
                  className={`p-3.5 rounded-xl border ${r.color} flex flex-col justify-between space-y-2.5 transition-all hover:border-slate-600`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-white">{r.role}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono border ${
                        r.isLocal
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                          : 'bg-blue-950/80 text-blue-300 border-blue-500/50'
                      }`}>
                        {r.costBadge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">{r.desc}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-1 font-semibold">Preferred Models:</span>
                    <div className="flex flex-wrap gap-1">
                      {r.preferred.map((pm, pIdx) => (
                        <span
                          key={pIdx}
                          className="text-[10px] px-1.5 py-0.2 rounded bg-slate-900/90 border border-slate-700/80 text-slate-200 font-mono"
                        >
                          {pm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Phase 0 Master Orchestrator Selector & Worker Concurrency Slider */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-5">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span>Phase 0 Master Orchestrator Engine</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                The lead architect model that analyzes user requirements and orchestrates parallel sub-agent workers
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ORCHESTRATOR_OPTIONS.map((orch, idx) => {
                const isSelected = orchestratorEngine === orch.id;

                return (
                  <div
                    key={`${orch.id}-${idx}`}
                    onClick={() => setOrchestratorEngine(orch.id)}
                    className={`rounded-xl p-3.5 border transition-all cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-white truncate">{orch.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono shrink-0">
                        {orch.tag}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-blue-300 font-semibold">{orch.badge}</div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{orch.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Worker Concurrency Slider */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="concurrency-slider" className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Worker Swarm Concurrency Limit
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Maximum concurrent agent threads spawned during Phase 2 development execution
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-3 py-1 rounded-lg">
                  {maxConcurrency} Workers
                </span>
              </div>

              <input
                id="concurrency-slider"
                type="range"
                min={1}
                max={16}
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />

              {/* Preset Chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold">Presets:</span>
                {[
                  { label: '1 Serial', val: 1 },
                  { label: '4 Local Safe', val: 4 },
                  { label: '8 Hybrid', val: 8 },
                  { label: '12 Cloud', val: 12 },
                  { label: '16 Burst', val: 16 }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setMaxConcurrency(item.val)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                      maxConcurrency === item.val
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save & Activate Button */}
            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => handleSaveSwarmConfig()}
                disabled={swarmSaving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 cursor-pointer disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{swarmSaving ? 'Persisting Config...' : 'Save & Activate Swarm'}</span>
              </button>
            </div>
          </div>

          {/* Section 3: Interactive Multi-Model Worker Roster Builder */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Multi-Model Worker Roster Builder & 85% Quota Engine</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select 1 to N models for parallel sub-agent task execution with strict vs 85% working limits enforcement
                </p>
              </div>

              {/* Roster Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  { id: 'ALL', label: 'All Providers' },
                  { id: 'GOOGLE_FREE', label: '☁️ Google • Free' },
                  { id: 'GOOGLE_PAID', label: '💎 Google • Paid' },
                  { id: 'GROQ_FREE', label: '⚡ Groq • Free' },
                  { id: 'GROQ_PAID', label: '⚡ Groq • Paid' },
                  { id: 'OLLAMA_LOCAL', label: '💻 Ollama • Local' }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRosterFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                      rosterFilter === f.id
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Models Grid with Strict vs 85% Limits */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto p-1">
              {filteredCatalogModels.map((m) => {
                const isSelected = activeWorkerModels.includes(m.model_name);
                const sRpm = formatLimitVal(m.strict_limits?.rpm);
                const sTpm = formatLimitVal(m.strict_limits?.tpm);
                const sRpd = formatLimitVal(m.strict_limits?.rpd);
                const wRpm = formatLimitVal(m.working_limits?.rpm);
                const wTpm = formatLimitVal(m.working_limits?.tpm);
                const wRpd = formatLimitVal(m.working_limits?.rpd);

                return (
                  <div
                    key={m.model_name}
                    onClick={() => handleToggleActiveWorker(m.model_name)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/40'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-white truncate" title={m.model_name}>
                          {m.model_name}
                        </span>
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {m.provider}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {m.tier}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px] font-mono">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Strict Cap (100%):</span>
                        <span className="text-slate-300">{sRpm} RPM • {sTpm} TPM • {sRpd} RPD</span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-400 font-semibold">
                        <span>Working Cap (85%):</span>
                        <span>{wRpm} RPM • {wTpm} TPM • {wRpd} RPD</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Roster Summary Bar & Controls */}
            <div className="pt-4 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 font-bold">
                  🤖 {Math.min(activeMaxModelsUsed, activeWorkerModels.length)}/{activeWorkerModels.length} Models Selected
                </span>

                <div className="flex items-center gap-2">
                  <label htmlFor="roster-max-models-slider" className="text-slate-300 font-semibold">
                    Max Models Used:
                  </label>
                  <input
                    id="roster-max-models-slider"
                    type="range"
                    min={1}
                    max={Math.max(1, activeWorkerModels.length)}
                    value={activeMaxModelsUsed}
                    onChange={(e) => setActiveMaxModelsUsed(Number(e.target.value))}
                    className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <span className="font-bold text-emerald-400">
                    {activeMaxModelsUsed} of {activeWorkerModels.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="roster-routing-strategy-select" className="text-slate-300 font-semibold">
                    Routing:
                  </label>
                  <select
                    id="roster-routing-strategy-select"
                    value={activeRoutingStrategy}
                    onChange={(e) => setActiveRoutingStrategy(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="ROUND_ROBIN">ROUND_ROBIN (Balanced)</option>
                    <option value="QUOTA_WEIGHTED">QUOTA_WEIGHTED (Quota Priority)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="roster-key-select" className="text-slate-300 font-semibold">
                    Preferred Key:
                  </label>
                  <select
                    id="roster-key-select"
                    value={activePreferredKeyId}
                    onChange={(e) => setActivePreferredKeyId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-semibold focus:outline-none"
                  >
                    <option value="AUTO">AUTO (Key Pool Dispatcher)</option>
                    {registeredKeys.map((k) => (
                      <option key={k.id} value={k.id}>
                        [{k.provider} {k.tier}] {k.label || k.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSaveSwarmConfig()}
                disabled={swarmSaving || activeWorkerModels.length === 0}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{swarmSaving ? 'Saving Roster...' : 'Save & Activate Swarm Roster'}</span>
              </button>
            </div>
          </div>

          {/* Modal / Drawer: Create Custom Swarm Profile */}
          {showCreateSwarm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-lg w-full space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Create Custom Swarm Roster</span>
                  </h4>
                  <button onClick={() => setShowCreateSwarm(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {createSwarmError && (
                  <div className="p-2.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{createSwarmError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300">Swarm Name</label>
                    <input
                      type="text"
                      value={newSwarmName}
                      onChange={(e) => {
                        setNewSwarmName(e.target.value);
                        if (!newSwarmId) setNewSwarmId(e.target.value.toUpperCase().replace(/\s+/g, '_'));
                      }}
                      placeholder="e.g. Extreme Speed LPU Swarm"
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">Swarm ID (Unique)</label>
                    <input
                      type="text"
                      value={newSwarmId}
                      onChange={(e) => setNewSwarmId(e.target.value)}
                      placeholder="e.g. LPU_SPEED_SWARM"
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-300">Orchestrator</label>
                      <select
                        value={newSwarmOrchestrator}
                        onChange={(e) => setNewSwarmOrchestrator(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                      >
                        <option value="qwen-2.5-coder-32b">qwen-2.5-coder-32b (Groq)</option>
                        <option value="gemini-2.5-pro">gemini-2.5-pro (Google)</option>
                        <option value="gemini-3.6-flash">gemini-3.6-flash (Google)</option>
                        <option value="qwen2.5-coder:32b">qwen2.5-coder:32b (Local)</option>
                        <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (Local)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300">Concurrency Workers</label>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={newSwarmConcurrency}
                        onChange={(e) => setNewSwarmConcurrency(Number(e.target.value))}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">Description</label>
                    <textarea
                      rows={2}
                      value={newSwarmDesc}
                      onChange={(e) => setNewSwarmDesc(e.target.value)}
                      placeholder="Operational purpose of this swarm roster..."
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateSwarm(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomSwarm}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                  >
                    Create Swarm
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
