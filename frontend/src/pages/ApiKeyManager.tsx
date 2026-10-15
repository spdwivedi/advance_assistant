import React, { useState, useEffect, useCallback } from 'react';
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
  Info
} from 'lucide-react';

interface KeyItem {
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
}

interface PolicyStatus {
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

interface TestResult {
  valid: boolean;
  message?: string;
  response_snippet?: string;
  error?: string;
}

export const ApiKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [policyData, setPolicyData] = useState<PolicyStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Filter state
  const [providerFilter, setProviderFilter] = useState<'ALL' | 'GOOGLE' | 'GROQ'>('ALL');

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
      showToast('Failed to connect to backend key bridge API.', 'error');
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
      const payload: { policy: string; pinned_key_id?: string | null } = {
        policy: newPolicy,
        pinned_key_id: pinnedId !== undefined ? pinnedId : policyData?.pinned_key_id
      };

      if (newPolicy === 'SINGLE_PINNED' && !payload.pinned_key_id) {
        // Default to first active selected key if none chosen
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
        const err = await res.json();
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
        const err = await res.json();
        showToast(`Registration failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Network error registering key.', 'error');
    } finally {
      setModalSaving(false);
    }
  };

  // Key filter by provider
  const googleKeysCount = keys.filter((k) => (k.provider || 'GOOGLE').toUpperCase() === 'GOOGLE').length;
  const groqKeysCount = keys.filter((k) => (k.provider || '').toUpperCase() === 'GROQ').length;

  const filteredKeys = keys.filter((k) => {
    if (providerFilter === 'GOOGLE') return (k.provider || 'GOOGLE').toUpperCase() === 'GOOGLE';
    if (providerFilter === 'GROQ') return (k.provider || '').toUpperCase() === 'GROQ';
    return true;
  });

  const freeKeys = filteredKeys.filter((k) => k.tier === 'FREE');
  const paidKeys = filteredKeys.filter((k) => k.tier === 'PAID');
  const allFreeSelected = freeKeys.length > 0 && freeKeys.every((k) => k.is_selected);
  const allPaidSelected = paidKeys.length > 0 && paidKeys.every((k) => k.is_selected);

  const activePolicy = policyData?.routing_policy || 'GLOBAL_HYBRID';

  return (
    <div id="api-key-manager-page" className="p-6 max-w-7xl mx-auto space-y-6">
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
          {feedbackMsg.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
          <span className="text-sm font-medium">{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-white p-1 ml-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-glow-sm">
            <Key className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                API Key Matrix & Smart Dispatcher
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold tracking-wider text-cyan-400 bg-cyan-950/70 border border-cyan-800/60 rounded-full">
                v6.0 Engine
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Granular multi-key pooling, tier allocation (Free vs Paid), dynamic round-robin rotation, and automated 429 quota lockout isolation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            id="btn-refresh-keys"
            onClick={() => fetchKeyData(false)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
          <button
            id="btn-open-add-key-modal"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-glow-sm transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add API Key
          </button>
        </div>
      </div>

      {/* Top Policy Selector Banner */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Active Swarm Routing Policy</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Directly governs all cloud token allocations in agent pipeline
          </span>
        </div>

        {/* Radio Pill Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Policy: GLOBAL_HYBRID */}
          <button
            id="policy-pill-global-hybrid"
            onClick={() => handlePolicyChange('GLOBAL_HYBRID')}
            className={`flex flex-col text-left p-4 rounded-xl border transition-all relative ${
              activePolicy === 'GLOBAL_HYBRID'
                ? 'bg-gradient-to-br from-indigo-950/70 to-blue-950/50 border-indigo-500 shadow-glow-sm text-white'
                : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="flex items-center gap-2 font-bold text-sm text-indigo-300">
                <Globe className="w-4 h-4 text-indigo-400" />
                GLOBAL_HYBRID
              </span>
              {activePolicy === 'GLOBAL_HYBRID' && (
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-glow-sm animate-pulse" />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Model-Aware: Pro models prioritize Paid keys for architectural depth; Flash/Lite prioritize Free keys to conserve tokens.
            </p>
          </button>

          {/* Policy: FREE_POOL */}
          <button
            id="policy-pill-free-pool"
            onClick={() => handlePolicyChange('FREE_POOL')}
            className={`flex flex-col text-left p-4 rounded-xl border transition-all relative ${
              activePolicy === 'FREE_POOL'
                ? 'bg-gradient-to-br from-emerald-950/70 to-slate-900 border-emerald-500 shadow-glow-sm text-white'
                : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                <Zap className="w-4 h-4 text-emerald-400" />
                FREE_POOL
              </span>
              {activePolicy === 'FREE_POOL' && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-glow-sm animate-pulse" />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Strict Cost Containment: Round-robins exclusively across selected Free keys. Zero paid token consumption.
            </p>
          </button>

          {/* Policy: PAID_POOL */}
          <button
            id="policy-pill-paid-pool"
            onClick={() => handlePolicyChange('PAID_POOL')}
            className={`flex flex-col text-left p-4 rounded-xl border transition-all relative ${
              activePolicy === 'PAID_POOL'
                ? 'bg-gradient-to-br from-amber-950/70 to-slate-900 border-amber-500 shadow-glow-sm text-white'
                : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="flex items-center gap-2 font-bold text-sm text-amber-300">
                <Sparkles className="w-4 h-4 text-amber-400" />
                PAID_POOL
              </span>
              {activePolicy === 'PAID_POOL' && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-glow-sm animate-pulse" />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Maximum Throughput: Cycles only through selected Paid keys. Eliminates free-tier rate limitations.
            </p>
          </button>

          {/* Policy: SINGLE_PINNED */}
          <button
            id="policy-pill-single-pinned"
            onClick={() => handlePolicyChange('SINGLE_PINNED')}
            className={`flex flex-col text-left p-4 rounded-xl border transition-all relative ${
              activePolicy === 'SINGLE_PINNED'
                ? 'bg-gradient-to-br from-purple-950/70 to-slate-900 border-purple-500 shadow-glow-sm text-white'
                : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="flex items-center gap-2 font-bold text-sm text-purple-300">
                <Pin className="w-4 h-4 text-purple-400" />
                SINGLE_PINNED
              </span>
              {activePolicy === 'SINGLE_PINNED' && (
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-glow-sm animate-pulse" />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dedicated Key: Pins 100% of swarm cloud token requests to one chosen key. Direct attribution.
            </p>
          </button>
        </div>

        {/* Dedicated Pinned Selector (Visible when SINGLE_PINNED is active) */}
        {activePolicy === 'SINGLE_PINNED' && (
          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-sm font-semibold text-purple-200">
                Select Dedicated Pinned Key:
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                id="pinned-key-dropdown"
                value={policyData?.pinned_key_id || ''}
                onChange={(e) => handlePolicyChange('SINGLE_PINNED', e.target.value)}
                className="w-full sm:w-72 bg-slate-900 border border-purple-700/60 rounded-lg px-3 py-1.5 text-xs font-mono text-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    [{k.tier}] {k.label || 'Unnamed'} ({k.key}) {k.is_selected ? '✓' : '(unselected)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Bar & Batch Operations */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Registered</div>
          <div className="text-2xl font-mono font-bold text-white mt-1">
            {policyData?.total_keys ?? keys.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">In secure memory store</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Selected in Swarm</div>
          <div className="text-2xl font-mono font-bold text-blue-400 mt-1">
            {policyData?.selected_keys ?? keys.filter((k) => k.is_selected).length}
          </div>
          <div className="text-[11px] text-blue-400/70 mt-1 font-mono">Eligible for dispatch</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow flex flex-col justify-between">
          <div className="text-emerald-400/90 text-xs font-semibold uppercase tracking-wider">Active Free Keys</div>
          <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
            {policyData?.selected_free_keys ?? keys.filter((k) => k.tier === 'FREE' && k.is_selected).length}
          </div>
          <div className="text-[11px] text-emerald-500/70 mt-1 font-mono">Cost: $0.00 / token</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow flex flex-col justify-between">
          <div className="text-amber-400/90 text-xs font-semibold uppercase tracking-wider">Active Paid Keys</div>
          <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
            {policyData?.selected_paid_keys ?? keys.filter((k) => k.tier === 'PAID' && k.is_selected).length}
          </div>
          <div className="text-[11px] text-amber-500/70 mt-1 font-mono">Priority High-TPM</div>
        </div>
      </div>

      {/* Provider Filter Bar & Batch Toolbar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Filter by Provider:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setProviderFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                providerFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-glow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>All Providers</span>
              <span className="px-1.5 py-0.2 rounded bg-black/40 font-mono text-[10px] text-slate-300">
                {keys.length}
              </span>
            </button>
            <button
              onClick={() => setProviderFilter('GOOGLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                providerFilter === 'GOOGLE'
                  ? 'bg-cyan-700 text-white shadow-glow-sm border border-cyan-500/50'
                  : 'bg-slate-950 text-slate-400 hover:text-cyan-300 border border-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>Google Gemini</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-950/80 font-mono text-[10px] text-cyan-300">
                {googleKeysCount}
              </span>
            </button>
            <button
              onClick={() => setProviderFilter('GROQ')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                providerFilter === 'GROQ'
                  ? 'bg-purple-700 text-white shadow-glow-sm border border-purple-500/50'
                  : 'bg-slate-950 text-slate-400 hover:text-purple-300 border border-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>Groq Cloud LPU</span>
              <span className="px-1.5 py-0.2 rounded bg-purple-950/80 font-mono text-[10px] text-purple-300">
                {groqKeysCount}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <Layers className="w-4 h-4 text-slate-400" />
          <span>Batch Selection Controls:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => handleBatchToggle('FREE', !allFreeSelected)}
            disabled={freeKeys.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 transition-colors disabled:opacity-40"
          >
            {allFreeSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
            {allFreeSelected ? 'Deselect All Free' : 'Select All Free'} ({freeKeys.length})
          </button>

          <button
            onClick={() => handleBatchToggle('PAID', !allPaidSelected)}
            disabled={paidKeys.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 transition-colors disabled:opacity-40"
          >
            {allPaidSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
            {allPaidSelected ? 'Deselect All Paid' : 'Select All Paid'} ({paidKeys.length})
          </button>
        </div>
      </div>
      </div>

      {/* Dual-Column Key Management Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: FREE TIER KEYS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/40">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold tracking-tight text-emerald-300 uppercase">
                Free Tier Keys Pool
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
              {freeKeys.filter((k) => k.is_selected).length} / {freeKeys.length} Selected
            </span>
          </div>

          {freeKeys.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-slate-500 text-sm">
              <Zap className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              No Free tier keys registered yet. Click &quot;Add API Key&quot; to seed your free quota.
            </div>
          ) : (
            <div className="space-y-3">
              {freeKeys.map((item) => renderKeyCard(item))}
            </div>
          )}
        </div>

        {/* Column 2: PAID TIER KEYS */}
        <div className="space-y-4">
          {policyData?.paid_tier_locked && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/60 border border-emerald-500/50 text-emerald-200 flex items-center justify-between text-xs shadow-glow-sm animate-pulse">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-white">Paid Tier Financial Shield Active:</span> Paid keys are currently isolated to prevent billing spend. All swarm operations route through Free and Local pools.
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-900/90 border border-emerald-500 font-mono text-[10px] font-bold text-emerald-100 whitespace-nowrap shadow-sm">
                ZERO PAID SPEND
              </span>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-950/20 border border-amber-900/40">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold tracking-tight text-amber-300 uppercase">
                Paid / Pro Tier Keys Pool
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
              {paidKeys.filter((k) => k.is_selected).length} / {paidKeys.length} Selected
            </span>
          </div>

          {paidKeys.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-slate-500 text-sm">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              No Paid tier keys registered yet. Add paid keys for high-throughput Pro reasoning.
            </div>
          ) : (
            <div className="space-y-3">
              {paidKeys.map((item) => renderKeyCard(item))}
            </div>
          )}
        </div>
      </div>

      {/* Add API Key Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-5 relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Register New Gemini API Key</h3>
                <p className="text-xs text-slate-400">
                  Securely stored locally in <code className="text-cyan-400 font-mono">.agent_memory/api_keys.json</code>
                </p>
              </div>
            </div>

            {/* Secret Key Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Gemini API Key Secret <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showKeySecret ? 'text' : 'password'}
                  value={newKeyString}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewKeyString(val);
                    if (val.trim().startsWith('gsk_')) {
                      setNewKeyProvider('GROQ');
                    }
                  }}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowKeySecret(!showKeySecret)}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showKeySecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Tier Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Quota Allocation Tier
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewKeyTier('FREE')}
                  className={`p-3 rounded-xl border text-left flex flex-col transition-all ${
                    newKeyTier === 'FREE'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    FREE TIER
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    15 RPM / Free quota
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewKeyTier('PAID')}
                  className={`p-3 rounded-xl border text-left flex flex-col transition-all ${
                    newKeyTier === 'PAID'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    PAID / PAY-AS-YOU-GO
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    High RPM / Pro tokens
                  </span>
                </button>
              </div>
            </div>

            {/* Label Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Key Label / Description
              </label>
              <input
                type="text"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder={newKeyTier === 'FREE' ? 'Primary Free Key #1' : 'Production Paid Tier-1'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Pre-check Toggle */}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={newKeyIsSelected}
                onChange={(e) => setNewKeyIsSelected(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-300">
                Include in active routing pool immediately upon registration
              </span>
            </label>

            {/* Modal Test Result Output */}
            {modalTestResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono ${
                  modalTestResult.valid
                    ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                    : 'bg-rose-950/50 border-rose-700 text-rose-300'
                }`}
              >
                {modalTestResult.valid ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{modalTestResult.message || 'Key verified successfully!'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>{modalTestResult.error || 'Key authentication failed.'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleModalTestKey}
                disabled={modalTesting || !newKeyString.trim()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {modalTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Test Before Saving
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewKey}
                  disabled={modalSaving || !newKeyString.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-glow-sm transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {modalSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save & Register
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Helper Card Renderer
  function renderKeyCard(item: KeyItem) {
    const isPinned = policyData?.routing_policy === 'SINGLE_PINNED' && policyData?.pinned_key_id === item.id;
    const testResult = testResults[item.id];
    const isTesting = testingKeyId === item.id;
    const isDeleting = deletingKeyId === item.id;

    return (
      <div
        key={item.id}
        id={`key-card-${item.id}`}
        className={`p-4 rounded-xl border transition-all ${
          item.is_selected
            ? 'bg-slate-900/90 border-slate-700/80 shadow-md'
            : 'bg-slate-900/40 border-slate-800/60 opacity-75'
        } ${isPinned ? 'ring-2 ring-purple-500' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Checkbox & Details */}
          <div className="flex items-start gap-3 min-w-0">
            <input
              type="checkbox"
              checked={item.is_selected}
              onChange={() => handleToggleSelection(item.id, item.is_selected)}
              className="w-4 h-4 mt-1 rounded text-blue-600 bg-slate-950 border-slate-700 focus:ring-blue-500 shrink-0 cursor-pointer"
              title="Toggle inclusion in swarm routing pool"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-white truncate max-w-[200px]" title={item.label}>
                  {item.label || 'Unnamed Key'}
                </span>

                {/* Provider Badge */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider flex items-center gap-1 ${
                    (item.provider || 'GOOGLE').toUpperCase() === 'GROQ'
                      ? 'bg-purple-950 text-purple-300 border border-purple-800/80'
                      : 'bg-cyan-950 text-cyan-300 border border-cyan-800/80'
                  }`}
                >
                  {(item.provider || 'GOOGLE').toUpperCase() === 'GROQ' ? (
                    <>
                      <Zap className="w-2.5 h-2.5 text-purple-400" /> GROQ
                    </>
                  ) : (
                    <>
                      <Globe className="w-2.5 h-2.5 text-cyan-400" /> GOOGLE
                    </>
                  )}
                </span>

                {/* Tier Badge */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
                    item.tier === 'FREE'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                      : 'bg-amber-950 text-amber-400 border border-amber-800/80'
                  }`}
                >
                  {item.tier}
                </span>

                {/* Pinned Badge */}
                {isPinned && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-700 shadow-glow-sm">
                    <Pin className="w-2.5 h-2.5" /> PINNED
                  </span>
                )}
              </div>

              {/* Masked Secret & Copy */}
              <div className="flex items-center gap-2 mt-1.5 font-mono text-xs text-slate-400">
                <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                  {item.key}
                </span>
                <button
                  onClick={() => handleCopy(item.id, item.key)}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                  title="Copy masked key reference"
                >
                  {copiedKeyId === item.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0 text-right">
            {item.cooldown_remaining_sec > 0 || item.status === 'EXHAUSTED' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
                <Clock className="w-3 h-3 text-rose-400 animate-pulse" />
                Cooldown ({item.cooldown_remaining_sec}s)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Active
              </span>
            )}
          </div>
        </div>

        {/* Telemetry snippet & errors */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-3 pt-2.5 border-t border-slate-800/80">
          <div>
            Last used:{' '}
            <span className="text-slate-300">
              {item.last_used ? item.last_used.split(' ')[1] : 'Never'}
            </span>
          </div>
          <div>
            Error count:{' '}
            <span className={item.error_count > 0 ? 'text-amber-400' : 'text-slate-400'}>
              {item.error_count}
            </span>
          </div>
        </div>

        {/* Inline Test Result */}
        {testResult && (
          <div
            className={`mt-2 p-2 rounded-lg text-xs font-mono flex items-center justify-between ${
              testResult.valid
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                : 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
            }`}
          >
            <span>{testResult.valid ? '✓ Authenticated with Google GenAI' : `✗ ${testResult.error || 'Failed'}`}</span>
            <button
              onClick={() => {
                setTestResults((prev) => {
                  const updated = { ...prev };
                  delete updated[item.id];
                  return updated;
                });
              }}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-2">
          <button
            onClick={() => handlePinKey(item.id)}
            disabled={isPinned}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              isPinned
                ? 'bg-purple-950/80 text-purple-300 border-purple-700 cursor-default'
                : 'bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 border-slate-700/60'
            }`}
            title="Pin all requests to this key"
          >
            <Pin className="w-3 h-3" />
            {isPinned ? 'Pinned' : 'Pin Key'}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTestKey(item.id)}
              disabled={isTesting}
              className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/60 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin text-blue-400' : ''}`} />
              Test Key
            </button>

            <button
              onClick={() => handleDeleteKey(item.id)}
              disabled={isDeleting}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
              title="Delete key from pool"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export default ApiKeyManager;
