import React, { useState, useEffect } from 'react';
import {
  Gauge,
  Shield,
  Cpu,
  RefreshCw,
  Zap,
  AlertTriangle,
  Clock,
  Sliders,
  CheckCircle2,
  Lock,
  Search,
  SlidersHorizontal,
  Info,
  Server,
  Layers,
  ShieldAlert,
  ArrowRight,
  Key,
  Plus,
  Trash2,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
  X,
  AlertCircle
} from 'lucide-react';

interface ModelTelemetry {
  snippet: string;
  limits: {
    rpm: number;
    tpm: number;
    rpd: number;
  };
}

interface ProfileDefinition {
  allowed_models: string[];
  description: string;
}

interface ConfigData {
  model_constraining_profiles: Record<string, ProfileDefinition>;
  default_constraining_profile: string;
  tier_pools: Record<string, string[]>;
}

interface KeyItem {
  id: string;
  key: string;
  tier: 'FREE' | 'PAID';
  label: string;
  status: 'ACTIVE' | 'EXHAUSTED';
  last_used: string | null;
  error_count: number;
  cooldown_remaining_sec: number;
}

interface PoolStatus {
  total_keys: number;
  active_keys: number;
  exhausted_keys: number;
  free_keys: number;
  paid_keys: number;
  active_tier_mode: string;
}

// 11 Model Definitions with generational classification and default hard boundaries
const MODEL_REGISTRY_DETAILS: Record<
  string,
  { generation: string; tier: 'LOCAL' | 'FLASH_LITE' | 'PRO'; defaultRpm: number; defaultTpm: number; defaultRpd: number }
> = {
  'gemini-3.1-pro-preview': { generation: 'Gemini 3.x', tier: 'PRO', defaultRpm: 25, defaultTpm: 2000000, defaultRpd: 250 },
  'gemini-2.5-pro': { generation: 'Gemini 2.x', tier: 'PRO', defaultRpm: 150, defaultTpm: 2000000, defaultRpd: 1000 },
  'gemini-3.6-flash': { generation: 'Gemini 3.x', tier: 'FLASH_LITE', defaultRpm: 1000, defaultTpm: 2000000, defaultRpd: 10000 },
  'gemini-3.5-flash': { generation: 'Gemini 3.x', tier: 'FLASH_LITE', defaultRpm: 1000, defaultTpm: 2000000, defaultRpd: 10000 },
  'gemini-3-flash-preview': { generation: 'Gemini 3.x', tier: 'FLASH_LITE', defaultRpm: 1000, defaultTpm: 2000000, defaultRpd: 10000 },
  'gemini-2.5-flash': { generation: 'Gemini 2.x', tier: 'FLASH_LITE', defaultRpm: 1000, defaultTpm: 1000000, defaultRpd: 10000 },
  'gemini-3.5-flash-lite': { generation: 'Gemini 3.x', tier: 'FLASH_LITE', defaultRpm: 4000, defaultTpm: 4000000, defaultRpd: 150000 },
  'gemini-3.1-flash-lite': { generation: 'Gemini 3.x', tier: 'FLASH_LITE', defaultRpm: 4000, defaultTpm: 4000000, defaultRpd: 150000 },
  'gemini-2.5-flash-lite': { generation: 'Gemini 2.x', tier: 'FLASH_LITE', defaultRpm: 4000, defaultTpm: 4000000, defaultRpd: 999999 },
  'qwen2.5-coder:32b': { generation: 'Qwen 2.5 Local', tier: 'LOCAL', defaultRpm: 999, defaultTpm: 9900000, defaultRpd: 999999 },
  'qwen2.5-coder:7b': { generation: 'Qwen 2.5 Local', tier: 'LOCAL', defaultRpm: 999, defaultTpm: 9900000, defaultRpd: 999999 },
};

export const TokenGovernor: React.FC = () => {
  const [telemetry, setTelemetry] = useState<Record<string, ModelTelemetry>>({});
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<string>('HIGH_RPM_TPM');

  // Key Pool State
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState<boolean>(false);
  const [newKeyString, setNewKeyString] = useState<string>('');
  const [newKeyTier, setNewKeyTier] = useState<'FREE' | 'PAID'>('FREE');
  const [newKeyLabel, setNewKeyLabel] = useState<string>('');
  const [addKeyError, setAddKeyError] = useState<string | null>(null);
  const [addKeySuccess, setAddKeySuccess] = useState<string | null>(null);
  const [isTestingNewKey, setIsTestingNewKey] = useState<boolean>(false);
  const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; valid: boolean; message?: string; error?: string } | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const fetchGovernorData = async () => {
    try {
      const [teleRes, configRes] = await Promise.all([
        fetch('/api/telemetry'),
        fetch('/api/config'),
      ]);

      if (teleRes.ok) {
        const teleData = await teleRes.json();
        if (teleData.models) setTelemetry(teleData.models);
      }

      if (configRes.ok) {
        const cfgData: ConfigData = await configRes.json();
        setConfig(cfgData);
        if (cfgData.default_constraining_profile) {
          setSelectedProfile(cfgData.default_constraining_profile);
        }
      }
    } catch (err) {
      console.error('Failed to load Token Governor telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
        setPoolStatus(data.pool_status || null);
      }
    } catch (e) {
      console.error('Failed to fetch keys:', e);
    }
  };

  useEffect(() => {
    fetchGovernorData();
    fetchKeys();
    const interval = setInterval(() => {
      fetchGovernorData();
      fetchKeys();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleTierModeChange = async (mode: string) => {
    try {
      const res = await fetch('/api/keys/tier-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        fetchKeys();
      }
    } catch (e) {
      console.error('Failed to set tier mode:', e);
    }
  };

  const handleTestKey = async (id: string) => {
    setTestingKeyId(id);
    setTestResult(null);
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      setTestResult({
        id,
        valid: data.valid,
        message: data.message,
        error: data.error
      });
    } catch (e: any) {
      setTestResult({
        id,
        valid: false,
        error: e.message || 'Network error while testing key'
      });
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this API key from the active rotation pool?')) return;
    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchKeys();
      }
    } catch (e) {
      console.error('Failed to delete key:', e);
    }
  };

  const handleTestNewKey = async () => {
    if (!newKeyString.trim()) {
      setAddKeyError('Please enter an API key first.');
      return;
    }
    setIsTestingNewKey(true);
    setAddKeyError(null);
    setAddKeySuccess(null);
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKeyString.trim() })
      });
      const data = await res.json();
      if (data.valid) {
        setAddKeySuccess('Key verified successfully with Google GenAI!');
      } else {
        setAddKeyError(data.error || 'Key validation failed.');
      }
    } catch (e: any) {
      setAddKeyError(e.message || 'Validation request failed.');
    } finally {
      setIsTestingNewKey(false);
    }
  };

  const handleSaveNewKey = async () => {
    if (!newKeyString.trim()) {
      setAddKeyError('API key string cannot be empty.');
      return;
    }
    setIsSavingKey(true);
    setAddKeyError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKeyString.trim(),
          tier: newKeyTier,
          label: newKeyLabel.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setIsAddKeyModalOpen(false);
        setNewKeyString('');
        setNewKeyLabel('');
        setNewKeyTier('FREE');
        setAddKeySuccess(null);
        fetchKeys();
      } else {
        setAddKeyError(data.detail || 'Failed to save key.');
      }
    } catch (e: any) {
      setAddKeyError(e.message || 'Failed to save key.');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleCopyKey = (keyId: string, maskedText: string) => {
    navigator.clipboard.writeText(maskedText);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const parseSnippet = (snippet: string) => {
    const rpmMatch = snippet?.match(/RPM:\s*(\d+)\/(\d+)/);
    const tpmMatch = snippet?.match(/TPM:\s*([\d.]+)K?\/([\d.]+)K?/);
    const rpdMatch = snippet?.match(/RPD:\s*(\d+)\/(\d+)/);

    const rpm = rpmMatch ? parseInt(rpmMatch[1], 10) : 0;
    const maxRpm = rpmMatch ? parseInt(rpmMatch[2], 10) : 1;
    const tpm = tpmMatch ? parseFloat(tpmMatch[1]) : 0;
    const maxTpm = tpmMatch ? parseFloat(tpmMatch[2]) : 1;
    const rpd = rpdMatch ? parseInt(rpdMatch[1], 10) : 0;
    const maxRpd = rpdMatch ? parseInt(rpdMatch[2], 10) : 1;

    const tpmPct = Math.round((tpm / Math.max(maxTpm, 1)) * 100);
    const isShieldActive = tpmPct >= 85;

    return { rpm, maxRpm, tpm, maxTpm, rpd, maxRpd, tpmPct, isShieldActive };
  };

  const defaultProfiles: Record<string, ProfileDefinition> = config?.model_constraining_profiles || {
    HIGH_RPM_TPM: {
      allowed_models: [
        'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite',
        'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash',
        'qwen2.5-coder:32b', 'qwen2.5-coder:7b'
      ],
      description: 'High throughput profile filtering out low RPM Pro models to maximize continuous generation bandwidth.'
    },
    HIGHEST_RPM_TPM: {
      allowed_models: [
        'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite',
        'qwen2.5-coder:32b', 'qwen2.5-coder:7b'
      ],
      description: 'Ultra high concurrency profile using exclusively 4K RPM Lite models.'
    },
    PRO_PLAN: {
      allowed_models: [
        'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.6-flash', 'gemini-3.5-flash',
        'qwen2.5-coder:32b', 'qwen2.5-coder:7b'
      ],
      description: 'Complex engineering profile using Pro models under strict project caps.'
    },
    GEMINI_ONLY: {
      allowed_models: [
        'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.6-flash', 'gemini-3.5-flash',
        'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'
      ],
      description: 'Exclusively Gemini cloud models.'
    },
    GEMINI_3_ONLY: {
      allowed_models: [
        'gemini-3.1-pro-preview', 'gemini-3.6-flash', 'gemini-3.5-flash',
        'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'
      ],
      description: 'Exclusively Gemini 3.x generation engines.'
    },
    GEMINI_2_ONLY: {
      allowed_models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      description: 'Exclusively Gemini 2.x generation engines.'
    },
    OFFLINE_PURE: {
      allowed_models: ['qwen2.5-coder:32b', 'qwen2.5-coder:7b'],
      description: 'Pure local execution using local Qwen weights only.'
    }
  };

  return (
    <div id="token-governor-page" className="space-y-6">
      {/* 1. Header & Quota Anchor Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950/50 via-slate-900/80 to-indigo-950/40 border border-purple-500/20 p-6 backdrop-blur">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs font-semibold text-purple-400">
              <Gauge className="w-3.5 h-3.5" />
              <span>Advance Assistant OS v6.0 &bull; Token Governor Console</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Quota Telemetry & Free-Tier Financial Shield
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Precision rate-limiting and burst pacing across 11 registered engines. Multi-key pool rotation and automatic circuit breaking at 85% TPM prevent billing overruns.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 shrink-0">
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-400 text-[10px] uppercase flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400" /> Daily Reset Boundary
              </div>
              <div className="text-amber-400 font-bold">1:30 PM IST (Midnight PT)</div>
            </div>

            <button
              onClick={() => { fetchGovernorData(); fetchKeys(); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-mono text-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Poll Quotas</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Top Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Financial Shield Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" /> 85% TPM Financial Shield
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
              ARMED
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Intercepts generation requests when a model reaches 85% of its 60-second token ceiling, triggering cascading cloud or local Qwen fallback.
          </p>
        </div>

        {/* Sliding 60-Second Window Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-400" /> Sliding 60-Second Window
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-800">
              ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Prunes timestamps older than 60 seconds from the in-memory token ledger, maintaining true rolling RPM and TPM concurrency calculations.
          </p>
        </div>

        {/* Burst Pacing Guard Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-400" /> Burst Pacing Guard
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-400 border border-purple-800">
              1.5s / 0.3s
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Enforces mandatory micro-delays between concurrent worker threads (1.5s for Pro models, 0.3s for Flash/Lite) to prevent instantaneous 429 bursts.
          </p>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. MULTI-API KEY POOL & RESILIENT ROTATION CONSOLE */}
      {/* ==================================================================== */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Key className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-wide">
                Multi-API Key Pool & Resilient Rotation
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Auto-Failover
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Automatic round-robin cycling across pooled Gemini keys. Instant 60s cooldown isolation on 429 Quota Exhaustion ensures uninterrupted build runs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tier Routing Mode Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
              <span className="px-2 text-slate-400 text-[11px] font-medium">Mode:</span>
              {(['AUTO', 'FREE_ONLY', 'PAID_ONLY'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleTierModeChange(mode)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs transition-all ${
                    (poolStatus?.active_tier_mode || 'AUTO') === mode
                      ? 'bg-purple-600 text-white font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Add Key Button */}
            <button
              onClick={() => {
                setIsAddKeyModalOpen(true);
                setAddKeyError(null);
                setAddKeySuccess(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition-all shadow-md hover:shadow-emerald-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>Add API Key</span>
            </button>
          </div>
        </div>

        {/* Pool Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 rounded-lg">
            <span className="text-slate-400 font-medium">Total Registered:</span>
            <span className="text-white font-mono font-bold">{poolStatus?.total_keys ?? keys.length}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 rounded-lg">
            <span className="text-slate-400 font-medium">Active & Ready:</span>
            <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {poolStatus?.active_keys ?? keys.filter(k => k.status === 'ACTIVE').length}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 rounded-lg">
            <span className="text-slate-400 font-medium">Quota Cooling (429):</span>
            <span className="text-rose-400 font-mono font-bold">
              {poolStatus?.exhausted_keys ?? keys.filter(k => k.status === 'EXHAUSTED').length}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 rounded-lg">
            <span className="text-slate-400 font-medium">Tiers (Free / Paid):</span>
            <span className="text-cyan-300 font-mono font-bold">
              {poolStatus?.free_keys ?? keys.filter(k => k.tier === 'FREE').length} / {poolStatus?.paid_keys ?? keys.filter(k => k.tier === 'PAID').length}
            </span>
          </div>
        </div>

        {/* Global Test Result Alert Banner */}
        {testResult && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs animate-fadeIn ${
              testResult.valid
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.valid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>
                Key [{testResult.id}]: {testResult.valid ? (testResult.message || 'Authentication test succeeded!') : testResult.error}
              </span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-slate-400 hover:text-white ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Registered Keys List / Cards Grid */}
        {keys.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400 space-y-2">
            <Key className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-medium">No custom API keys registered in the pool yet.</p>
            <p className="text-xs text-slate-500">
              The system currently routes requests through the primary <code className="text-cyan-400">GEMINI_API_KEY</code> environment variable. Add secondary keys to enable automatic 429 rotation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {keys.map((k) => {
              const isExhausted = k.status === 'EXHAUSTED';
              const isTesting = testingKeyId === k.id;
              return (
                <div
                  key={k.id}
                  className="rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 p-4 space-y-3 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{k.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            k.tier === 'PAID'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {k.tier} TIER
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">ID: {k.id}</div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isExhausted
                            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {isExhausted ? `429 COOLDOWN (${k.cooldown_remaining_sec}s)` : 'ACTIVE'}
                      </span>
                    </div>
                  </div>

                  {/* Masked Key Display */}
                  <div className="flex items-center justify-between bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-cyan-300">
                    <span className="tracking-wider">{k.key}</span>
                    <button
                      onClick={() => handleCopyKey(k.id, k.key)}
                      className="text-slate-400 hover:text-white transition-colors"
                      title="Copy masked string"
                    >
                      {copiedKeyId === k.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Metadata & Actions Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px] text-slate-400">
                    <div className="space-x-2 truncate">
                      <span>Last used: {k.last_used ? k.last_used.split(' ')[1] : 'Never'}</span>
                      {k.error_count > 0 && <span className="text-amber-400">&bull; {k.error_count} fails</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestKey(k.id)}
                        disabled={isTesting}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Test key connection"
                      >
                        {isTesting ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                        ) : (
                          <Zap className="w-3 h-3 text-cyan-400" />
                        )}
                        <span>{isTesting ? 'Testing' : 'Test'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-700 transition-colors"
                        title="Delete key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 4. COMPREHENSIVE MODEL REGISTRY TABLE */}
      {/* ==================================================================== */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl space-y-0">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Server className="w-4 h-4 text-purple-400" /> Registered Model Allocation Limits (11 Engines)
            </h3>
            <p className="text-xs text-slate-400">
              Active quotas, token thresholds, and real-time sliding usage tracked directly in TokenGovernor.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search model registry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 font-mono uppercase tracking-wider">
                <th className="py-3 px-4">Model & Generation</th>
                <th className="py-3 px-3">Tier</th>
                <th className="py-3 px-3">RPM Limit</th>
                <th className="py-3 px-3">TPM Limit</th>
                <th className="py-3 px-3">RPD Daily Cap</th>
                <th className="py-3 px-4">Current Usage Snippet</th>
                <th className="py-3 px-3 text-right">85% Shield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
              {Object.keys(MODEL_REGISTRY_DETAILS)
                .filter((modelKey) => modelKey.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((modelKey) => {
                  const details = MODEL_REGISTRY_DETAILS[modelKey];
                  const live = telemetry[modelKey];
                  const snippet = live?.snippet || '[RPM: 0/0 | TPM: 0.0K/0.0K | RPD: 0/0]';
                  const parsed = parseSnippet(snippet);

                  const maxRpm = live?.limits?.rpm || details.defaultRpm;
                  const maxTpm = live?.limits?.tpm || details.defaultTpm;
                  const maxRpd = live?.limits?.rpd || details.defaultRpd;

                  return (
                    <tr key={modelKey} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">
                        <div className="flex items-center gap-2">
                          <span>{modelKey}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans">{details.generation}</div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            details.tier === 'PRO'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : details.tier === 'LOCAL'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {details.tier}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {maxRpm.toLocaleString()} <span className="text-slate-500 text-[10px]">RPM</span>
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {(maxTpm / 1000000).toFixed(1)}M <span className="text-slate-500 text-[10px]">TPM</span>
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {maxRpd >= 999999 ? 'UNLIMITED' : maxRpd.toLocaleString()} <span className="text-slate-500 text-[10px]">RPD</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] text-cyan-300 truncate max-w-xs">
                          {snippet}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        {parsed.isShieldActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                            <ShieldAlert className="w-3 h-3" /> TRIPPED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" /> SECURE
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Model Constraining Profiles Inspector */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="space-y-1">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-purple-400" /> Model Constraining Profiles (7 Architectural Policies)
          </h3>
          <p className="text-xs text-slate-400">
            System rules governing eligible models dispatched during multi-agent sub-tasks.
          </p>
        </div>

        {/* Profile Tabs */}
        <div className="flex flex-wrap gap-2 pt-2">
          {Object.keys(defaultProfiles).map((profKey) => (
            <button
              key={profKey}
              onClick={() => setSelectedProfile(profKey)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs transition-all ${
                selectedProfile === profKey
                  ? 'bg-purple-600 text-white font-bold shadow-lg'
                  : 'bg-slate-800/80 hover:bg-slate-750 text-slate-300 border border-slate-700/60'
              }`}
            >
              {profKey}
            </button>
          ))}
        </div>

        {/* Active Profile Details */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-purple-300">
              Profile: {selectedProfile}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {defaultProfiles[selectedProfile]?.allowed_models?.length || 0} Models Permitted
            </span>
          </div>

          <p className="text-xs text-slate-300 font-sans">
            {defaultProfiles[selectedProfile]?.description}
          </p>

          <div className="pt-2">
            <div className="text-[10px] uppercase font-mono text-slate-400 mb-2">Permitted Cloud & Local Engines:</div>
            <div className="flex flex-wrap gap-2">
              {defaultProfiles[selectedProfile]?.allowed_models?.map((m) => (
                <span
                  key={m}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Pro Model Hard Project Caps Reference Card */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-slate-900/80 border border-amber-500/20 p-6 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <Lock className="w-4 h-4" /> Pro Model Hard Project Caps (Automated Failover Guard)
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          To maintain strict financial safety and prevent quota starvation, heavy reasoning Pro models carry deterministic per-project request ceilings. When project thresholds are breached, Token Governor automatically diverts subsequent sub-agent tasks to High-Throughput Flash or Lite models.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-mono text-xs">
          {/* Gemini 3.1 Pro Preview */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-white font-bold">
              <span>gemini-3.1-pro-preview</span>
              <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px]">
                MAX 40 REQS
              </span>
            </div>
            <div className="space-y-1 text-slate-400 text-[11px]">
              <div>Max RPM: 25 | Max TPM: 2,000,000</div>
              <div>Project Ceiling: 40 requests per project lifecycle</div>
            </div>
            <p className="text-[11px] text-slate-500 font-sans pt-1">
              Reserved strictly for initial deep architectural planning prompts. Automatically fails over to 3.6 Flash once 40 requests are exhausted.
            </p>
          </div>

          {/* Gemini 2.5 Pro */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-white font-bold">
              <span>gemini-2.5-pro</span>
              <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px]">
                MAX 200 REQS
              </span>
            </div>
            <div className="space-y-1 text-slate-400 text-[11px]">
              <div>Max RPM: 140 | Max TPM: 1,900,000</div>
              <div>Project Ceiling: 200 requests per project lifecycle</div>
            </div>
            <p className="text-[11px] text-slate-500 font-sans pt-1">
              Used for high-complexity code analysis and multi-turn refactoring. Fails over to Flash-Lite (4K RPM) when capped.
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 7. ADD API KEY MODAL DIALOG */}
      {/* ==================================================================== */}
      {isAddKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Register Gemini API Key</h4>
                  <p className="text-[11px] text-slate-400">Add key to persistent pool for failover rotation</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddKeyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error or Success feedback */}
            {addKeyError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addKeyError}</span>
              </div>
            )}
            {addKeySuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{addKeySuccess}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* API Key Input */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Google Gemini API Key *</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={newKeyString}
                  onChange={(e) => setNewKeyString(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
                <span className="text-[10px] text-slate-500 block">
                  Keys are stored locally in .agent_memory/ and masked on all views.
                </span>
              </div>

              {/* Tier Selection */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Quota Tier *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewKeyTier('FREE')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newKeyTier === 'FREE'
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div className="font-bold text-emerald-400 text-xs">FREE TIER</div>
                    <div className="text-[10px] text-slate-400 pt-0.5">Google AI Studio Free Quotas</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewKeyTier('PAID')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newKeyTier === 'PAID'
                        ? 'bg-amber-950/40 border-amber-500/60 text-white shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div className="font-bold text-amber-400 text-xs">PAID / PRO TIER</div>
                    <div className="text-[10px] text-slate-400 pt-0.5">Higher RPM/TPM Project Caps</div>
                  </button>
                </div>
              </div>

              {/* Custom Label */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Key Label (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Primary Work Key, Backup Free Key"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleTestNewKey}
                disabled={isTestingNewKey || !newKeyString.trim()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors"
              >
                {isTestingNewKey ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>{isTestingNewKey ? 'Verifying...' : 'Test Connection'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddKeyModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewKey}
                  disabled={isSavingKey || !newKeyString.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md transition-all disabled:opacity-40"
                >
                  {isSavingKey ? 'Registering...' : 'Save & Register'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenGovernor;
