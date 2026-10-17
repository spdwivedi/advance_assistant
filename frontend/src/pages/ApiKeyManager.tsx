import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key,
  Shield,
  Check,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Pin,
  Globe,
  Sliders,
  Layers,
  Sparkles,
  Zap,
  CheckSquare,
  Square,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
  Eye,
  EyeOff,
  Terminal,
  Filter
} from 'lucide-react';

export interface KeyItem {
  id: string;
  key: string;
  provider?: string;
  tier: 'FREE' | 'PAID';
  label: string;
  is_selected: boolean;
  status: 'ACTIVE' | 'EXHAUSTED' | 'INVALID';
  last_used: string | null;
  error_count: number;
  cooldown_remaining_sec: number;
  requests_today?: number;
}

export interface PolicyStatus {
  routing_policy: 'GLOBAL_HYBRID' | 'FREE_POOL' | 'PAID_POOL' | 'SINGLE_PINNED';
  pinned_key_id: string | null;
  total_keys: number;
  selected_keys: number;
  free_keys: number;
  paid_keys: number;
  selected_free_keys: number;
  selected_paid_keys: number;
  active_keys: number;
  exhausted_keys: number;
  google_keys?: number;
  groq_keys?: number;
  selected_google_keys?: number;
  selected_groq_keys?: number;
  paid_tier_locked?: boolean;
}

export interface TestResult {
  valid: boolean;
  message?: string;
  response_snippet?: string;
  error?: string;
}

export const ApiKeyManager: React.FC = () => {
  const navigate = useNavigate();

  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [policyData, setPolicyData] = useState<PolicyStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Top Controls Filter States
  const [providerFilter, setProviderFilter] = useState<'ALL' | 'GOOGLE' | 'GROQ'>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'FREE' | 'PAID'>('ALL');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Add Key Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newKeyString, setNewKeyString] = useState<string>('');
  const [newKeyProvider, setNewKeyProvider] = useState<'GOOGLE' | 'GROQ'>('GOOGLE');
  const [newKeyTier, setNewKeyTier] = useState<'FREE' | 'PAID'>('FREE');
  const [newKeyLabel, setNewKeyLabel] = useState<string>('');
  const [newKeyIsSelected, setNewKeyIsSelected] = useState<boolean>(true);
  const [showKeySecret, setShowKeySecret] = useState<boolean>(false);
  const [modalTesting, setModalTesting] = useState<boolean>(false);
  const [modalTestResult, setModalTestResult] = useState<TestResult | null>(null);
  const [modalSaving, setModalSaving] = useState<boolean>(false);

  // Notification Toast Helper
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  // Fetch Keys & Policy
  const fetchKeyData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const [keysRes, policyRes, hierRes] = await Promise.all([
        fetch('/api/keys'),
        fetch('/api/keys/policy'),
        fetch('/api/governor/hierarchy').catch(() => null)
      ]);

      if (keysRes.ok) {
        const kData = await keysRes.json();
        setKeys(kData.keys || []);
        if (kData.routing_status) {
          setPolicyData(kData.routing_status);
        }
      }

      if (policyRes.ok) {
        const pData = await policyRes.json();
        if (hierRes && hierRes.ok) {
          try {
            const hData = await hierRes.json();
            if (hData.key_pool) {
              pData.paid_tier_locked = hData.key_pool.paid_tier_locked;
              pData.google_keys = hData.key_pool.google_keys;
              pData.groq_keys = hData.key_pool.groq_keys;
            }
          } catch (e) {
            // ignore
          }
        }
        setPolicyData(pData);
      }
    } catch (err) {
      if (!isSilent) {
        showToast('Failed to connect to backend key bridge API.', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchKeyData(true);
    const interval = setInterval(() => {
      fetchKeyData(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchKeyData]);

  // Policy Switcher
  const handlePolicyChange = async (
    newPolicy: 'GLOBAL_HYBRID' | 'FREE_POOL' | 'PAID_POOL' | 'SINGLE_PINNED',
    pinnedId?: string | null
  ) => {
    try {
      const payload: { routing_policy: string; pinned_key_id?: string | null } = {
        routing_policy: newPolicy,
        pinned_key_id: pinnedId !== undefined ? pinnedId : policyData?.pinned_key_id
      };

      if (newPolicy === 'SINGLE_PINNED' && !payload.pinned_key_id) {
        const firstKey = keys.find((k) => k.is_selected) || keys[0];
        if (firstKey) payload.pinned_key_id = firstKey.id;
      }

      const res = await fetch('/api/keys/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(`Routing policy updated to ${newPolicy}.`, 'success');
        fetchKeyData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Policy change failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error updating routing policy.', 'error');
    }
  };

  // Toggle Key Selection
  const handleToggleSelection = async (keyId: string, currentSelected: boolean) => {
    try {
      const res = await fetch('/api/keys/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId, is_selected: !currentSelected })
      });

      if (res.ok) {
        setKeys((prev) =>
          prev.map((k) => (k.id === keyId ? { ...k, is_selected: !currentSelected } : k))
        );
        fetchKeyData(true);
      } else {
        showToast('Failed to toggle key selection status.', 'error');
      }
    } catch (err) {
      showToast('Error contacting key selection endpoint.', 'error');
    }
  };

  // Batch Selection
  const handleBatchToggle = async (tier: 'FREE' | 'PAID', selectAll: boolean) => {
    const targetKeys = keys.filter((k) => k.tier === tier && k.is_selected !== selectAll);
    if (targetKeys.length === 0) return;

    try {
      await Promise.all(
        targetKeys.map((k) =>
          fetch('/api/keys/selection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key_id: k.id, is_selected: selectAll })
          })
        )
      );

      showToast(
        `${selectAll ? 'Selected' : 'Deselected'} all ${tier} tier keys.`,
        'success'
      );
      fetchKeyData(true);
    } catch (err) {
      showToast(`Batch toggle failed for ${tier} keys.`, 'error');
    }
  };

  // 1-Click Pin Key Shortcut
  const handlePinKey = (keyId: string) => {
    handlePolicyChange('SINGLE_PINNED', keyId);
  };

  // Copy Masked Key
  const handleCopy = (keyId: string, keyVal: string) => {
    navigator.clipboard.writeText(keyVal);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Test Existing Key
  const handleTestKey = async (keyId: string, provider?: string) => {
    setTestingKeyId(keyId);
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keyId, provider: provider || 'GOOGLE' })
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [keyId]: data }));
      if (data.valid) {
        showToast(`Key validated successfully with ${provider || 'Google GenAI'}.`, 'success');
      } else {
        showToast(data.error || 'Key authentication failed.', 'error');
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [keyId]: { valid: false, error: 'Network error communicating with test endpoint.' }
      }));
    } finally {
      setTestingKeyId(null);
    }
  };

  // Delete Key
  const handleDeleteKey = async (keyId: string) => {
    if (!window.confirm('Are you sure you want to delete this API key from the persistent pool?')) {
      return;
    }
    setDeletingKeyId(keyId);
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('API key removed from pool.', 'success');
        fetchKeyData(true);
      } else {
        showToast('Failed to remove API key.', 'error');
      }
    } catch (err) {
      showToast('Error removing key.', 'error');
    } finally {
      setDeletingKeyId(null);
    }
  };

  // Auto-detect provider on paste in modal
  const handleKeyStringChange = (val: string) => {
    setNewKeyString(val);
    const trimmed = val.trim();
    if (trimmed.startsWith('gsk_')) {
      setNewKeyProvider('GROQ');
    } else if (trimmed.startsWith('AIza')) {
      setNewKeyProvider('GOOGLE');
    }
  };

  // Test In Modal
  const handleModalTestKey = async () => {
    if (!newKeyString.trim()) {
      setModalTestResult({ valid: false, error: 'Please enter an API key to test.' });
      return;
    }
    setModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await fetch('/api/keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKeyString.trim(), provider: newKeyProvider })
      });
      const data = await res.json();
      setModalTestResult(data);
    } catch (err) {
      setModalTestResult({ valid: false, error: 'Failed to test key connection.' });
    } finally {
      setModalTesting(false);
    }
  };

  // Save In Modal
  const handleSaveNewKey = async () => {
    if (!newKeyString.trim()) {
      showToast('API key string cannot be blank.', 'error');
      return;
    }
    setModalSaving(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKeyString.trim(),
          provider: newKeyProvider,
          tier: newKeyTier,
          label: newKeyLabel.trim() || undefined,
          is_selected: newKeyIsSelected
        })
      });

      if (res.ok) {
        showToast('New API key registered and persisted successfully.', 'success');
        setIsAddModalOpen(false);
        setNewKeyString('');
        setNewKeyLabel('');
        setNewKeyProvider('GOOGLE');
        setModalTestResult(null);
        fetchKeyData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Registration failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Network error registering key.', 'error');
    } finally {
      setModalSaving(false);
    }
  };

  // Toggle card expansion
  const toggleKeyExpanded = (id: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered Keys
  const filteredKeys = useMemo(() => {
    return keys.filter((k) => {
      const p = k.provider || (k.key.startsWith('gsk_') ? 'GROQ' : 'GOOGLE');
      if (providerFilter !== 'ALL' && p !== providerFilter) return false;
      if (tierFilter !== 'ALL' && k.tier !== tierFilter) return false;
      return true;
    });
  }, [keys, providerFilter, tierFilter]);

  return (
    <div id="api-key-manager-page" className="space-y-6 pb-12">
      {/* Toast Notification */}
      {feedbackMsg && (
        <div
          id="key-toast"
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-mono transition-all animate-bounce ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-glow-emerald'
              : feedbackMsg.type === 'error'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/50'
              : 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : feedbackMsg.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. COMPACT TOP CONTROL BAR                                     */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900/90 to-purple-950/40 border border-indigo-500/20 p-4 sm:p-5 backdrop-blur shadow-2xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Title & Active Pool Summary */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-xs font-semibold text-indigo-300">
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              <span>Multi-Provider Key Matrix</span>
            </span>

            {/* Active Pool Summary Pill */}
            <span
              id="active-pool-summary-pill"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300"
            >
              <span>
                🔑 <strong className="text-white">{policyData?.selected_keys || 0}</strong>/
                {policyData?.total_keys || keys.length} Selected
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-emerald-400 font-bold">
                Free: {policyData?.selected_free_keys || 0}
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-amber-400 font-bold">
                Paid: {policyData?.selected_paid_keys || 0}
              </span>
            </span>
          </div>

          {/* Right: Quick-Controls (Dropdowns & Actions) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Provider Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Provider:</span>
              <select
                id="keys-provider-filter-select"
                aria-label="Filter Provider"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value as any)}
                className="bg-transparent text-indigo-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">ALL Providers</option>
                <option value="GOOGLE" className="bg-slate-900 text-slate-200">☁️ Google Gemini</option>
                <option value="GROQ" className="bg-slate-900 text-slate-200">⚡ Groq Cloud LPU</option>
              </select>
            </div>

            {/* Tier Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Tier:</span>
              <select
                id="keys-tier-filter-select"
                aria-label="Filter Tier"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as any)}
                className="bg-transparent text-indigo-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">ALL Tiers</option>
                <option value="FREE" className="bg-slate-900 text-slate-200">Free Pool</option>
                <option value="PAID" className="bg-slate-900 text-slate-200">Paid Pool</option>
              </select>
            </div>

            {/* Routing Policy Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Policy:</span>
              <select
                id="keys-routing-policy-select"
                aria-label="Routing Policy"
                value={policyData?.routing_policy || 'GLOBAL_HYBRID'}
                onChange={(e) => handlePolicyChange(e.target.value as any)}
                className="bg-transparent text-purple-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="GLOBAL_HYBRID" className="bg-slate-900 text-slate-200">GLOBAL_HYBRID</option>
                <option value="FREE_POOL" className="bg-slate-900 text-slate-200">FREE_POOL Only</option>
                <option value="PAID_POOL" className="bg-slate-900 text-slate-200">PAID_POOL Only</option>
                <option value="SINGLE_PINNED" className="bg-slate-900 text-slate-200">SINGLE_PINNED</option>
              </select>
            </div>

            {/* + Add API Key Button */}
            <button
              id="add-api-key-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-mono font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Key</span>
            </button>

            {/* Global Execution Logs Shortcut */}
            <button
              id="keys-nav-logs-btn"
              onClick={() => navigate('/logs')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono transition-colors shadow-sm"
              title="Jump to full-screen execution logs"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Global Logs</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. COLLAPSIBLE POLICY & BATCH ACTIONS STRIP                   */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-2">
        {/* Pinned Key Selector if SINGLE_PINNED */}
        {policyData?.routing_policy === 'SINGLE_PINNED' && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 font-mono text-xs">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-purple-400" />
              <span className="text-purple-300 font-bold">Single Pinned Key Routing:</span>
              <span className="text-slate-400">All agent dispatches will be pinned exclusively to:</span>
            </div>
            <select
              value={policyData.pinned_key_id || ''}
              onChange={(e) => handlePolicyChange('SINGLE_PINNED', e.target.value)}
              className="bg-slate-900 border border-purple-500/40 rounded-lg px-3 py-1 text-purple-200 font-bold text-xs focus:outline-none"
            >
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} ({k.provider || 'GOOGLE'} &bull; {k.tier}) - {k.key}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Paid Tier Spend Lock Banner */}
        {policyData?.paid_tier_locked && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 font-mono text-xs shadow-glow-emerald">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Paid Tier Spend Lock is Active</strong> &mdash; Paid keys are shielded against API consumption; routing strictly to Free & Local pools.
            </span>
          </div>
        )}

        {/* Batch Actions Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Batch Pool Inclusions:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBatchToggle('FREE', true)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 hover:border-emerald-500/40 transition-colors text-[11px]"
            >
              Select All Free
            </button>
            <button
              onClick={() => handleBatchToggle('FREE', false)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 hover:text-white transition-colors text-[11px]"
            >
              Deselect All Free
            </button>
            <button
              onClick={() => handleBatchToggle('PAID', true)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 hover:border-amber-500/40 transition-colors text-[11px]"
            >
              Select All Paid
            </button>
            <button
              onClick={() => handleBatchToggle('PAID', false)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 hover:text-white transition-colors text-[11px]"
            >
              Deselect All Paid
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. MINIMALIST KEY CARDS WITH CLICK-TO-EXPAND DETAILS          */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between text-slate-400 px-1">
          <span>
            Registered Keys: <strong className="text-white">{filteredKeys.length}</strong>
          </span>
          <span className="text-[11px]">Click "Actions & Stats" to test, pin, or delete</span>
        </div>

        {filteredKeys.length === 0 ? (
          <div className="p-8 text-center text-slate-500 rounded-xl border border-slate-800 bg-slate-950/60 font-mono text-xs">
            No API keys match current provider/tier filters. Click "+ Add Key" to register credentials.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredKeys.map((key) => {
              const isExpanded = expandedKeys.has(key.id);
              const prov = key.provider || (key.key.startsWith('gsk_') ? 'GROQ' : 'GOOGLE');
              const isPinned = policyData?.pinned_key_id === key.id;

              return (
                <div
                  key={key.id}
                  id={`key-card-${key.id}`}
                  className={`glass-panel rounded-xl border transition-all p-3.5 space-y-3 ${
                    isPinned
                      ? 'border-purple-500/60 bg-purple-950/20 shadow-glow-sm'
                      : key.is_selected
                      ? 'border-slate-800 hover:border-slate-700 bg-slate-950/80'
                      : 'border-slate-800/60 opacity-60 bg-slate-950/40'
                  }`}
                >
                  {/* Default Collapsed Row (Compact Elements 1-5) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Element 1 & 2: Checkbox, Label & Masked Key */}
                    <div className="flex items-center gap-3 truncate">
                      <button
                        onClick={() => handleToggleSelection(key.id, key.is_selected)}
                        className="text-slate-400 hover:text-white transition-colors shrink-0"
                        title={key.is_selected ? 'Exclude from active pool' : 'Include in active pool'}
                      >
                        {key.is_selected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs truncate">
                            {key.label || 'Unnamed Key'}
                          </span>
                          {isPinned && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
                              <Pin className="w-2.5 h-2.5" /> PINNED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] pt-0.5">
                          <span>{key.key}</span>
                          <button
                            onClick={() => handleCopy(key.id, key.key)}
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                            title="Copy masked key"
                          >
                            {copiedKeyId === key.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Element 3, 4 & 5: Badges, Status & Expand Button */}
                    <div className="flex items-center gap-2.5 justify-between sm:justify-end shrink-0">
                      {/* Provider Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          prov === 'GROQ'
                            ? 'bg-orange-950/80 text-orange-300 border-orange-800'
                            : 'bg-blue-950/80 text-blue-300 border-blue-800'
                        }`}
                      >
                        {prov === 'GROQ' ? '⚡ GROQ' : '☁️ GOOGLE'}
                      </span>

                      {/* Tier Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          key.tier === 'PAID'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {key.tier}
                      </span>

                      {/* Status Pill */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          key.status === 'ACTIVE'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700'
                            : key.status === 'EXHAUSTED'
                            ? 'bg-rose-950/80 text-rose-400 border-rose-700'
                            : 'bg-amber-950/80 text-amber-400 border-amber-700'
                        }`}
                      >
                        {key.cooldown_remaining_sec > 0
                          ? `⏳ COOLDOWN ${key.cooldown_remaining_sec}s`
                          : `🟢 ${key.status}`}
                      </span>

                      {/* Expand Button */}
                      <button
                        onClick={() => toggleKeyExpanded(key.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors"
                      >
                        <span>{isExpanded ? 'Less' : 'Actions & Stats'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Click-to-Expand Key Drawer */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-3 font-mono text-xs">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-500 block">Key ID</span>
                          <span className="text-slate-300 font-bold truncate block">{key.id}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-500 block">Requests Today</span>
                          <span className="text-slate-200 font-bold block">{key.requests_today || 0}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-500 block">Error Count</span>
                          <span className="text-slate-200 font-bold block">{key.error_count || 0}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900 border border-slate-800">
                          <span className="text-slate-500 block">Last Active</span>
                          <span className="text-slate-400 truncate block">
                            {key.last_used ? new Date(key.last_used).toLocaleTimeString() : 'Never'}
                          </span>
                        </div>
                      </div>

                      {/* Test Result Feedback if triggered */}
                      {testResults[key.id] && (
                        <div
                          className={`p-2.5 rounded-lg border text-[11px] ${
                            testResults[key.id].valid
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          <div className="font-bold flex items-center gap-1.5">
                            {testResults[key.id].valid ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            <span>{testResults[key.id].valid ? 'Key Validated' : 'Validation Failed'}</span>
                          </div>
                          <p className="pt-0.5 text-[10px] text-slate-300">
                            {testResults[key.id].message || testResults[key.id].error}
                          </p>
                        </div>
                      )}

                      {/* Actions Buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => handleTestKey(key.id, prov)}
                          disabled={testingKeyId === key.id}
                          className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs transition-colors disabled:opacity-50"
                        >
                          <Zap className="w-3 h-3 text-indigo-400" />
                          <span>{testingKeyId === key.id ? 'Testing...' : 'Test Key'}</span>
                        </button>

                        <button
                          onClick={() => handlePinKey(key.id)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 text-xs transition-colors"
                        >
                          <Pin className="w-3 h-3 text-purple-400" />
                          <span>Pin Key</span>
                        </button>

                        <button
                          onClick={() => handleDeleteKey(key.id)}
                          disabled={deletingKeyId === key.id}
                          className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/60 text-xs transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3 text-rose-400" />
                          <span>Delete Key</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. MODAL: ADD API KEY CREDENTIALS                             */}
      {/* ------------------------------------------------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                <span>Register API Key</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">API Key Secret String</label>
                <div className="relative">
                  <input
                    type={showKeySecret ? 'text' : 'password'}
                    value={newKeyString}
                    onChange={(e) => handleKeyStringChange(e.target.value)}
                    placeholder="AIzaSy... or gsk_..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-9 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeySecret(!showKeySecret)}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showKeySecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Provider</label>
                  <select
                    value={newKeyProvider}
                    onChange={(e) => setNewKeyProvider(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="GOOGLE">☁️ Google Gemini</option>
                    <option value="GROQ">⚡ Groq Cloud LPU</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Quota Tier</label>
                  <select
                    value={newKeyTier}
                    onChange={(e) => setNewKeyTier(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="FREE">Free Tier Pool</option>
                    <option value="PAID">Paid Tier Pool</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Key Label (Optional)</label>
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="e.g. Primary Developer Key"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newKeyIsSelected}
                  onChange={(e) => setNewKeyIsSelected(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-0"
                />
                <span className="text-slate-300 text-[11px]">Include immediately in active rotation pool</span>
              </label>

              {/* Modal Test Result */}
              {modalTestResult && (
                <div
                  className={`p-2.5 rounded-lg border text-[11px] ${
                    modalTestResult.valid
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {modalTestResult.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>{modalTestResult.valid ? 'Authentication Succeeded' : 'Authentication Failed'}</span>
                  </div>
                  <p className="pt-0.5 text-[10px] text-slate-300">
                    {modalTestResult.message || modalTestResult.error}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleModalTestKey}
                disabled={modalTesting || !newKeyString.trim()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors disabled:opacity-40"
              >
                {modalTesting ? 'Testing...' : 'Test Connection'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewKey}
                  disabled={modalSaving || !newKeyString.trim()}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all disabled:opacity-50"
                >
                  {modalSaving ? 'Saving...' : 'Register Key'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
