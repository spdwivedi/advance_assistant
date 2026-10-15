import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  Lock,
  Unlock,
  Cpu,
  Zap,
  Sparkles,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Plus,
  Server,
  Globe,
  Bot,
  SlidersHorizontal,
  Edit3,
  Check,
  X,
  Layers,
  ArrowRight
} from 'lucide-react';

interface WorkingLimits {
  rpm: number;
  tpm: number;
  rpd: number;
  max_input_tokens: number;
  max_output_tokens: number;
  thinking_budget: number;
}

interface StrictLimits {
  rpm: number;
  tpm: number;
  rpd: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
}

interface ModelHierarchyNode {
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

interface FinancialShieldData {
  paid_tier_locked: boolean;
  daily_paid_token_cap: number;
  per_build_paid_token_cap: number;
  enforce_working_limits: boolean;
  safety_margin_percent: number;
}

interface HierarchyData {
  financial_shield: FinancialShieldData;
  paid_tokens_today: number;
  last_reset_date: string;
  active_in_flight_leases: number;
  providers: Record<string, Record<string, Record<string, ModelHierarchyNode>>>;
}

interface SubAgentProfile {
  model: string;
  provider: string;
  complexity_level: string;
  strengths?: string[];
  weaknesses?: string[];
  ideal_for?: string[];
  rpm: number;
  tpm: number;
  rpd: number;
  max_input_tokens: number;
  max_output_tokens: number;
  thinking_budget: number;
}

interface KeyPoolStatus {
  routing_policy: string;
  pinned_key_id: string | null;
  total_keys: number;
  selected_keys: number;
  active_free: number;
  active_paid: number;
  active_keys: number;
  exhausted_keys: number;
  google_keys: number;
  groq_keys: number;
  selected_google_keys: number;
  selected_groq_keys: number;
  paid_tier_locked: boolean;
}

export const TokenGovernor: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'HIERARCHY' | 'SUB_AGENTS'>('HIERARCHY');

  // Hierarchy Data & Realtime Telemetry
  const [hierarchy, setHierarchy] = useState<HierarchyData | null>(null);
  const [subAgents, setSubAgents] = useState<Record<string, SubAgentProfile>>({});
  const [keyPool, setKeyPool] = useState<KeyPoolStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Level 1: Selected Provider
  const [selectedProvider, setSelectedProvider] = useState<string>('GOOGLE');
  // Level 2: Selected Tier
  const [selectedTier, setSelectedTier] = useState<string>('FREE');

  // Financial Shield Edit State
  const [isEditingShield, setIsEditingShield] = useState<boolean>(false);
  const [shieldDailyCap, setShieldDailyCap] = useState<number>(500000);
  const [shieldPerBuildCap, setShieldPerBuildCap] = useState<number>(150000);
  const [shieldSafetyMargin, setShieldSafetyMargin] = useState<number>(85);
  const [shieldSaving, setShieldSaving] = useState<boolean>(false);

  // Edit Model Limits Modal State
  const [editingModel, setEditingModel] = useState<{
    provider: string;
    tier: string;
    model_name: string;
    working_limits: WorkingLimits;
    strict_limits: StrictLimits;
  } | null>(null);
  const [modelSaving, setModelSaving] = useState<boolean>(false);

  // Add Provider/Model Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addProvider, setAddProvider] = useState<string>('GOOGLE');
  const [customProvider, setCustomProvider] = useState<string>('');
  const [addTier, setAddTier] = useState<'FREE' | 'PAID' | 'LOCAL'>('FREE');
  const [addModelName, setAddModelName] = useState<string>('');
  const [addWorkingRpm, setAddWorkingRpm] = useState<number>(15);
  const [addWorkingTpm, setAddWorkingTpm] = useState<number>(150000);
  const [addWorkingRpd, setAddWorkingRpd] = useState<number>(1500);
  const [addMaxInput, setAddMaxInput] = useState<number>(16000);
  const [addMaxOutput, setAddMaxOutput] = useState<number>(4096);
  const [addThinkingBudget, setAddThinkingBudget] = useState<number>(0);
  const [addStrictRpm, setAddStrictRpm] = useState<number>(20);
  const [addStrictTpm, setAddStrictTpm] = useState<number>(200000);
  const [addStrictRpd, setAddStrictRpd] = useState<number>(2000);
  const [addSaving, setAddSaving] = useState<boolean>(false);

  // Edit Sub-Agent Bounds Modal State
  const [editingAgent, setEditingAgent] = useState<{
    agent_name: string;
    data: SubAgentProfile;
  } | null>(null);
  const [agentSaving, setAgentSaving] = useState<boolean>(false);

  // Toast Notification Helper
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  // Fetch Hierarchy Telemetry from REST API
  const fetchHierarchyData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await fetch('/api/governor/hierarchy');
      if (res.ok) {
        const data = await res.json();
        if (data.hierarchy) {
          setHierarchy(data.hierarchy);
          if (data.hierarchy.financial_shield) {
            setShieldDailyCap(data.hierarchy.financial_shield.daily_paid_token_cap);
            setShieldPerBuildCap(data.hierarchy.financial_shield.per_build_paid_token_cap);
            setShieldSafetyMargin(data.hierarchy.financial_shield.safety_margin_percent);
          }
        }
        if (data.sub_agents) {
          setSubAgents(data.sub_agents);
        }
        if (data.key_pool) {
          setKeyPool(data.key_pool);
        }
      }
    } catch (err) {
      if (!isSilent) {
        showToast('Failed to fetch governor hierarchy telemetry.', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial Load & WebSocket Live Stream
  useEffect(() => {
    fetchHierarchyData(true);

    // Setup live WebSocket telemetry feed
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.hierarchy) {
            setHierarchy(payload.hierarchy);
          }
          if (payload.key_pool) {
            setKeyPool(payload.key_pool);
          }
        } catch (e) {
          // ignore parse errors
        }
      };
    } catch (e) {
      // fallback to polling
    }

    const interval = setInterval(() => {
      fetchHierarchyData(true);
    }, 6000);

    return () => {
      clearInterval(interval);
      if (ws) {
        ws.close();
      }
    };
  }, [fetchHierarchyData]);

  // Keep selected Provider/Tier in sync if available providers change
  useEffect(() => {
    if (hierarchy?.providers) {
      const providersList = Object.keys(hierarchy.providers);
      if (providersList.length > 0 && !providersList.includes(selectedProvider)) {
        setSelectedProvider(providersList[0]);
      }
    }
  }, [hierarchy, selectedProvider]);

  useEffect(() => {
    if (hierarchy?.providers && hierarchy.providers[selectedProvider]) {
      const tiersList = Object.keys(hierarchy.providers[selectedProvider]);
      if (tiersList.length > 0 && !tiersList.includes(selectedTier)) {
        setSelectedTier(tiersList[0]);
      }
    }
  }, [hierarchy, selectedProvider, selectedTier]);

  // Financial Shield Toggle Lock
  const handleTogglePaidTierLock = async () => {
    if (!hierarchy?.financial_shield) return;
    const newLockState = !hierarchy.financial_shield.paid_tier_locked;
    try {
      const res = await fetch('/api/governor/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid_tier_locked: newLockState })
      });
      if (res.ok) {
        showToast(
          newLockState ? 'Paid Tier LOCKED: Zero cloud spend enforced.' : 'Paid Tier UNLOCKED: Pay-as-you-go enabled.',
          newLockState ? 'success' : 'info'
        );
        fetchHierarchyData(true);
      } else {
        showToast('Failed to toggle Paid Tier Lock.', 'error');
      }
    } catch (err) {
      showToast('Error communicating with governor shield API.', 'error');
    }
  };

  // Limit Enforcement Mode Toggle
  const handleToggleEnforcementMode = async () => {
    if (!hierarchy?.financial_shield) return;
    const newEnforce = !hierarchy.financial_shield.enforce_working_limits;
    try {
      const res = await fetch('/api/governor/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enforce_working_limits: newEnforce })
      });
      if (res.ok) {
        showToast(
          newEnforce ? 'Enforcing Safe Working Limits (Paced & Bounded).' : 'Using Raw Strict API Limits.',
          'success'
        );
        fetchHierarchyData(true);
      } else {
        showToast('Failed to toggle limit enforcement mode.', 'error');
      }
    } catch (err) {
      showToast('Error communicating with governor shield API.', 'error');
    }
  };

  // Save Shield Configuration
  const handleSaveShieldConfig = async () => {
    setShieldSaving(true);
    try {
      const res = await fetch('/api/governor/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_paid_token_cap: Number(shieldDailyCap),
          per_build_paid_token_cap: Number(shieldPerBuildCap),
          safety_margin_percent: Number(shieldSafetyMargin)
        })
      });
      if (res.ok) {
        showToast('Financial Shield configuration updated successfully.', 'success');
        setIsEditingShield(false);
        fetchHierarchyData(true);
      } else {
        showToast('Failed to update shield configuration.', 'error');
      }
    } catch (err) {
      showToast('Error saving shield configuration.', 'error');
    } finally {
      setShieldSaving(false);
    }
  };

  // Save Model Limits
  const handleSaveModelLimits = async () => {
    if (!editingModel) return;
    setModelSaving(true);
    try {
      const res = await fetch('/api/governor/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: editingModel.provider,
          tier: editingModel.tier,
          model_name: editingModel.model_name,
          working_limits: editingModel.working_limits,
          strict_limits: editingModel.strict_limits
        })
      });
      if (res.ok) {
        showToast(`Limits for '${editingModel.model_name}' persisted successfully.`, 'success');
        setEditingModel(null);
        fetchHierarchyData(true);
      } else {
        const err = await res.json();
        showToast(`Update failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error saving model limits.', 'error');
    } finally {
      setModelSaving(false);
    }
  };

  // Add Provider / Model
  const handleAddProviderModel = async () => {
    const finalProvider = (addProvider === 'CUSTOM' ? customProvider : addProvider).trim().toUpperCase();
    if (!finalProvider) {
      showToast('Provider name cannot be blank.', 'error');
      return;
    }
    if (!addModelName.trim()) {
      showToast('Model name identifier cannot be blank.', 'error');
      return;
    }

    setAddSaving(true);
    try {
      const res = await fetch('/api/governor/provider-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: finalProvider,
          tier: addTier,
          model_name: addModelName.trim(),
          strict_limits: {
            rpm: Number(addStrictRpm),
            tpm: Number(addStrictTpm),
            rpd: Number(addStrictRpd),
            max_input_tokens: Number(addMaxInput * 2),
            max_output_tokens: Number(addMaxOutput * 2)
          },
          working_limits: {
            rpm: Number(addWorkingRpm),
            tpm: Number(addWorkingTpm),
            rpd: Number(addWorkingRpd),
            max_input_tokens: Number(addMaxInput),
            max_output_tokens: Number(addMaxOutput),
            thinking_budget: Number(addThinkingBudget)
          }
        })
      });

      if (res.ok) {
        showToast(`Registered '${addModelName.trim()}' under ${finalProvider}/${addTier}.`, 'success');
        setIsAddModalOpen(false);
        setSelectedProvider(finalProvider);
        setSelectedTier(addTier);
        setAddModelName('');
        fetchHierarchyData(true);
      } else {
        const err = await res.json();
        showToast(`Registration failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error communicating with provider registration API.', 'error');
    } finally {
      setAddSaving(false);
    }
  };

  // Save Sub-Agent Bounds
  const handleSaveSubAgentBounds = async () => {
    if (!editingAgent) return;
    setAgentSaving(true);
    try {
      const res = await fetch('/api/governor/sub-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: editingAgent.agent_name,
          model: editingAgent.data.model,
          provider: editingAgent.data.provider,
          complexity_level: editingAgent.data.complexity_level,
          max_input_tokens: Number(editingAgent.data.max_input_tokens),
          max_output_tokens: Number(editingAgent.data.max_output_tokens),
          thinking_budget: Number(editingAgent.data.thinking_budget),
          rpm: Number(editingAgent.data.rpm),
          tpm: Number(editingAgent.data.tpm),
          rpd: Number(editingAgent.data.rpd)
        })
      });

      if (res.ok) {
        showToast(`Updated bounds for '${editingAgent.agent_name}'.`, 'success');
        setEditingAgent(null);
        fetchHierarchyData(true);
      } else {
        const err = await res.json();
        showToast(`Sub-agent update failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error saving sub-agent bounds.', 'error');
    } finally {
      setAgentSaving(false);
    }
  };

  // Helper for Percentages
  const calcPercent = (val?: number | null, maxVal?: number) => {
    if (!val || !maxVal || maxVal <= 0) return 0;
    return Math.min(100, Math.round((val / maxVal) * 100));
  };

  const getGaugeColor = (pct: number) => {
    if (pct >= 90) return 'bg-rose-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  // Provider Visual Metadata
  const getProviderMeta = (prov: string) => {
    const p = prov.toUpperCase();
    if (p === 'GOOGLE') {
      return { name: 'Google Gemini', icon: Globe, color: 'text-cyan-400', border: 'border-cyan-500/50', bg: 'bg-cyan-950/40' };
    }
    if (p === 'GROQ') {
      return { name: 'Groq Cloud LPU', icon: Zap, color: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-950/40' };
    }
    if (p === 'OLLAMA') {
      return { name: 'Ollama Hardware', icon: Cpu, color: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-950/40' };
    }
    if (p === 'ANTHROPIC') {
      return { name: 'Anthropic Claude', icon: Sparkles, color: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-950/40' };
    }
    if (p === 'OPENAI') {
      return { name: 'OpenAI GPT', icon: Server, color: 'text-green-400', border: 'border-green-500/50', bg: 'bg-green-950/40' };
    }
    return { name: prov, icon: Bot, color: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-slate-900/60' };
  };

  // Tier Visual Metadata
  const getTierMeta = (tier: string) => {
    const t = tier.toUpperCase();
    if (t === 'FREE') {
      return { label: 'FREE TIER', desc: 'Zero-Cost Safe Pool', badge: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
    }
    if (t === 'PAID') {
      return { label: 'PAID TIER', desc: 'Pay-As-You-Go High-TPM', badge: 'bg-amber-950 text-amber-300 border-amber-800' };
    }
    if (t === 'LOCAL') {
      return { label: 'LOCAL VRAM', desc: 'RTX 4060 Private Weights', badge: 'bg-blue-950 text-blue-300 border-blue-800' };
    }
    return { label: tier, desc: 'Custom Tier', badge: 'bg-slate-900 text-slate-300 border-slate-700' };
  };

  const shield = hierarchy?.financial_shield;
  const isPaidLocked = shield?.paid_tier_locked ?? false;
  const isEnforcingWorking = shield?.enforce_working_limits ?? true;
  const paidTokensToday = hierarchy?.paid_tokens_today ?? 0;
  const dailyPaidCap = shield?.daily_paid_token_cap ?? 500000;
  const paidTokenPct = calcPercent(paidTokensToday, dailyPaidCap);

  const activeProviderModels = hierarchy?.providers?.[selectedProvider]?.[selectedTier] || {};
  const providerList = Object.keys(hierarchy?.providers || {});
  const tierList = Object.keys(hierarchy?.providers?.[selectedProvider] || {});

  return (
    <div id="token-governor-console" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {feedbackMsg && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md border animate-in fade-in slide-in-from-top-3 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
              : feedbackMsg.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-blue-950/90 text-blue-200 border-blue-500/40'
          }`}
        >
          {feedbackMsg.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {feedbackMsg.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
          {feedbackMsg.type === 'info' && <Clock className="w-5 h-5 text-blue-400 shrink-0" />}
          <span className="text-sm font-medium">{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-white p-1 ml-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP SECTION: Financial Shield & In-Flight Lease Control Bar */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl border ${isPaidLocked ? 'bg-emerald-950/80 border-emerald-500/50' : 'bg-amber-950/80 border-amber-500/50'}`}>
              <Shield className={`w-6 h-6 ${isPaidLocked ? 'text-emerald-400' : 'text-amber-400'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Hierarchical Quota & Financial Shield</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950/80 text-blue-300 border border-blue-800">
                  v6.0 PRE-LEASE ATOMIC
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-Provider quota tree, atomic pre-request reservations, strict vs. working pacing & 11 sub-agent token boundaries.
              </p>
            </div>
          </div>

          {/* Action Toggles */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Paid Tier Lock Toggle */}
            <button
              onClick={handleTogglePaidTierLock}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs border flex items-center gap-2 transition-all shadow-md ${
                isPaidLocked
                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200 hover:bg-emerald-900/80 ring-2 ring-emerald-500/20'
                  : 'bg-amber-950/90 border-amber-500 text-amber-200 hover:bg-amber-900/80 ring-2 ring-amber-500/20'
              }`}
              title="Click to toggle Paid Tier spend lock"
            >
              {isPaidLocked ? (
                <>
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>🔒 PAID TIER LOCKED (Zero Spend — Free & Local)</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-amber-400" />
                  <span>🔓 PAID TIER UNLOCKED (Pay-As-You-Go Active)</span>
                </>
              )}
            </button>

            {/* Limit Enforcement Mode Toggle */}
            <button
              onClick={handleToggleEnforcementMode}
              className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs border flex items-center gap-2 transition-all ${
                isEnforcingWorking
                  ? 'bg-slate-900 border-cyan-500/60 text-cyan-300 hover:bg-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title="Click to toggle Working vs. Strict Limits"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEnforcingWorking ? '🛡️ Enforcing Safe Working Limits' : '⚡ Using Raw Strict API Limits'}</span>
            </button>

            <button
              onClick={() => fetchHierarchyData(false)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
              title="Refresh Quota Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Metrics Grid & Budget Caps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-800/80">
          {/* Paid Tokens Today Gauge */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">Paid Tokens Today</span>
              <span className="font-mono text-slate-300 text-xs">
                {paidTokensToday.toLocaleString()} / {dailyPaidCap.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-500 ${getGaugeColor(paidTokenPct)}`}
                style={{ width: `${paidTokenPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>{paidTokenPct}% of Daily Cap</span>
              <span>Per-Build Cap: {(shield?.per_build_paid_token_cap ?? 150000).toLocaleString()}</span>
            </div>
          </div>

          {/* Active In-Flight Leases */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">In-Flight Token Leases</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-cyan-400">
                {hierarchy?.active_in_flight_leases ?? 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">active reservations</span>
            </div>
            <div className="text-[10px] text-cyan-400/80 font-mono mt-1">
              Safety Margin: {shield?.safety_margin_percent ?? 85}% RPM/TPM
            </div>
          </div>

          {/* Multi-Provider Key Pool Status */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">Key Pool Matrix</span>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-mono text-cyan-300 flex items-center gap-1">
                <Globe className="w-3 h-3 text-cyan-400" /> {keyPool?.google_keys ?? 0} Google
              </span>
              <span className="text-xs font-mono text-purple-300 flex items-center gap-1">
                <Zap className="w-3 h-3 text-purple-400" /> {keyPool?.groq_keys ?? 0} Groq
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              Active Routing: {keyPool?.routing_policy ?? 'GLOBAL_HYBRID'}
            </div>
          </div>

          {/* Daily Reset Countdown Indicator */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">Daily Quota Reset</span>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-mono font-bold text-white">01:30 PM IST</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>Google PT Midnight</span>
              <button
                onClick={() => setIsEditingShield(!isEditingShield)}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                {isEditingShield ? 'Close Caps' : 'Edit Caps'}
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Shield Cap Editor Drawer */}
        {isEditingShield && (
          <div className="p-4 rounded-xl bg-slate-950/90 border border-blue-900/50 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-300 uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-blue-400" />
                <span>Configure Paid Tier Budget Caps & Safety Margin</span>
              </div>
              <button onClick={() => setIsEditingShield(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Daily Paid Token Cap (All Models)
                </label>
                <input
                  type="number"
                  value={shieldDailyCap}
                  onChange={(e) => setShieldDailyCap(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Per-Build Paid Token Cap (Single Run)
                </label>
                <input
                  type="number"
                  value={shieldPerBuildCap}
                  onChange={(e) => setShieldPerBuildCap(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Safety Margin (% of Working Limit)
                </label>
                <input
                  type="number"
                  value={shieldSafetyMargin}
                  onChange={(e) => setShieldSafetyMargin(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-xs text-white focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingShield(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveShieldConfig}
                disabled={shieldSaving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {shieldSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Shield Config
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MAIN VIEW MODE SWITCHER TABS & ADD MODEL BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('HIERARCHY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'HIERARCHY'
                ? 'bg-blue-600 text-white shadow-glow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Provider → Tier → Model Hierarchy</span>
          </button>

          <button
            onClick={() => setActiveTab('SUB_AGENTS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'SUB_AGENTS'
                ? 'bg-purple-600 text-white shadow-glow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Sub-Agent Bounds ({Object.keys(subAgents).length} Roles)</span>
          </button>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Provider / Model</span>
        </button>
      </div>

      {/* TAB A: 3-LEVEL HIERARCHY EXPLORER */}
      {activeTab === 'HIERARCHY' && (
        <div className="space-y-6">
          {/* LEVEL 1: PROVIDER SELECTOR PILLS */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Level 1: Select Active LLM Provider
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {providerList.map((prov) => {
                const meta = getProviderMeta(prov);
                const IconComponent = meta.icon;
                const tiersUnder = hierarchy?.providers?.[prov] || {};
                let modelCount = 0;
                Object.values(tiersUnder).forEach((t) => {
                  modelCount += Object.keys(t).length;
                });
                const isSelected = selectedProvider === prov;

                return (
                  <button
                    key={prov}
                    onClick={() => {
                      setSelectedProvider(prov);
                      const availableTiers = Object.keys(hierarchy?.providers?.[prov] || {});
                      if (availableTiers.length > 0) {
                        setSelectedTier(availableTiers[0]);
                      }
                    }}
                    className={`px-4 py-2.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600/90 border-blue-400 text-white shadow-glow-sm ring-2 ring-blue-500/30'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-850 hover:text-white'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 ${isSelected ? 'text-white' : meta.color}`} />
                    <span>{meta.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-black/40 font-mono text-[10px] text-slate-300">
                      {modelCount} models
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LEVEL 2: TIER SUB-TABS */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Level 2: Quota Tier ({selectedProvider})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {tierList.map((tier) => {
                const meta = getTierMeta(tier);
                const modelsCount = Object.keys(hierarchy?.providers?.[selectedProvider]?.[tier] || {}).length;
                const isSelected = selectedTier === tier;

                return (
                  <button
                    key={tier}
                    onClick={() => setSelectedTier(tier)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500 text-cyan-200 ring-2 ring-cyan-500/20 shadow-md'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{meta.label}</span>
                    <span className="text-[10px] font-mono text-slate-500">({meta.desc})</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-950 font-mono text-[10px] text-slate-400">
                      {modelsCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LEVEL 3: MODEL QUOTA & BREAKDOWN CARDS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
              <span>Models Monitored under {selectedProvider} / {selectedTier}</span>
              <span className="font-mono text-[11px] text-slate-500">
                {Object.keys(activeProviderModels).length} configured
              </span>
            </div>

            {Object.keys(activeProviderModels).length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-slate-500 text-sm">
                No models registered under {selectedProvider} ({selectedTier}). Click &quot;Add Provider / Model&quot; to configure one.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(activeProviderModels).map(([modelName, node]) => {
                  const working = node.working_limits;
                  const strict = node.strict_limits;
                  const rpmPct = calcPercent(node.current_rpm ?? node.rolling_rpm, working.rpm);
                  const tpmPct = calcPercent(node.current_tpm ?? node.rolling_tpm, working.tpm);
                  const rpdPct = calcPercent(node.requests_today, working.rpd);

                  return (
                    <div
                      key={modelName}
                      id={`model-card-${modelName.replace(/[:.]/g, '-')}`}
                      className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-lg space-y-4 hover:border-slate-700/80 transition-colors"
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="text-base font-bold text-white font-mono">{modelName}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${getTierMeta(selectedTier).badge}`}>
                            {selectedTier}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                            {selectedProvider}
                          </span>
                        </div>

                        <button
                          onClick={() =>
                            setEditingModel({
                              provider: selectedProvider,
                              tier: selectedTier,
                              model_name: modelName,
                              working_limits: { ...working },
                              strict_limits: { ...strict }
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors self-start sm:self-auto"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                          <span>Edit Limits</span>
                        </button>
                      </div>

                      {/* Live Rolling Gauges */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* RPM Gauge */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-semibold text-[11px]">RPM (60s Rolling)</span>
                            <span className="font-mono text-slate-300">
                              {node.current_rpm ?? node.rolling_rpm ?? 0} / <span className="font-bold text-white">{working.rpm}</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div className={`h-full ${getGaugeColor(rpmPct)}`} style={{ width: `${rpmPct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{rpmPct}% used</span>
                            <span>Strict API Cap: {strict.rpm}</span>
                          </div>
                        </div>

                        {/* TPM Gauge */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-semibold text-[11px]">TPM (60s Rolling)</span>
                            <span className="font-mono text-slate-300">
                              {(node.current_tpm ?? node.rolling_tpm ?? 0).toLocaleString()} / <span className="font-bold text-white">{working.tpm.toLocaleString()}</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div className={`h-full ${getGaugeColor(tpmPct)}`} style={{ width: `${tpmPct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{tpmPct}% used</span>
                            <span>Strict API Cap: {strict.tpm.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* RPD Gauge */}
                        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-semibold text-[11px]">RPD (Daily Requests)</span>
                            <span className="font-mono text-slate-300">
                              {(node.requests_today ?? 0).toLocaleString()} / <span className="font-bold text-white">{working.rpd.toLocaleString()}</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div className={`h-full ${getGaugeColor(rpdPct)}`} style={{ width: `${rpdPct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>{rpdPct}% used</span>
                            <span>Strict API Cap: {strict.rpd.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Discrete Token Breakdown Boxes */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/60 text-xs font-mono">
                        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
                          <span className="text-slate-500 text-[10px] block uppercase">Input Tokens</span>
                          <span className="text-sm font-bold text-cyan-300">
                            {(node.input_tokens_today ?? 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Cap: {(working.max_input_tokens ?? 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
                          <span className="text-slate-500 text-[10px] block uppercase">Output Tokens</span>
                          <span className="text-sm font-bold text-emerald-300">
                            {(node.output_tokens_today ?? 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Cap: {(working.max_output_tokens ?? 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
                          <span className="text-slate-500 text-[10px] block uppercase">Thinking Budget</span>
                          <span className="text-sm font-bold text-purple-300">
                            {(node.thinking_tokens_today ?? 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Budget: {(working.thinking_budget ?? 0).toLocaleString()}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60">
                          <span className="text-slate-500 text-[10px] block uppercase">In-Flight Leases</span>
                          <span className="text-sm font-bold text-amber-300">
                            {node.in_flight_requests ?? 0} reqs
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {(node.in_flight_reserved_tokens ?? 0).toLocaleString()} tok locked
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB B: SUB-AGENT BOUNDS EDITOR */}
      {activeTab === 'SUB_AGENTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
            <span>Configured Sub-Agent Roles & Token Caps</span>
            <span className="font-mono text-slate-500">{Object.keys(subAgents).length} agent roles</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(subAgents).map(([agentName, profile]) => {
              const compLevel = profile.complexity_level || 'MEDIUM';
              const compColor =
                compLevel === 'CRITICAL'
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : compLevel === 'HIGH'
                  ? 'bg-amber-950 text-amber-300 border-amber-800'
                  : compLevel === 'LOW'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : 'bg-blue-950 text-blue-300 border-blue-800';

              return (
                <div
                  key={agentName}
                  className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm font-mono">{agentName}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-cyan-300 font-mono font-semibold flex items-center gap-1">
                            <Bot className="w-3 h-3 text-cyan-400" /> {profile.model}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                            {profile.provider || 'GOOGLE'}
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider border ${compColor}`}>
                        {compLevel}
                      </span>
                    </div>

                    {/* Token Bounds Badges */}
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/60">
                        <span className="text-slate-500 text-[10px] block">Max Input</span>
                        <span className="text-white font-bold">{profile.max_input_tokens?.toLocaleString() ?? '—'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/60">
                        <span className="text-slate-500 text-[10px] block">Max Output</span>
                        <span className="text-emerald-300 font-bold">{profile.max_output_tokens?.toLocaleString() ?? '—'}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/60">
                        <span className="text-slate-500 text-[10px] block">Thinking Cap</span>
                        <span className="text-purple-300 font-bold">{profile.thinking_budget?.toLocaleString() ?? '0'}</span>
                      </div>
                    </div>

                    {/* Ideal For tags */}
                    {profile.ideal_for && profile.ideal_for.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {profile.ideal_for.map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-300 text-[11px] border border-slate-700/50"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500 text-[11px]">
                      {profile.rpm} RPM · {(profile.tpm || 0).toLocaleString()} TPM · {profile.rpd} RPD
                    </span>
                    <button
                      onClick={() => setEditingAgent({ agent_name: agentName, data: { ...profile } })}
                      className="px-3 py-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-800/80 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Sliders className="w-3 h-3 text-purple-300" />
                      Configure Bounds
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: EDIT MODEL LIMITS */}
      {editingModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white font-mono">{editingModel.model_name}</h3>
                <span className="text-xs text-slate-400">
                  {editingModel.provider} / {editingModel.tier} Quota Bounds
                </span>
              </div>
              <button onClick={() => setEditingModel(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <span className="font-bold text-slate-300 uppercase tracking-wider block">
                Working Limits (Enforced Pacing & Token Bounds)
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Working RPM</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.rpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, rpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Working TPM</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.tpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, tpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Working RPD</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.rpd}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, rpd: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Max Input Tokens</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.max_input_tokens}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, max_input_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Output Tokens</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.max_output_tokens}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, max_output_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Thinking Budget</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.thinking_budget}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, thinking_budget: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <span className="font-bold text-slate-300 uppercase tracking-wider block pt-2 border-t border-slate-800">
                Strict API Limits (Hard Quota Thresholds)
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Strict RPM</label>
                  <input
                    type="number"
                    value={editingModel.strict_limits.rpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        strict_limits: { ...editingModel.strict_limits, rpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Strict TPM</label>
                  <input
                    type="number"
                    value={editingModel.strict_limits.tpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        strict_limits: { ...editingModel.strict_limits, tpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Strict RPD</label>
                  <input
                    type="number"
                    value={editingModel.strict_limits.rpd}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        strict_limits: { ...editingModel.strict_limits, rpd: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingModel(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModelLimits}
                disabled={modelSaving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {modelSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Persist Model Limits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PROVIDER / MODEL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Add Provider / Model</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Provider Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">Select Provider Platform</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['GOOGLE', 'GROQ', 'OLLAMA', 'OPENAI', 'ANTHROPIC', 'DEEPSEEK'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAddProvider(p)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                        addProvider === p
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddProvider('CUSTOM')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      addProvider === 'CUSTOM'
                        ? 'bg-blue-600 border-blue-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Custom...
                  </button>
                </div>
                {addProvider === 'CUSTOM' && (
                  <input
                    type="text"
                    placeholder="Enter custom provider name (e.g. MISTRAL)"
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                )}
              </div>

              {/* Tier & Model Name */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tier</label>
                  <select
                    value={addTier}
                    onChange={(e) => setAddTier(e.target.value as 'FREE' | 'PAID' | 'LOCAL')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="FREE">FREE</option>
                    <option value="PAID">PAID</option>
                    <option value="LOCAL">LOCAL</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Model Identifier</label>
                  <input
                    type="text"
                    placeholder="e.g. llama-3.3-70b-versatile or claude-3-7-sonnet"
                    value={addModelName}
                    onChange={(e) => setAddModelName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              {/* Working Limits */}
              <span className="font-bold text-slate-300 uppercase tracking-wider block pt-2 border-t border-slate-800">
                Working Limits
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Working RPM</label>
                  <input
                    type="number"
                    value={addWorkingRpm}
                    onChange={(e) => setAddWorkingRpm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Working TPM</label>
                  <input
                    type="number"
                    value={addWorkingTpm}
                    onChange={(e) => setAddWorkingTpm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Working RPD</label>
                  <input
                    type="number"
                    value={addWorkingRpd}
                    onChange={(e) => setAddWorkingRpd(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Max Input</label>
                  <input
                    type="number"
                    value={addMaxInput}
                    onChange={(e) => setAddMaxInput(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Output</label>
                  <input
                    type="number"
                    value={addMaxOutput}
                    onChange={(e) => setAddMaxOutput(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Thinking Budget</label>
                  <input
                    type="number"
                    value={addThinkingBudget}
                    onChange={(e) => setAddThinkingBudget(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              {/* Strict Limits */}
              <span className="font-bold text-slate-300 uppercase tracking-wider block pt-2 border-t border-slate-800">
                Strict API Limits
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Strict RPM</label>
                  <input
                    type="number"
                    value={addStrictRpm}
                    onChange={(e) => setAddStrictRpm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Strict TPM</label>
                  <input
                    type="number"
                    value={addStrictTpm}
                    onChange={(e) => setAddStrictTpm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Strict RPD</label>
                  <input
                    type="number"
                    value={addStrictRpd}
                    onChange={(e) => setAddStrictRpd(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddProviderModel}
                disabled={addSaving || !addModelName.trim()}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {addSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Add Model to Hierarchy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SUB-AGENT BOUNDS */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white font-mono">{editingAgent.agent_name}</h3>
                <span className="text-xs text-slate-400">Configure Sub-Agent Role Token Bounds</span>
              </div>
              <button onClick={() => setEditingAgent(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Assigned Model Identifier</label>
                  <input
                    type="text"
                    value={editingAgent.data.model}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, model: e.target.value }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Provider Tag</label>
                  <input
                    type="text"
                    value={editingAgent.data.provider || 'GOOGLE'}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, provider: e.target.value.toUpperCase() }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Max Input Tokens</label>
                  <input
                    type="number"
                    value={editingAgent.data.max_input_tokens}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, max_input_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Output Tokens</label>
                  <input
                    type="number"
                    value={editingAgent.data.max_output_tokens}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, max_output_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Thinking Budget</label>
                  <input
                    type="number"
                    value={editingAgent.data.thinking_budget}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, thinking_budget: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Agent RPM</label>
                  <input
                    type="number"
                    value={editingAgent.data.rpm}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, rpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Agent TPM</label>
                  <input
                    type="number"
                    value={editingAgent.data.tpm}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, tpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Agent RPD</label>
                  <input
                    type="number"
                    value={editingAgent.data.rpd}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, rpd: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingAgent(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSubAgentBounds}
                disabled={agentSaving}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {agentSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Persist Agent Bounds
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenGovernor;
