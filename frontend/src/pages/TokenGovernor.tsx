import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ArrowRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  TrendingUp,
  Coins,
  FileText,
  Terminal,
  ExternalLink,
  Filter,
  Search,
  Building2,
  Key,
  Database
} from 'lucide-react';

// ==========================================
// INTERFACES
// ==========================================

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
  has_custom_override?: boolean;
}

export interface KeyQuotaEntry {
  key_id: string;
  provider: string;
  tier: string;
  label: string;
  masked_key: string;
  safety_margin_percent?: number;
  total_requests_today?: number;
  models: Record<string, ModelHierarchyNode>;
}

export interface FinancialShieldData {
  paid_tier_locked: boolean;
  daily_paid_token_cap: number;
  per_build_paid_token_cap: number;
  enforce_working_limits: boolean;
  safety_margin_percent: number;
}

export interface HierarchyData {
  financial_shield: FinancialShieldData;
  paid_tokens_today: number;
  paid_tokens_current_build?: number;
  per_build_paid_token_cap?: number;
  active_build_project?: string;
  last_reset_date: string;
  active_in_flight_leases: number;
  providers: Record<string, Record<string, Record<string, ModelHierarchyNode>>>;
}

export interface SubAgentProfile {
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

export interface KeyPoolStatus {
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

export interface CostEstimateData {
  actual_paid_spend_usd: number;
  actual_paid_spend_inr: number;
  estimated_savings_usd: number;
  estimated_savings_inr: number;
  paid_tokens_today: number;
  paid_tokens_current_build: number;
  free_and_local_tokens_today: number;
  breakdown_by_provider: Record<string, number>;
}

export const TokenGovernor: React.FC = () => {
  const navigate = useNavigate();

  // 3-Tab Navigation
  const [activeTab, setActiveTab] = useState<'QUOTAS' | 'SUB_AGENTS' | 'COST_SAVINGS'>('QUOTAS');

  // Hierarchy Data & Telemetry
  const [hierarchy, setHierarchy] = useState<HierarchyData | null>(null);
  const [subAgents, setSubAgents] = useState<Record<string, SubAgentProfile>>({});
  const [keyPool, setKeyPool] = useState<KeyPoolStatus | null>(null);
  const [costEstimate, setCostEstimate] = useState<CostEstimateData>({
    actual_paid_spend_usd: 0,
    actual_paid_spend_inr: 0,
    estimated_savings_usd: 0,
    estimated_savings_inr: 0,
    paid_tokens_today: 0,
    paid_tokens_current_build: 0,
    free_and_local_tokens_today: 0,
    breakdown_by_provider: {}
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Key Scope & Stage 16.3 Sync states
  const [selectedKeyScope, setSelectedKeyScope] = useState<string>('GLOBAL');
  const [keyQuotas, setKeyQuotas] = useState<Record<string, KeyQuotaEntry>>({});
  const [syncingModels, setSyncingModels] = useState<boolean>(false);
  const [recalculating85, setRecalculating85] = useState<boolean>(false);
  const [recalcMarginPct, setRecalcMarginPct] = useState<number>(85);

  // Top Dropdown Filters
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'FREE' | 'PAID' | 'LOCAL'>('ALL');
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('');
  const [agentSearchQuery, setAgentSearchQuery] = useState<string>('');

  // Expanded Cards Sets
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Financial Shield Edit Drawer
  const [isShieldDrawerOpen, setIsShieldDrawerOpen] = useState<boolean>(false);
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

  // Fetch Hierarchy & Cost Telemetry
  const fetchHierarchyData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const [hierRes, costRes, kqRes] = await Promise.all([
        fetch('/api/governor/hierarchy'),
        fetch('/api/governor/cost-estimate').catch(() => null),
        fetch('/api/keys/quotas').catch(() => null)
      ]);

      if (kqRes && kqRes.ok) {
        const kqData = await kqRes.json();
        if (kqData.keys) {
          setKeyQuotas(kqData.keys);
        }
      }

      if (hierRes.ok) {
        const data = await hierRes.json();
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

      if (costRes && costRes.ok) {
        const costData = await costRes.json();
        if (costData.cost_estimate) {
          setCostEstimate(costData.cost_estimate);
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
          if (payload.cost_estimate) {
            setCostEstimate(payload.cost_estimate);
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

  // Available Providers in Hierarchy
  const availableProviders = useMemo(() => {
    if (!hierarchy?.providers) return ['GOOGLE', 'GROQ', 'OLLAMA'];
    return Object.keys(hierarchy.providers);
  }, [hierarchy]);

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
        setIsShieldDrawerOpen(false);
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

  // Stage 16.3: Sync Live & DB Models
  const handleSyncLiveModels = async () => {
    setSyncingModels(true);
    try {
      const res = await fetch('/api/governor/sync-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(
          `✅ Synced Models! ${data.google_free_count} Google Free, ${data.google_paid_count} Google Paid, ${data.groq_count} Groq, ${data.ollama_count} Local (85% Applied)`,
          'success'
        );
        fetchHierarchyData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Sync failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Sync error: ${err.message || String(err)}`, 'error');
    } finally {
      setSyncingModels(false);
    }
  };

  // Stage 16.3: Recalculate 85% Working Limits
  const handleRecalculate85 = async () => {
    setRecalculating85(true);
    try {
      const res = await fetch('/api/governor/recalculate-85', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safety_margin_percent: recalcMarginPct })
      });
      if (res.ok) {
        showToast(`✅ Applied ${recalcMarginPct}% working limits across all models & keys!`, 'success');
        fetchHierarchyData(true);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`Recalculation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Recalculation error: ${err.message || String(err)}`, 'error');
    } finally {
      setRecalculating85(false);
    }
  };

  // Save Model Limits (Global vs Per-Key)
  const handleSaveModelLimits = async () => {
    if (!editingModel) return;
    setModelSaving(true);
    try {
      if (selectedKeyScope !== 'GLOBAL') {
        // Dedicated Per-Key Limit Save
        const res = await fetch(`/api/keys/${selectedKeyScope}/limits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model_name: editingModel.model_name,
            working_limits: editingModel.working_limits
          })
        });
        if (res.ok) {
          showToast(`Dedicated key limits for '${editingModel.model_name}' saved to key '${selectedKeyScope}'.`, 'success');
          setEditingModel(null);
          fetchHierarchyData(true);
        } else {
          const err = await res.json();
          showToast(`Key limit update failed: ${err.detail || 'Unknown error'}`, 'error');
        }
      } else {
        // Global Limit Save
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
          showToast(`Global limits for '${editingModel.model_name}' persisted successfully.`, 'success');
          setEditingModel(null);
          fetchHierarchyData(true);
        } else {
          const err = await res.json();
          showToast(`Update failed: ${err.detail || 'Unknown error'}`, 'error');
        }
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
        showToast(`Update failed: ${err.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Error saving sub-agent bounds.', 'error');
    } finally {
      setAgentSaving(false);
    }
  };

  // Flat List of Models from Hierarchy for Tab 1
  interface FlatModelItem {
    id: string;
    model_name: string;
    provider: string;
    tier: string;
    node: ModelHierarchyNode;
  }

  const flatModels = useMemo(() => {
    const list: FlatModelItem[] = [];

    if (selectedKeyScope !== 'GLOBAL') {
      const keyEntry = keyQuotas[selectedKeyScope];
      if (keyEntry && keyEntry.models) {
        Object.entries(keyEntry.models).forEach(([mName, node]) => {
          list.push({
            id: `${keyEntry.provider}-${keyEntry.tier}-${mName}`,
            model_name: mName,
            provider: keyEntry.provider,
            tier: keyEntry.tier.toUpperCase(),
            node
          });
        });
      }
    } else {
      if (hierarchy?.providers) {
        Object.entries(hierarchy.providers).forEach(([prov, tiers]) => {
          Object.entries(tiers).forEach(([tier, models]) => {
            Object.entries(models).forEach(([mName, node]) => {
              list.push({
                id: `${prov}-${tier}-${mName}`,
                model_name: mName,
                provider: prov,
                tier: tier.toUpperCase(),
                node
              });
            });
          });
        });
      }
    }

    return list.filter((m) => {
      if (providerFilter !== 'ALL' && m.provider !== providerFilter) return false;
      if (tierFilter !== 'ALL' && m.tier !== tierFilter) return false;
      if (modelSearchQuery.trim()) {
        const q = modelSearchQuery.toLowerCase();
        if (!m.model_name.toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [hierarchy, keyQuotas, selectedKeyScope, providerFilter, tierFilter, modelSearchQuery]);

  // Filtered Sub-Agents for Tab 2
  const filteredSubAgents = useMemo(() => {
    return Object.entries(subAgents).filter(([agentName, agentData]) => {
      if (providerFilter !== 'ALL' && agentData.provider !== providerFilter) return false;
      if (agentSearchQuery.trim()) {
        const q = agentSearchQuery.toLowerCase();
        if (
          !agentName.toLowerCase().includes(q) &&
          !agentData.model.toLowerCase().includes(q) &&
          !agentData.complexity_level.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [subAgents, providerFilter, agentSearchQuery]);

  // Model expansion toggle
  const toggleModelExpanded = (id: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Agent expansion toggle
  const toggleAgentExpanded = (agentName: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  };

  // Calculate RPM & TPM Progress Percentages
  const getProgressStats = (node: ModelHierarchyNode) => {
    const rpm = node.rolling_rpm || 0;
    const maxRpm = node.working_limits?.rpm || node.strict_limits?.rpm || 1;
    const rpmPct = Math.min(Math.round((rpm / Math.max(maxRpm, 1)) * 100), 100);

    const tpm = node.rolling_tpm || 0;
    const maxTpm = node.working_limits?.tpm || node.strict_limits?.tpm || 1;
    const tpmPct = Math.min(Math.round((tpm / Math.max(maxTpm, 1)) * 100), 100);

    const isNearCap = tpmPct >= (hierarchy?.financial_shield?.safety_margin_percent || 85);

    return { rpm, maxRpm, rpmPct, tpm, maxTpm, tpmPct, isNearCap };
  };

  // Provider Breakdown Matrix for Tab 3
  const providerStatsList = useMemo(() => {
    const map: Record<
      string,
      {
        provider: string;
        paidTokens: number;
        freeLocalTokens: number;
        actualCostUsd: number;
        estimatedSavingsUsd: number;
      }
    > = {};

    // Initialize map with known providers
    availableProviders.forEach((p) => {
      map[p] = {
        provider: p,
        paidTokens: 0,
        freeLocalTokens: 0,
        actualCostUsd: costEstimate.breakdown_by_provider[p] || 0,
        estimatedSavingsUsd: 0
      };
    });

    if (hierarchy?.providers) {
      Object.entries(hierarchy.providers).forEach(([prov, tiers]) => {
        if (!map[prov]) {
          map[prov] = {
            provider: prov,
            paidTokens: 0,
            freeLocalTokens: 0,
            actualCostUsd: costEstimate.breakdown_by_provider[prov] || 0,
            estimatedSavingsUsd: 0
          };
        }
        Object.entries(tiers).forEach(([tier, models]) => {
          Object.values(models).forEach((node) => {
            const tot = node.total_tokens_today || 0;
            if (tier.toUpperCase() === 'PAID') {
              map[prov].paidTokens += tot;
            } else {
              map[prov].freeLocalTokens += tot;
              // Approximate benchmark savings
              const inTok = node.input_tokens_today || 0;
              const outTok = (node.output_tokens_today || 0) + (node.thinking_tokens_today || 0);
              map[prov].estimatedSavingsUsd += (inTok * 0.15 + outTok * 0.60) / 1_000_000;
            }
          });
        });
      });
    }

    return Object.values(map);
  }, [hierarchy, availableProviders, costEstimate]);

  return (
    <div id="token-governor-page" className="space-y-6 pb-12">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          id="governor-toast"
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
      {/* 1. COMPACT TOP BAR & FINANCIAL SHIELD SUMMARY STRIP           */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/90 to-indigo-950/40 border border-purple-500/20 p-4 sm:p-5 backdrop-blur shadow-2xl space-y-4">
        {/* Top Row: Title, Reset Anchor, Leases & Top Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Title & Live Indicators */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs font-semibold text-purple-300">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              <span>Token Governor & Quota Engine</span>
            </span>

            {/* Reset Anchor Pill */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>1:30 PM IST Reset</span>
            </span>

            {/* In-Flight Leases Pill */}
            <span
              id="active-leases-pill"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Leases: <strong className="text-amber-300">{hierarchy?.active_in_flight_leases || 0}</strong> active
              </span>
            </span>
          </div>

          {/* Right: Quick Controls Dropdowns & Navigation */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Dedicated Key Scope Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-indigo-500/40 rounded-xl px-2.5 py-1 text-xs font-mono shadow-sm">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Scope:</span>
              <select
                id="governor-key-scope-select"
                aria-label="Quota Scope"
                value={selectedKeyScope}
                onChange={(e) => setSelectedKeyScope(e.target.value)}
                className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="GLOBAL" className="bg-slate-900 text-slate-200">🌐 Global Provider/Tier Quotas</option>
                {Object.values(keyQuotas).map((k) => (
                  <option key={k.key_id} value={k.key_id} className="bg-slate-900 text-slate-200">
                    🔑 [{k.provider} {k.tier}] {k.label || k.key_id} ({k.masked_key})
                  </option>
                ))}
              </select>
            </div>

            {/* Sync Live & DB Models Button */}
            <button
              id="governor-sync-models-btn"
              onClick={handleSyncLiveModels}
              disabled={syncingModels}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/50 text-xs font-mono font-semibold transition-all shadow-sm"
              title="Sync latest live models from Google AI Studio, Groq, Ollama and Ollama_Models_Testing"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingModels ? 'animate-spin' : ''}`} />
              <span>{syncingModels ? 'Syncing...' : 'Sync Models'}</span>
            </button>

            {/* Recalculate 85% Limits Button */}
            <button
              id="governor-recalculate-85-btn"
              onClick={handleRecalculate85}
              disabled={recalculating85}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50 text-xs font-mono font-semibold transition-all shadow-sm"
              title="Reset all working limits to exact 85% of strict API limits"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{recalculating85 ? 'Calculating...' : '📐 Apply 85%'}</span>
            </button>

            {/* Provider Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Provider:</span>
              <select
                id="governor-provider-select"
                aria-label="Filter Provider"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="bg-transparent text-purple-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">ALL Providers</option>
                {availableProviders.map((p) => (
                  <option key={p} value={p} className="bg-slate-900 text-slate-200">
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Tier Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Tier:</span>
              <select
                id="governor-tier-select"
                aria-label="Filter Tier"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as any)}
                className="bg-transparent text-purple-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">ALL Tiers</option>
                <option value="FREE" className="bg-slate-900 text-slate-200">FREE</option>
                <option value="PAID" className="bg-slate-900 text-slate-200">PAID</option>
                <option value="LOCAL" className="bg-slate-900 text-slate-200">LOCAL</option>
              </select>
            </div>

            {/* + Add Model Button */}
            <button
              id="add-model-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-mono font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Model</span>
            </button>

            {/* Global Execution Logs Shortcut */}
            <button
              id="nav-logs-btn"
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

        {/* Compact Financial Shield Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            {/* Paid Tier Lock Toggle Button */}
            <button
              id="toggle-paid-tier-lock-btn"
              onClick={handleTogglePaidTierLock}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold border transition-all ${
                hierarchy?.financial_shield?.paid_tier_locked
                  ? 'bg-rose-950/80 text-rose-300 border-rose-600 shadow-glow-sm'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-600 shadow-glow-emerald'
              }`}
            >
              {hierarchy?.financial_shield?.paid_tier_locked ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>PAID TIER LOCKED</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>PAID TIER UNLOCKED</span>
                </>
              )}
            </button>

            {/* Enforcement Mode Toggle Button */}
            <button
              id="toggle-enforcement-mode-btn"
              onClick={handleToggleEnforcementMode}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium border transition-all ${
                hierarchy?.financial_shield?.enforce_working_limits
                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-600 shadow-glow-sm'
                  : 'bg-amber-950/80 text-amber-300 border-amber-600 shadow-glow-amber'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                {hierarchy?.financial_shield?.enforce_working_limits
                  ? '🛡️ Working Limits Active'
                  : '⚡ Strict API Limits'}
              </span>
            </button>

            {/* Per-Build Paid Meter */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Build Meter:</span>
              <span className="text-amber-300 font-bold">
                {(hierarchy?.paid_tokens_current_build || 0).toLocaleString()} /{' '}
                {(hierarchy?.financial_shield?.per_build_paid_token_cap || 150000).toLocaleString()} tok
              </span>
            </div>

            {/* Daily Paid Meter */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Daily Meter:</span>
              <span className="text-purple-300 font-bold">
                {(hierarchy?.paid_tokens_today || 0).toLocaleString()} /{' '}
                {(hierarchy?.financial_shield?.daily_paid_token_cap || 500000).toLocaleString()} tok
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 justify-between lg:justify-end">
            {/* Cost & Savings Pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Spend: <strong>${costEstimate.actual_paid_spend_usd.toFixed(2)}</strong> (₹{costEstimate.actual_paid_spend_inr}) &bull; Saved:{' '}
                <strong>${costEstimate.estimated_savings_usd.toFixed(2)}</strong> (₹{costEstimate.estimated_savings_inr})
              </span>
            </div>

            {/* Shield Caps Drawer Toggle */}
            <button
              id="toggle-shield-caps-btn"
              onClick={() => setIsShieldDrawerOpen(!isShieldDrawerOpen)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Shield Caps</span>
              {isShieldDrawerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Collapsible Shield Caps Settings Drawer */}
        {isShieldDrawerOpen && (
          <div
            id="shield-caps-drawer"
            className="p-4 rounded-xl bg-slate-950/95 border border-purple-500/30 font-mono text-xs space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <span>Configure Financial Shield & Token Ceilings</span>
              </span>
              <span className="text-slate-400 text-[11px]">Enforced globally across all active swarms</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Per-Build Paid Token Cap</label>
                <input
                  type="number"
                  value={shieldPerBuildCap}
                  onChange={(e) => setShieldPerBuildCap(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-amber-300 font-bold focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Daily Paid Token Cap</label>
                <input
                  type="number"
                  value={shieldDailyCap}
                  onChange={(e) => setShieldDailyCap(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-purple-300 font-bold focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Working Limit Safety Margin (%)</label>
                <input
                  type="number"
                  value={shieldSafetyMargin}
                  onChange={(e) => setShieldSafetyMargin(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-indigo-300 font-bold focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setIsShieldDrawerOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShieldConfig}
                disabled={shieldSaving}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-50"
              >
                {shieldSaving ? 'Saving...' : 'Save Shield Caps'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. 3-TAB VIEW SWITCHER BAR                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          id="tab-quotas-btn"
          onClick={() => setActiveTab('QUOTAS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'QUOTAS'
              ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Building2 className="w-4 h-4 text-purple-400" />
          <span>Model Quotas</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-purple-300 border border-purple-500/30">
            {flatModels.length} Models
          </span>
        </button>

        <button
          id="tab-subagents-btn"
          onClick={() => setActiveTab('SUB_AGENTS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'SUB_AGENTS'
              ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Bot className="w-4 h-4 text-blue-400" />
          <span>Sub-Agent Role Bounds</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-blue-300 border border-blue-500/30">
            {filteredSubAgents.length} Agents
          </span>
        </button>

        <button
          id="tab-costsavings-btn"
          onClick={() => setActiveTab('COST_SAVINGS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'COST_SAVINGS'
              ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span>Cost & Cloud Savings</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-emerald-300 border border-emerald-500/30">
            ${costEstimate.actual_paid_spend_usd.toFixed(2)}
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TAB 1: MODEL QUOTAS (MINIMALIST CARDS + EXPANDABLE DETAILS) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'QUOTAS' && (
        <div id="tab-quotas-content" className="space-y-4">
          {/* Search & Counter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                placeholder="Search models by name or provider..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>
                Showing <strong className="text-white">{flatModels.length}</strong> registered models
              </span>
            </div>
          </div>

          {/* Model Quotas Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flatModels.map((item) => {
              const { rpm, maxRpm, rpmPct, tpm, maxTpm, tpmPct, isNearCap } = getProgressStats(item.node);
              const isExpanded = expandedModels.has(item.id);

              return (
                <div
                  key={item.id}
                  id={`model-card-${item.model_name}`}
                  className={`glass-panel p-4 rounded-xl border transition-all space-y-3 ${
                    isNearCap
                      ? 'border-amber-500/60 bg-amber-950/20 shadow-glow-amber'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Element 1 & 2: Model Name, Provider & Tier Badges */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <h4 className="font-mono text-xs font-bold text-white truncate" title={item.model_name}>
                        {item.model_name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.node.has_custom_override && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                          <Key className="w-2.5 h-2.5 text-amber-400" /> KEY OVERRIDE
                        </span>
                      )}

                      {item.node.in_flight_requests && item.node.in_flight_requests > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" /> {item.node.in_flight_requests} In-Flight
                        </span>
                      ) : null}

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          item.provider === 'OLLAMA'
                            ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                            : item.provider === 'GROQ'
                            ? 'bg-orange-950/80 text-orange-300 border-orange-800'
                            : item.tier === 'PAID'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-blue-950/80 text-blue-300 border-blue-800'
                        }`}
                      >
                        {item.provider} &bull; {item.tier}
                      </span>
                    </div>
                  </div>

                  {/* 85% Working Limit vs 100% Strict API Cap Banner */}
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1 text-[10px] font-mono">
                    <div className="flex justify-between text-emerald-400 font-semibold">
                      <span>🛡️ 85% Working Limit:</span>
                      <span>
                        {item.node.working_limits?.rpm || 12} RPM • {((item.node.working_limits?.tpm || 212500)/1000).toFixed(0)}K TPM • {item.node.working_limits?.rpd || 425} RPD
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>⚡ 100% Strict API Limit:</span>
                      <span>
                        {item.node.strict_limits?.rpm || 15} RPM • {((item.node.strict_limits?.tpm || 250000)/1000).toFixed(0)}K TPM • {item.node.strict_limits?.rpd || 500} RPD
                      </span>
                    </div>
                  </div>

                  {/* Element 3: Compact 60s RPM & TPM Progress Bars */}
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

                    {/* TPM Bar */}
                    <div>
                      <div className="flex justify-between text-slate-400 text-[10px] mb-0.5">
                        <span className={isNearCap ? 'text-amber-400 font-semibold' : ''}>
                          TPM: {(tpm / 1000).toFixed(1)}K / {(maxTpm / 1000).toFixed(0)}K
                        </span>
                        <span className={isNearCap ? 'text-amber-400 font-bold' : ''}>
                          {tpmPct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isNearCap ? 'bg-amber-400' : 'bg-purple-500'
                          }`}
                          style={{ width: `${tpmPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Element 4: Details / Edit Expand Button */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] font-mono">
                    <span className="text-slate-400 text-[10px]">
                      RPD: <strong className="text-slate-200">{item.node.requests_today || 0}</strong> /{' '}
                      {item.node.strict_limits?.rpd || '—'}
                    </span>

                    <button
                      onClick={() => toggleModelExpanded(item.id)}
                      className="flex items-center gap-1 text-purple-300 hover:text-white transition-colors"
                    >
                      <span className="text-[10px]">{isExpanded ? 'Collapse' : 'Details / Edit'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Click-to-Expand Details Drawer */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-800 space-y-2.5 font-mono text-[11px]">
                      {/* 4 Discrete Token Boxes */}
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                          <span className="text-slate-500 block">Input Tokens (Max Cap)</span>
                          <span className="font-bold text-slate-200">
                            {(item.node.input_tokens_today || 0).toLocaleString()} /{' '}
                            {((item.node.working_limits?.max_input_tokens || 0) / 1000).toFixed(0)}K
                          </span>
                        </div>

                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                          <span className="text-slate-500 block">Output Tokens (Max Cap)</span>
                          <span className="font-bold text-slate-200">
                            {(item.node.output_tokens_today || 0).toLocaleString()} /{' '}
                            {((item.node.working_limits?.max_output_tokens || 0) / 1000).toFixed(0)}K
                          </span>
                        </div>

                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                          <span className="text-slate-500 block">Thinking Tokens (Budget)</span>
                          <span className="font-bold text-purple-300">
                            {(item.node.thinking_tokens_today || 0).toLocaleString()} /{' '}
                            {item.node.working_limits?.thinking_budget || 0}
                          </span>
                        </div>

                        <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                          <span className="text-slate-500 block">Daily Requests (RPD)</span>
                          <span className="font-bold text-slate-200">
                            {item.node.requests_today || 0} / {item.node.strict_limits?.rpd || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Working vs Strict Comparison Table */}
                      <div className="rounded bg-slate-950/90 border border-slate-800 p-2 text-[10px] space-y-1">
                        <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1 font-bold">
                          <span>Metric</span>
                          <span>Working Limit</span>
                          <span>Strict Limit</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>RPM</span>
                          <span>{item.node.working_limits?.rpm ?? '—'}</span>
                          <span className="text-slate-500">{item.node.strict_limits?.rpm ?? '—'}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>TPM</span>
                          <span>{((item.node.working_limits?.tpm || 0) / 1000).toFixed(0)}K</span>
                          <span className="text-slate-500">{((item.node.strict_limits?.tpm || 0) / 1000).toFixed(0)}K</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Max Input</span>
                          <span>{(item.node.working_limits?.max_input_tokens || 0).toLocaleString()}</span>
                          <span className="text-slate-500">{(item.node.strict_limits?.max_input_tokens || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Max Output</span>
                          <span>{(item.node.working_limits?.max_output_tokens || 0).toLocaleString()}</span>
                          <span className="text-slate-500">{(item.node.strict_limits?.max_output_tokens || 0).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Edit Working & Strict Limits Button */}
                      <button
                        onClick={() =>
                          setEditingModel({
                            provider: item.provider,
                            tier: item.tier,
                            model_name: item.model_name,
                            working_limits: { ...item.node.working_limits },
                            strict_limits: { ...item.node.strict_limits }
                          })
                        }
                        className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Working & Strict Limits</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. TAB 2: SUB-AGENT ROLE BOUNDS                               */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'SUB_AGENTS' && (
        <div id="tab-subagents-content" className="space-y-4">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={agentSearchQuery}
                onChange={(e) => setAgentSearchQuery(e.target.value)}
                placeholder="Search sub-agents by role or assigned model..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>
                Showing <strong className="text-white">{filteredSubAgents.length}</strong> configured agent roles
              </span>
            </div>
          </div>

          {/* Sub-Agents Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubAgents.map(([agentName, agentData]) => {
              const isExpanded = expandedAgents.has(agentName);

              return (
                <div
                  key={agentName}
                  id={`agent-card-${agentName}`}
                  className="glass-panel p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                >
                  {/* Element 1 & 2: Agent Role Name & Complexity Badge */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <h4 className="font-mono text-xs font-bold text-white truncate" title={agentName}>
                        {agentName}
                      </h4>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        agentData.complexity_level === 'CRITICAL'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                          : agentData.complexity_level === 'HIGH'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                          : agentData.complexity_level === 'LOCAL'
                          ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                          : 'bg-blue-950/80 text-blue-300 border-blue-800'
                      }`}
                    >
                      {agentData.complexity_level}
                    </span>
                  </div>

                  {/* Element 3: Assigned Model & Provider Pill */}
                  <div className="flex items-center justify-between text-[11px] font-mono px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="text-slate-300 font-semibold truncate" title={agentData.model}>
                      {agentData.model}
                    </span>
                    <span className="text-[10px] text-purple-300 uppercase font-bold">
                      {agentData.provider}
                    </span>
                  </div>

                  {/* Element 4: Compact Token Caps Summary */}
                  <div className="flex items-center justify-between text-[11px] font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-800/80 text-slate-400">
                    <span>In: <strong className="text-slate-200">{(agentData.max_input_tokens / 1000).toFixed(0)}K</strong></span>
                    <span>&bull;</span>
                    <span>Out: <strong className="text-slate-200">{(agentData.max_output_tokens / 1000).toFixed(0)}K</strong></span>
                    <span>&bull;</span>
                    <span>Think: <strong className="text-purple-300">{(agentData.thinking_budget / 1000).toFixed(0)}K</strong></span>
                  </div>

                  {/* Element 5: Expand / Configure Button */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] font-mono">
                    <span className="text-slate-400 text-[10px]">
                      RPM: {agentData.rpm} &bull; TPM: {(agentData.tpm / 1000).toFixed(0)}K
                    </span>

                    <button
                      onClick={() => toggleAgentExpanded(agentName)}
                      className="flex items-center gap-1 text-purple-300 hover:text-white transition-colors"
                    >
                      <span className="text-[10px]">{isExpanded ? 'Collapse' : 'Expand / Configure'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded Agent Drawer */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-800 space-y-2.5 font-mono text-[11px]">
                      {/* Ideal For Tags */}
                      {agentData.ideal_for && agentData.ideal_for.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-slate-400 text-[10px] block">Ideal For:</span>
                          <div className="flex flex-wrap gap-1">
                            {agentData.ideal_for.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Strengths & Weaknesses */}
                      {agentData.strengths && agentData.strengths.length > 0 && (
                        <div className="text-[10px] text-emerald-400/90 leading-tight">
                          <strong>Strengths:</strong> {agentData.strengths.join(', ')}
                        </div>
                      )}

                      {/* Edit Agent Bounds Button */}
                      <button
                        onClick={() =>
                          setEditingAgent({
                            agent_name: agentName,
                            data: { ...agentData }
                          })
                        }
                        className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Agent Bounds</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. TAB 3: COST & CLOUD SAVINGS CONSOLE                        */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'COST_SAVINGS' && (
        <div id="tab-costsavings-content" className="space-y-5">
          {/* 4 High-Clarity Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
            {/* Card 1: Actual Paid Spend Today */}
            <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-1">
              <span className="text-slate-400 text-xs flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span>Actual Paid Spend Today</span>
              </span>
              <div className="text-xl font-bold text-white">
                ${costEstimate.actual_paid_spend_usd.toFixed(4)}{' '}
                <span className="text-xs text-slate-400 font-normal">/ ₹{costEstimate.actual_paid_spend_inr}</span>
              </div>
              <p className="text-[10px] text-slate-500">
                {(costEstimate.paid_tokens_today || 0).toLocaleString()} paid cloud tokens billed
              </p>
            </div>

            {/* Card 2: Current Build Paid Spend */}
            <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-1">
              <span className="text-slate-400 text-xs flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
                <span>Current Build Paid Spend</span>
              </span>
              <div className="text-xl font-bold text-amber-300">
                {(costEstimate.paid_tokens_current_build || 0).toLocaleString()}
                <span className="text-xs text-slate-400 font-normal">
                  {' '}
                  / {(hierarchy?.financial_shield?.per_build_paid_token_cap || 150000).toLocaleString()} tok
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      Math.round(
                        ((costEstimate.paid_tokens_current_build || 0) /
                          Math.max(hierarchy?.financial_shield?.per_build_paid_token_cap || 150000, 1)) *
                          100
                      ),
                      100
                    )}%`
                  }}
                />
              </div>
            </div>

            {/* Card 3: Estimated Cloud Value Saved */}
            <div className="glass-panel p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 shadow-glow-emerald space-y-1">
              <span className="text-emerald-300 text-xs flex items-center gap-1.5 font-bold">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Estimated Value Saved</span>
              </span>
              <div className="text-xl font-bold text-emerald-300">
                ${costEstimate.estimated_savings_usd.toFixed(4)}{' '}
                <span className="text-xs text-emerald-400/80 font-normal">/ ₹{costEstimate.estimated_savings_inr}</span>
              </div>
              <p className="text-[10px] text-emerald-400/70">
                Via Free Tier Pool & Local RTX 4060 Ollama
              </p>
            </div>

            {/* Card 4: Free & Local Tokens Processed */}
            <div className="glass-panel p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-1">
              <span className="text-slate-400 text-xs flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span>Free & Local Tokens</span>
              </span>
              <div className="text-xl font-bold text-white">
                {(costEstimate.free_and_local_tokens_today || 0).toLocaleString()}
                <span className="text-xs text-emerald-400 font-bold ml-1.5">@ $0.00</span>
              </div>
              <p className="text-[10px] text-slate-500">
                Zero billing impact & 100% cloud cost avoidance
              </p>
            </div>
          </div>

          {/* Provider Cost & Token Breakdown Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden shadow-inner font-mono text-xs">
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Provider Cost & Cloud Savings Breakdown</span>
              </span>
              <span className="text-slate-400 text-[11px]">Calculated from active token ledger</span>
            </div>

            <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="col-span-3 sm:col-span-3">Provider</div>
              <div className="col-span-3 sm:col-span-2">Paid Tokens</div>
              <div className="col-span-3 sm:col-span-3">Free/Local Tokens</div>
              <div className="col-span-3 sm:col-span-2 text-right">Actual Cost</div>
              <div className="col-span-3 sm:col-span-2 text-right hidden sm:block">Saved Value</div>
            </div>

            <div className="divide-y divide-slate-800/80">
              {providerStatsList.map((stat) => (
                <div
                  key={stat.provider}
                  className="grid grid-cols-12 items-center px-4 py-3 hover:bg-slate-900/50 transition-colors"
                >
                  <div className="col-span-3 sm:col-span-3 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        stat.provider === 'OLLAMA'
                          ? 'bg-purple-400'
                          : stat.provider === 'GROQ'
                          ? 'bg-orange-400'
                          : 'bg-blue-400'
                      }`}
                    />
                    <span className="font-bold text-white">{stat.provider}</span>
                  </div>

                  <div className="col-span-3 sm:col-span-2 text-slate-300">
                    {stat.paidTokens.toLocaleString()}
                  </div>

                  <div className="col-span-3 sm:col-span-3 text-slate-300">
                    {stat.freeLocalTokens.toLocaleString()}
                  </div>

                  <div className="col-span-3 sm:col-span-2 text-right font-bold text-amber-300">
                    ${stat.actualCostUsd.toFixed(4)}
                  </div>

                  <div className="col-span-3 sm:col-span-2 text-right font-bold text-emerald-400 hidden sm:block">
                    +${stat.estimatedSavingsUsd.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. MODALS: ADD MODEL, EDIT LIMITS, EDIT AGENT BOUNDS          */}
      {/* ------------------------------------------------------------- */}

      {/* Modal 1: Add Model / Provider */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" />
                <span>Register Provider Engine</span>
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
                <label className="block text-slate-400 text-[11px] mb-1">Provider Family</label>
                <select
                  value={addProvider}
                  onChange={(e) => setAddProvider(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="GOOGLE">GOOGLE</option>
                  <option value="GROQ">GROQ</option>
                  <option value="OLLAMA">OLLAMA</option>
                  <option value="CUSTOM">Custom Provider...</option>
                </select>
              </div>

              {addProvider === 'CUSTOM' && (
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Custom Provider Name</label>
                  <input
                    type="text"
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value)}
                    placeholder="e.g. ANTHROPIC"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Tier</label>
                  <select
                    value={addTier}
                    onChange={(e) => setAddTier(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="FREE">FREE</option>
                    <option value="PAID">PAID</option>
                    <option value="LOCAL">LOCAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Model Identifier</label>
                  <input
                    type="text"
                    value={addModelName}
                    onChange={(e) => setAddModelName(e.target.value)}
                    placeholder="e.g. gemini-3.6-flash"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Working RPM</label>
                  <input
                    type="number"
                    value={addWorkingRpm}
                    onChange={(e) => setAddWorkingRpm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Working TPM</label>
                  <input
                    type="number"
                    value={addWorkingTpm}
                    onChange={(e) => setAddWorkingTpm(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Thinking Budget</label>
                  <input
                    type="number"
                    value={addThinkingBudget}
                    onChange={(e) => setAddThinkingBudget(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-purple-300"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProviderModel}
                disabled={addSaving}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-50"
              >
                {addSaving ? 'Saving...' : 'Register Model'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Model Limits */}
      {editingModel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{editingModel.model_name}</span>
                  {selectedKeyScope !== 'GLOBAL' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                      Dedicated Key: {selectedKeyScope}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {editingModel.provider} &bull; {editingModel.tier}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (editingModel.strict_limits) {
                      setEditingModel({
                        ...editingModel,
                        working_limits: {
                          ...editingModel.working_limits,
                          rpm: Math.max(1, Math.round((editingModel.strict_limits.rpm || 15) * 0.85)),
                          tpm: Math.max(1000, Math.round((editingModel.strict_limits.tpm || 250000) * 0.85)),
                          rpd: Math.max(1, Math.round((editingModel.strict_limits.rpd || 500) * 0.85)),
                          max_input_tokens: Math.round(((editingModel.strict_limits.max_input_tokens || 32768) * 0.85)),
                          max_output_tokens: Math.round(((editingModel.strict_limits.max_output_tokens || 8192) * 0.85))
                        }
                      });
                      showToast('Auto-filled 85% of strict limits.', 'info');
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50 text-[11px] font-semibold transition-colors"
                >
                  ⚡ Auto-Fill 85% of Strict
                </button>
                <button
                  onClick={() => setEditingModel(null)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <span className="font-bold text-purple-300 block">Safe Working Limits (Pacing Ceilings)</span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Working RPM</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.rpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, rpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Working TPM</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.tpm}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, tpm: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Thinking Budget</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.thinking_budget}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, thinking_budget: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-purple-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Max Input Tokens</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.max_input_tokens}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, max_input_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Max Output Tokens</label>
                  <input
                    type="number"
                    value={editingModel.working_limits.max_output_tokens}
                    onChange={(e) =>
                      setEditingModel({
                        ...editingModel,
                        working_limits: { ...editingModel.working_limits, max_output_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingModel(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModelLimits}
                disabled={modelSaving}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-50"
              >
                {modelSaving ? 'Saving...' : 'Persist Limits'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Edit Sub-Agent Bounds */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">{editingAgent.agent_name}</h3>
                <p className="text-[11px] text-slate-400">Sub-Agent Behavioral Envelope & Quota Bound</p>
              </div>
              <button
                onClick={() => setEditingAgent(null)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Assigned Model</label>
                  <input
                    type="text"
                    value={editingAgent.data.model}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, model: e.target.value }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Complexity Level</label>
                  <select
                    value={editingAgent.data.complexity_level}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, complexity_level: e.target.value }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                    <option value="LOCAL">LOCAL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Max Input</label>
                  <input
                    type="number"
                    value={editingAgent.data.max_input_tokens}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, max_input_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Max Output</label>
                  <input
                    type="number"
                    value={editingAgent.data.max_output_tokens}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, max_output_tokens: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] mb-0.5">Thinking Budget</label>
                  <input
                    type="number"
                    value={editingAgent.data.thinking_budget}
                    onChange={(e) =>
                      setEditingAgent({
                        ...editingAgent,
                        data: { ...editingAgent.data, thinking_budget: Number(e.target.value) }
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-purple-300"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingAgent(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSubAgentBounds}
                disabled={agentSaving}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-50"
              >
                {agentSaving ? 'Saving...' : 'Save Agent Bounds'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenGovernor;
