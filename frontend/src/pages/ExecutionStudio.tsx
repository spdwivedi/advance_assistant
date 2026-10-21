import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket,
  Compass,
  FolderTree,
  Play,
  Pause,
  Square,
  FileCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  Edit3,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Search,
  Filter,
  Shield,
  Zap,
  Sliders,
  Layers,
  Sparkles,
  Terminal,
  Activity,
  ArrowRight,
  Clock,
  Info,
  X,
  ExternalLink,
  Cpu,
  History,
  FileText,
  Lock,
  Unlock,
  Key,
  Users,
  CheckSquare
} from 'lucide-react';

interface ConfigData {
  execution_modes: string[];
  default_mode: string;
  research_profiles: Record<string, { web_search_enabled: boolean; cache_raw_data: boolean; description: string }>;
  default_research_profile: string;
  model_constraining_profiles: Record<string, { allowed_models: string[]; description: string }>;
  default_constraining_profile: string;
  tier_pools: Record<string, string[]>;
  models: string[];
  defaults?: {
    isolation_enabled: boolean;
    max_swarm_workers: number;
    orchestrator_model: string;
    worker_model: string;
  };
}

interface HistoryData {
  history: string[];
  last_location: string;
  knowledge_telemetry: string;
}

interface ExecutionState {
  is_running?: boolean;
  is_paused?: boolean;
  status?: string;
  current_phase?: string;
  project_name?: string | null;
  target_path?: string | null;
  goal?: string | null;
  mode?: string | null;
  profile?: string | null;
  constrain?: string | null;
  isolate?: boolean | null;
  start_time?: number | null;
  end_time?: number | null;
  error?: string | null;
}

interface BlueprintTask {
  task_id: string;
  target_file: string;
  action: 'CREATE' | 'MODIFY' | string;
  assigned_agent: string;
  assigned_model: string;
  provider?: string;
  target_tier: string;
  directive: string;
  estimated_input_tokens?: number;
  estimated_output_tokens?: number;
  selected?: boolean;
}

interface BlueprintData {
  blueprint_id: string;
  project_name: string;
  target_dir: string;
  goal: string;
  orchestrator_model?: string;
  created_at: string;
  existing_files_detected: number;
  estimated_total_tokens: number;
  tasks: BlueprintTask[];
}

interface ScannedFile {
  rel_path: string;
  size_bytes: number;
  ext: string;
  last_modified: string;
}

interface WorkspaceScanResult {
  status: string;
  exists: boolean;
  resolved_path: string;
  project_name: string;
  file_count: number;
  files: ScannedFile[];
  language_breakdown: Record<string, number>;
  has_existing_ledger: boolean;
}

interface FileInspectResult {
  status: string;
  file_path: string;
  full_path: string;
  size_bytes: number;
  line_count: number;
  language: string;
  last_modified: string;
  content: string;
}

// Stage 16.3 Swarm & Catalog Interfaces
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

export interface SwarmProfileOption {
  id: string;
  name: string;
  description: string;
  orchestrator: string;
  worker_tier?: string;
  worker_models?: string[];
  max_models_used?: number;
  routing_strategy?: 'ROUND_ROBIN' | 'QUOTA_WEIGHTED';
  default_concurrency: number;
}

export interface RegisteredKeyOption {
  id: string;
  key?: string;
  label?: string;
  provider?: string;
  tier?: string;
  safety_margin_percent?: number;
}

// Prompt Inspiration Chips
const PROMPT_INSPIRATIONS = [
  'Refactor authentication system to JWT with refresh tokens',
  'Implement REST API endpoints for user profile management',
  'Add unit tests for core pipeline processors and handlers',
  'Build responsive dashboard view with WebSocket telemetry',
  'Migrate storage layer to async SQLite database with migrations'
];

const ITERATIVE_PROMPTS = [
  'Generate complete file blueprint with dry-run tokens',
  'Add security middleware and input validation guards',
  'Create end-to-end integration test suite',
  'Optimize query performance and cache layer'
];

export const ExecutionStudio: React.FC = () => {
  const navigate = useNavigate();

  // Mode Tabs: 'direct' | 'blueprint' | 'files'
  const [activeTab, setActiveTab] = useState<'direct' | 'blueprint' | 'files'>('direct');

  // Metadata states
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Common Workspace & Direct Launch inputs
  const [targetPath, setTargetPath] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('default_project');
  const [goal, setGoal] = useState<string>('');
  const [mode, setMode] = useState<string>('AUTO_DETECT');
  const [maxWorkers, setMaxWorkers] = useState<number>(8);

  // Stage 16.3 Swarm, Orchestrator, Multi-Model Worker & Key States
  const [swarmsList, setSwarmsList] = useState<SwarmProfileOption[]>([]);
  const [selectedSwarmId, setSelectedSwarmId] = useState<string>('GLOBAL_HYBRID_SWARM');
  const [orchestratorModel, setOrchestratorModel] = useState<string>('qwen2.5-coder:32b');
  const [workerModels, setWorkerModels] = useState<string[]>([
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'qwen2.5-coder:7b'
  ]);
  const [maxModelsUsed, setMaxModelsUsed] = useState<number>(2);
  const [routingStrategy, setRoutingStrategy] = useState<'ROUND_ROBIN' | 'QUOTA_WEIGHTED'>('ROUND_ROBIN');
  const [preferredKeyId, setPreferredKeyId] = useState<string>('AUTO');
  const [registeredKeys, setRegisteredKeys] = useState<RegisteredKeyOption[]>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModelItem[]>([]);
  const [showWorkerPicker, setShowWorkerPicker] = useState<boolean>(false);
  const [pickerFilter, setPickerFilter] = useState<'ALL' | 'GOOGLE_FREE' | 'GOOGLE_PAID' | 'GROQ' | 'OLLAMA'>('ALL');
  const [swarmSaving, setSwarmSaving] = useState<boolean>(false);

  // Advanced Settings Accordion state
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [researchProfile, setResearchProfile] = useState<string>('BASIC');
  const [constrainProfile, setConstrainProfile] = useState<string>('HIGH_RPM_TPM');
  const [tier, setTier] = useState<string>('HIGH');
  const [isolate, setIsolate] = useState<boolean>(false);
  const [clearCache, setClearCache] = useState<boolean>(false);
  const [autoDefrag, setAutoDefrag] = useState<boolean>(true);

  // Workspace Scanner state
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<WorkspaceScanResult | null>(null);
  const [scanFilterExt, setScanFilterExt] = useState<string>('ALL');
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');

  // Blueprint Studio state
  const [blueprintGoal, setBlueprintGoal] = useState<string>('');
  const [useExistingContext, setUseExistingContext] = useState<boolean>(true);
  const [blueprintGenerating, setBlueprintGenerating] = useState<boolean>(false);
  const [blueprintData, setBlueprintData] = useState<BlueprintData | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [blueprintExecuting, setBlueprintExecuting] = useState<boolean>(false);

  // Custom task modal/drawer state
  const [showAddCustomTask, setShowAddCustomTask] = useState<boolean>(false);
  const [customTaskFile, setCustomTaskFile] = useState<string>('');
  const [customTaskAction, setCustomTaskAction] = useState<string>('CREATE');
  const [customTaskAgent, setCustomTaskAgent] = useState<string>('Dev Coder');
  const [customTaskModel, setCustomTaskModel] = useState<string>('gemini-3.6-flash');
  const [customTaskTier, setCustomTaskTier] = useState<string>('FAST');
  const [customTaskDirective, setCustomTaskDirective] = useState<string>('');

  // File Inspector Modal state
  const [inspectModalOpen, setInspectModalOpen] = useState<boolean>(false);
  const [inspectingFile, setInspectingFile] = useState<FileInspectResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Notifications & UI feedback
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Format token counts cleanly (e.g. 1250 -> 1.3k)
  const formatTokens = (toks: number = 0): string => {
    if (toks >= 1000000) return `${(toks / 1000000).toFixed(1)}M`;
    if (toks >= 1000) return `${(toks / 1000).toFixed(1)}k`;
    return `${toks}`;
  };

  // Derive project name from directory path
  const updatePathAndProject = (pathStr: string) => {
    setTargetPath(pathStr);
    const clean = pathStr.replace(/[\/\\]+$/, '');
    const folder = clean.split(/[\/\\]/).filter(Boolean).pop();
    if (folder) setProjectName(folder);
  };

  // Initial data loading
  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        const [configRes, historyRes, healthRes, bpRes, swarmsRes, keysRes, catRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/history'),
          fetch('/api/health'),
          fetch('/api/blueprint/preview'),
          fetch('/api/swarms/profiles'),
          fetch('/api/keys'),
          fetch('/api/models/catalog')
        ]);

        if (configRes.ok && isMounted) {
          const cfg: ConfigData = await configRes.json();
          setConfig(cfg);
          if (cfg.default_mode) setMode(cfg.default_mode);
          if (cfg.default_research_profile) setResearchProfile(cfg.default_research_profile);
          if (cfg.default_constraining_profile) setConstrainProfile(cfg.default_constraining_profile);
          if (cfg.defaults?.isolation_enabled !== undefined) setIsolate(cfg.defaults.isolation_enabled);
          if (cfg.defaults?.max_swarm_workers) setMaxWorkers(Math.min(cfg.defaults.max_swarm_workers, 16));
        }

        if (historyRes.ok && isMounted) {
          const hist: HistoryData = await historyRes.json();
          setHistory(hist);
          if (hist.last_location) {
            updatePathAndProject(hist.last_location);
            performWorkspaceScan(hist.last_location);
          }
        }

        if (healthRes.ok && isMounted) {
          const hData = await healthRes.json();
          if (hData.execution_state) {
            setExecutionState(hData.execution_state);
          }
        }

        if (bpRes.ok && isMounted) {
          const bpResp = await bpRes.json();
          if (bpResp.status === 'success' && bpResp.blueprint) {
            setBlueprintData(bpResp.blueprint);
            if (bpResp.blueprint.goal) setBlueprintGoal(bpResp.blueprint.goal);
          }
        }

        // Swarms profiles initialization
        if (swarmsRes.ok && isMounted) {
          const sData = await swarmsRes.json();
          if (sData.swarms) setSwarmsList(sData.swarms);
          if (sData.active_swarm_id) setSelectedSwarmId(sData.active_swarm_id);
          if (sData.orchestrator_engine) setOrchestratorModel(sData.orchestrator_engine);
          if (sData.worker_models && sData.worker_models.length > 0) {
            setWorkerModels(sData.worker_models);
          }
          if (sData.max_models_used) setMaxModelsUsed(sData.max_models_used);
          if (sData.routing_strategy) setRoutingStrategy(sData.routing_strategy);
          if (sData.preferred_key_id) setPreferredKeyId(sData.preferred_key_id);
          if (sData.max_concurrency_workers) setMaxWorkers(sData.max_concurrency_workers);
        }

        // Keys initialization
        if (keysRes.ok && isMounted) {
          const kData = await keysRes.json();
          if (kData.keys) setRegisteredKeys(kData.keys);
        }

        // Model Catalog initialization
        if (catRes.ok && isMounted) {
          const cData = await catRes.json();
          if (cData.catalog) {
            const flattened: CatalogModelItem[] = [];
            Object.values(cData.catalog).forEach((providerObj: any) => {
              Object.values(providerObj).forEach((tierObj: any) => {
                if (tierObj?.models && Array.isArray(tierObj.models)) {
                  flattened.push(...tierObj.models);
                }
              });
            });
            setCatalogModels(flattened);
          }
        }
      } catch (err) {
        console.error('Failed to load initial Execution Studio metadata:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialData();

    // Background poll for execution state
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.execution_state) {
            setExecutionState(data.execution_state);
          }
        }
      } catch {
        // Silently handle polling errors
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  // Handle Swarm Preset switch
  const handleSwarmPresetChange = (swarmId: string) => {
    setSelectedSwarmId(swarmId);
    const found = swarmsList.find((s) => s.id === swarmId);
    if (found) {
      if (found.orchestrator) setOrchestratorModel(found.orchestrator);
      if (found.worker_models && found.worker_models.length > 0) {
        setWorkerModels(found.worker_models);
      }
      if (found.max_models_used) setMaxModelsUsed(found.max_models_used);
      if (found.default_concurrency) setMaxWorkers(found.default_concurrency);
      if (found.routing_strategy) setRoutingStrategy(found.routing_strategy);
    }
  };

  // Toggle model inclusion in worker roster
  const handleToggleWorkerModel = (mName: string) => {
    setWorkerModels((prev) => {
      if (prev.includes(mName)) {
        if (prev.length <= 1) {
          setErrorMessage('At least 1 worker model must remain active in the swarm roster.');
          return prev;
        }
        const updated = prev.filter((m) => m !== mName);
        if (maxModelsUsed > updated.length) setMaxModelsUsed(updated.length);
        return updated;
      } else {
        return [...prev, mName];
      }
    });
  };

  // Save current roster as default swarm
  const handleSaveSwarmRoster = async () => {
    setSwarmSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/swarms/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_swarm_id: selectedSwarmId,
          orchestrator_engine: orchestratorModel,
          worker_models: workerModels,
          max_models_used: maxModelsUsed,
          routing_strategy: routingStrategy,
          preferred_key_id: preferredKeyId,
          max_concurrency_workers: maxWorkers
        })
      });
      if (res.ok) {
        setSuccessMessage(`Swarm roster persisted! Active: ${workerModels.length} models, Orchestrator: ${orchestratorModel}`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Failed to persist swarm profile.');
      }
    } catch (err: any) {
      setErrorMessage(`Save error: ${err.message || String(err)}`);
    } finally {
      setSwarmSaving(false);
    }
  };

  // Filter catalog models for picker
  const filteredPickerModels = useMemo(() => {
    if (!catalogModels || catalogModels.length === 0) return [];
    return catalogModels.filter((m) => {
      if (pickerFilter === 'ALL') return true;
      if (pickerFilter === 'GOOGLE_FREE') return m.provider === 'GOOGLE' && m.tier === 'FREE';
      if (pickerFilter === 'GOOGLE_PAID') return m.provider === 'GOOGLE' && m.tier === 'PAID';
      if (pickerFilter === 'GROQ') return m.provider === 'GROQ';
      if (pickerFilter === 'OLLAMA') return m.provider === 'OLLAMA';
      return true;
    });
  }, [catalogModels, pickerFilter]);

  // Perform Workspace Scan API call
  const performWorkspaceScan = async (pathOverride?: string) => {
    const pathToScan = pathOverride || targetPath;
    if (!pathToScan.trim()) return;

    setScanning(true);
    try {
      const res = await fetch(`/api/workspace/scan?path=${encodeURIComponent(pathToScan.trim())}`);
      if (res.ok) {
        const scanData: WorkspaceScanResult = await res.json();
        setScanResult(scanData);
      }
    } catch (err) {
      console.error('Failed to scan workspace:', err);
    } finally {
      setScanning(false);
    }
  };

  // Inspect specific file via GET /api/workspace/file
  const handleInspectFile = async (filePath: string) => {
    if (!targetPath.trim() || !filePath.trim()) return;
    setInspectLoading(true);
    setInspectModalOpen(true);
    setCopiedCode(false);

    try {
      const res = await fetch(
        `/api/workspace/file?workspace_dir=${encodeURIComponent(targetPath.trim())}&file_path=${encodeURIComponent(filePath.trim())}`
      );
      if (res.ok) {
        const fileData: FileInspectResult = await res.json();
        setInspectingFile(fileData);
      } else {
        const err = await res.json().catch(() => ({}));
        setInspectingFile({
          status: 'error',
          file_path: filePath,
          full_path: `${targetPath}/${filePath}`,
          size_bytes: 0,
          line_count: 0,
          language: 'text',
          last_modified: 'N/A',
          content: err.detail || 'Could not load file contents.'
        });
      }
    } catch (err) {
      setInspectingFile({
        status: 'error',
        file_path: filePath,
        full_path: `${targetPath}/${filePath}`,
        size_bytes: 0,
        line_count: 0,
        language: 'text',
        last_modified: 'N/A',
        content: 'Network error reading file from workspace.'
      });
    } finally {
      setInspectLoading(false);
    }
  };

  // Generate Pre-Flight Blueprint via POST /api/blueprint/preview
  const handleGenerateBlueprint = async () => {
    if (!targetPath.trim()) {
      setErrorMessage('Please specify a valid Target Workspace Path first.');
      return;
    }
    if (!blueprintGoal.trim() && !goal.trim()) {
      setErrorMessage('Please provide an architectural goal for blueprint generation.');
      return;
    }

    setBlueprintGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const goalToUse = blueprintGoal.trim() || goal.trim();

    try {
      const res = await fetch('/api/blueprint/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goalToUse,
          target_dir: targetPath.trim(),
          project_name: projectName.trim(),
          execution_mode: mode,
          use_existing_context: useExistingContext,
          orchestrator_model: orchestratorModel,
          worker_models: workerModels,
          max_models_used: maxModelsUsed,
          routing_strategy: routingStrategy,
          preferred_key_id: preferredKeyId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.blueprint) {
          setBlueprintData(data.blueprint);
          setSuccessMessage(`Pre-Flight Blueprint generated! ${data.blueprint.tasks.length} file tasks scoped.`);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Failed to generate blueprint preview.');
      }
    } catch (err: any) {
      setErrorMessage(`Error: ${err.message || String(err)}`);
    } finally {
      setBlueprintGenerating(false);
    }
  };

  // Toggle individual task selection in blueprint
  const handleToggleTaskSelect = (taskId: string) => {
    if (!blueprintData) return;
    setBlueprintData({
      ...blueprintData,
      tasks: blueprintData.tasks.map((t) =>
        t.task_id === taskId ? { ...t, selected: !t.selected } : t
      )
    });
  };

  // Toggle select all tasks
  const handleToggleSelectAll = (selectAll: boolean) => {
    if (!blueprintData) return;
    setBlueprintData({
      ...blueprintData,
      tasks: blueprintData.tasks.map((t) => ({ ...t, selected: selectAll }))
    });
  };

  // Toggle task row expand drawer
  const handleToggleTaskExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Update specific task in blueprint data
  const handleUpdateTask = (taskId: string, field: keyof BlueprintTask, value: any) => {
    if (!blueprintData) return;
    setBlueprintData({
      ...blueprintData,
      tasks: blueprintData.tasks.map((t) =>
        t.task_id === taskId ? { ...t, [field]: value } : t
      )
    });
  };

  // Remove task from blueprint
  const handleRemoveTask = (taskId: string) => {
    if (!blueprintData) return;
    setBlueprintData({
      ...blueprintData,
      tasks: blueprintData.tasks.filter((t) => t.task_id !== taskId)
    });
  };

  // Add custom file task manually
  const handleAddCustomTask = () => {
    if (!customTaskFile.trim()) return;
    if (!blueprintData) {
      setBlueprintData({
        blueprint_id: `bp_${Date.now()}`,
        project_name: projectName,
        target_dir: targetPath,
        goal: blueprintGoal || 'Custom File Blueprint',
        created_at: new Date().toISOString(),
        existing_files_detected: scanResult?.file_count || 0,
        estimated_total_tokens: 1500,
        tasks: []
      });
    }

    const newTask: BlueprintTask = {
      task_id: `task_${Date.now().toString().slice(-4)}`,
      target_file: customTaskFile.trim(),
      action: customTaskAction,
      assigned_agent: customTaskAgent,
      assigned_model: customTaskModel,
      target_tier: customTaskTier,
      directive: customTaskDirective.trim() || `Implement required code updates for ${customTaskFile.trim()}`,
      estimated_input_tokens: 500,
      estimated_output_tokens: 1000,
      selected: true
    };

    setBlueprintData((prev) => (prev ? { ...prev, tasks: [...prev.tasks, newTask] } : null));
    setShowAddCustomTask(false);
    setCustomTaskFile('');
    setCustomTaskDirective('');
    setSuccessMessage(`Custom task added for ${newTask.target_file}`);
  };

  // Dispatch Approved Blueprint Execution
  const handleDispatchApprovedBlueprint = async () => {
    if (!blueprintData) return;
    const selectedTasks = blueprintData.tasks.filter((t) => t.selected !== false);
    if (selectedTasks.length === 0) {
      setErrorMessage('Please select at least 1 file task to execute.');
      return;
    }

    setBlueprintExecuting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/blueprint/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_dir: blueprintData.target_dir || targetPath.trim(),
          project_name: blueprintData.project_name || projectName.trim(),
          goal: blueprintData.goal || blueprintGoal || 'Approved Blueprint Execution',
          tasks: selectedTasks,
          max_workers: maxWorkers,
          execution_mode: mode,
          research_profile: researchProfile,
          model_profile: constrainProfile,
          orchestrator_model: orchestratorModel,
          worker_models: workerModels,
          max_models_used: maxModelsUsed,
          routing_strategy: routingStrategy,
          preferred_key_id: preferredKeyId
        })
      });

      if (res.ok) {
        setSuccessMessage(`Approved blueprint dispatched! Swarm workforce activated for ${selectedTasks.length} task(s).`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Failed to dispatch approved blueprint.');
      }
    } catch (err: any) {
      setErrorMessage(`Execution error: ${err.message || String(err)}`);
    } finally {
      setBlueprintExecuting(false);
    }
  };

  // Tab 1: Submit Direct Launch Build
  const handleDirectLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!targetPath.trim()) {
      setErrorMessage('Please specify a valid Target Workspace Path.');
      return;
    }

    if (!goal.trim()) {
      setErrorMessage('Please enter an Engineering Goal or architectural directive.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        target_path: targetPath.trim(),
        project_name: projectName.trim(),
        goal: goal.trim(),
        mode: mode,
        research_profile: researchProfile,
        constraining_profile: constrainProfile,
        target_tier: tier,
        max_workers: maxWorkers,
        isolate: isolate,
        clear_cache: clearCache,
        auto_defrag: autoDefrag,
        orchestrator_model: orchestratorModel,
        worker_models: workerModels,
        max_models_used: maxModelsUsed,
        routing_strategy: routingStrategy,
        preferred_key_id: preferredKeyId
      };

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(`Build dispatched successfully! Swarm active for project: ${projectName}`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.detail || 'Failed to launch execution build.');
      }
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Live Swarm Status Bar data
  const isRunning = executionState?.is_running || false;
  const isPaused = executionState?.is_paused || false;

  return (
    <div className="space-y-6 pb-16">
      {/* -------------------------------------------------------------------- */}
      {/* TOP HEADER & LIVE SWARM STATUS BAR                                  */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Rocket className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>Execution Studio & Swarm Workspace</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    v6.0 Stage 16.3
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Launch direct autonomous builds, inspect live workspace code, or iterate on pre-flight blueprints
                </p>
              </div>
            </div>
          </div>

          {/* Live Swarm Status Strip */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-950/80 border border-slate-800/80 px-4 py-2.5 rounded-xl text-xs font-mono">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRunning
                    ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50'
                    : isPaused
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              />
              <span className="text-slate-300 font-bold">
                {isRunning ? (isPaused ? 'SWARM PAUSED' : 'SWARM ACTIVE') : 'STANDBY READY'}
              </span>
            </div>

            {executionState?.project_name && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">
                  Project: <strong className="text-white">{executionState.project_name}</strong>
                </span>
              </>
            )}

            {executionState?.current_phase && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-indigo-400 font-semibold">
                  Phase: {executionState.current_phase}
                </span>
              </>
            )}

            <button
              onClick={() => navigate('/monitor')}
              className="ml-auto text-blue-400 hover:text-blue-300 text-[11px] font-bold flex items-center gap-1 hover:underline"
            >
              <span>Telemetry Monitor &rarr;</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Notifications */}
        {successMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Workspace Path Picker & Scanner Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="space-y-1.5">
            <label htmlFor="target-path-input" className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-blue-400" />
                <span>Target Workspace Directory</span>
              </span>
              <span className="text-[11px] text-slate-500 font-normal">
                Absolute path inside container or host mount
              </span>
            </label>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="target-path-input"
                  type="text"
                  value={targetPath}
                  onChange={(e) => updatePathAndProject(e.target.value)}
                  placeholder="/home/assistantuser/advance_assistant or /mnt/d/..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-slate-100 font-mono focus:border-blue-500 focus:outline-none transition-colors shadow-inner"
                />
              </div>

              {/* History Dropdown */}
              {history?.history && history.history.length > 0 && (
                <div className="relative shrink-0">
                  <select
                    aria-label="Recent Workspace History"
                    onChange={(e) => {
                      if (e.target.value) {
                        updatePathAndProject(e.target.value);
                        performWorkspaceScan(e.target.value);
                      }
                    }}
                    value=""
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 rounded-lg px-2.5 py-2 cursor-pointer focus:outline-none"
                    title="Select from recent workspace history"
                  >
                    <option value="" disabled>
                      🕒 Recent Paths ({history.history.length})
                    </option>
                    {history.history.map((h, idx) => (
                      <option key={idx} value={h} className="bg-slate-900 text-slate-200">
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Scan Workspace Button */}
              <button
                id="scan-workspace-btn"
                type="button"
                onClick={() => performWorkspaceScan()}
                disabled={scanning || !targetPath.trim()}
                title="Scan workspace directory for existing files, languages, and tokens"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold transition-all shadow-md shadow-blue-900/30 shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                <span>{scanning ? 'Scanning...' : 'Scan Workspace'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------------- */}
        {/* COMPACT ACTIVE SWARM & MODEL ROSTER BAR (VISIBLE ABOVE TAB 1 & TAB 2) */}
        {/* -------------------------------------------------------------------- */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
          <div className="bg-slate-950/90 border border-indigo-900/40 rounded-xl p-3.5 shadow-lg space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Swarm Preset & Orchestrator Dropdowns */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Swarm Preset Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-slate-400 font-semibold text-[11px]">Swarm:</span>
                  <select
                    id="swarm-preset-select"
                    value={selectedSwarmId}
                    onChange={(e) => handleSwarmPresetChange(e.target.value)}
                    className="bg-transparent text-indigo-300 font-bold focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="GLOBAL_HYBRID_SWARM" className="bg-slate-900 text-slate-200">
                      🌐 Global Hybrid Swarm
                    </option>
                    <option value="FULLSTACK_CLOUD_SWARM" className="bg-slate-900 text-slate-200">
                      ☁️ Fullstack Cloud Swarm
                    </option>
                    <option value="AIR_GAPPED_LOCAL_SWARM" className="bg-slate-900 text-slate-200">
                      💻 Air-Gapped Local Swarm
                    </option>
                    {swarmsList
                      .filter(
                        (s) =>
                          !['GLOBAL_HYBRID_SWARM', 'FULLSTACK_CLOUD_SWARM', 'AIR_GAPPED_LOCAL_SWARM'].includes(s.id)
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                          ⚡ {s.name || s.id}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Orchestrator Model Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
                  <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-400 font-semibold text-[11px]">Orchestrator:</span>
                  <select
                    id="orchestrator-model-select"
                    value={orchestratorModel}
                    onChange={(e) => setOrchestratorModel(e.target.value)}
                    className="bg-transparent text-blue-300 font-bold focus:outline-none cursor-pointer text-xs"
                  >
                    <optgroup label="☁️ Google Free (85% Cap)">
                      <option value="gemini-4-argon">gemini-4-argon (1K RPM | 2M TPM | Unlimited RPD)</option>
                      <option value="gemini-3.8-flash">gemini-3.8-flash (1K RPM | 2M TPM)</option>
                      <option value="gemini-3.7-flash">gemini-3.7-flash (1K RPM | 2M TPM)</option>
                      <option value="gemini-3.6-flash">gemini-3.6-flash (1K RPM | 2M TPM)</option>
                      <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (4K RPM | 4M TPM)</option>
                      <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (4K RPM | 4M TPM)</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash (Proven Fast)</option>
                      <option value="gemini-omni-1.1-flash">gemini-omni-1.1-flash (Unlimited TPM)</option>
                      <option value="nano-banana-2">nano-banana-2 (100 RPM)</option>
                    </optgroup>
                    <optgroup label="💎 Google Paid (85% Cap)">
                      <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Coder)</option>
                      <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                    </optgroup>
                    <optgroup label="⚡ Groq LPU (85% Cap)">
                      <option value="qwen-2.5-coder-32b">qwen-2.5-coder-32b (Ultra Fast)</option>
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                      <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                    </optgroup>
                    <optgroup label="💻 Local Ollama (Pure GPU Safe <8GB)">
                      <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (Local Flagship - 60+ TPS)</option>
                      <option value="deepseek-r1:8b">deepseek-r1:8b (Reasoning Champion - 55+ TPS)</option>
                      <option value="qwen2.5-coder:1.5b">qwen2.5-coder:1.5b (Fast Local - 90+ TPS)</option>
                      <option value="sqlcoder:7b">sqlcoder:7b (SQL Specialist - 65+ TPS)</option>
                      <option value="qwen2.5-coder:14b">qwen2.5-coder:14b (Q4 Safe)</option>
                      <option value="qwen2.5-coder:32b">qwen2.5-coder:32b (Offload 1-2 TPS)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Worker Roster Pill, Dedicated Key Dropdown & Customize Button */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Active Worker Roster Summary Pill */}
                <span
                  id="worker-roster-summary-pill"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-xs font-mono text-emerald-300 font-semibold"
                >
                  <span>🤖</span>
                  <span>
                    {Math.min(maxModelsUsed, workerModels.length)}/{workerModels.length} Worker Models Active
                  </span>
                </span>

                {/* Dedicated Key Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-slate-400 font-semibold text-[11px]">Key:</span>
                  <select
                    id="swarm-key-select"
                    value={preferredKeyId}
                    onChange={(e) => setPreferredKeyId(e.target.value)}
                    className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="AUTO" className="bg-slate-900 text-slate-200">
                      🔑 AUTO Pool (Key Manager)
                    </option>
                    {registeredKeys.map((k) => (
                      <option key={k.id} value={k.id} className="bg-slate-900 text-slate-200">
                        [{k.provider || 'KEY'} {k.tier || 'FREE'}] {k.label || k.id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customize Worker Models Drawer Toggle Button */}
                <button
                  id="toggle-worker-picker-btn"
                  type="button"
                  onClick={() => setShowWorkerPicker(!showWorkerPicker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/50 text-xs font-semibold transition-all cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Customize Worker Models ({workerModels.length})</span>
                  {showWorkerPicker ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* 6 Sleek Swarm Roles Summary Chips */}
            <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 font-semibold">6 Sleek Roles:</span>
              {[
                { role: 'Architect', cost: 'Cloud Pro', isLocal: false, color: 'text-blue-300 border-blue-800/60 bg-blue-950/40' },
                { role: 'Scaffolder', cost: 'Local ($0)', isLocal: true, color: 'text-emerald-300 border-emerald-800/60 bg-emerald-950/40' },
                { role: 'Coder', cost: 'Cloud Free', isLocal: false, color: 'text-indigo-300 border-indigo-800/60 bg-indigo-950/40' },
                { role: 'Database', cost: 'Local ($0)', isLocal: true, color: 'text-amber-300 border-amber-800/60 bg-amber-950/40' },
                { role: 'Healer', cost: 'Local ($0)', isLocal: true, color: 'text-purple-300 border-purple-800/60 bg-purple-950/40' },
                { role: 'Velocity', cost: 'Cloud Free', isLocal: false, color: 'text-cyan-300 border-cyan-800/60 bg-cyan-950/40' }
              ].map((r) => (
                <span
                  key={r.role}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${r.color}`}
                  title={`${r.role} (${r.cost})`}
                >
                  <span>{r.role}:</span>
                  <span className={r.isLocal ? 'text-emerald-400 font-bold' : 'text-slate-300'}>{r.cost}</span>
                </span>
              ))}
            </div>

            {/* Collapsible Multi-Model Picker Drawer */}
            {showWorkerPicker && (
              <div className="pt-3 border-t border-slate-800/80 space-y-3 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-slate-400 font-semibold text-[11px]">Catalog Filter:</span>
                    {[
                      { id: 'ALL', label: 'All Catalog' },
                      { id: 'GOOGLE_FREE', label: '☁️ Google Free' },
                      { id: 'GOOGLE_PAID', label: '💎 Google Paid' },
                      { id: 'GROQ', label: '⚡ Groq LPU' },
                      { id: 'OLLAMA', label: '💻 Local Ollama' }
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setPickerFilter(f.id as any)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          pickerFilter === f.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    Click model chip to add/remove from active roster
                  </span>
                </div>

                {/* Model Chips Grid */}
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1 bg-slate-900/60 rounded-lg border border-slate-800">
                  {filteredPickerModels.map((m) => {
                    const isSelected = workerModels.includes(m.model_name);
                    const workingRpm = m.working_limits?.rpm || 12;
                    const workingTpm = formatTokens(m.working_limits?.tpm || 212500);

                    return (
                      <button
                        key={m.model_name}
                        type="button"
                        onClick={() => handleToggleWorkerModel(m.model_name)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all text-left ${
                          isSelected
                            ? 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200 shadow-sm'
                            : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {isSelected ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-[11px]">{m.model_name}</div>
                          <div className="text-[9px] text-slate-400">
                            85% Cap: {workingRpm} RPM • {workingTpm} TPM
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Roster Controls & Save Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <label htmlFor="max-models-slider" className="text-slate-300 font-semibold">
                        Max Models Used:
                      </label>
                      <input
                        id="max-models-slider"
                        type="range"
                        min={1}
                        max={Math.max(1, workerModels.length)}
                        value={maxModelsUsed}
                        onChange={(e) => setMaxModelsUsed(Number(e.target.value))}
                        className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <span className="font-bold text-indigo-300">
                        {maxModelsUsed} of {workerModels.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label htmlFor="routing-strategy-select" className="text-slate-300 font-semibold">
                        Strategy:
                      </label>
                      <select
                        id="routing-strategy-select"
                        value={routingStrategy}
                        onChange={(e) => setRoutingStrategy(e.target.value as any)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-semibold focus:outline-none"
                      >
                        <option value="ROUND_ROBIN">ROUND_ROBIN (Balanced)</option>
                        <option value="QUOTA_WEIGHTED">QUOTA_WEIGHTED (Quota Priority)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveSwarmRoster}
                    disabled={swarmSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shrink-0 cursor-pointer disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{swarmSaving ? 'Saving...' : '💾 Save as Default Swarm Roster'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3 Clean Mode Tabs */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <button
            id="tab-direct-launch"
            onClick={() => setActiveTab('direct')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'direct'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
            }`}
          >
            <Rocket className="w-4 h-4" />
            <span>1. Quick Direct Launch</span>
          </button>

          <button
            id="tab-blueprint-studio"
            onClick={() => setActiveTab('blueprint')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'blueprint'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>2. Iterative Blueprint & Dry-Run</span>
            {blueprintData && blueprintData.tasks?.length > 0 && (
              <span className="bg-indigo-900 text-indigo-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {blueprintData.tasks.length}
              </span>
            )}
          </button>

          <button
            id="tab-workspace-files"
            onClick={() => {
              setActiveTab('files');
              if (!scanResult) performWorkspaceScan();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer ${
              activeTab === 'files'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>3. Workspace Files & Code Inspector</span>
            {scanResult && (
              <span className="bg-emerald-900 text-emerald-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {scanResult.file_count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* TAB 1: QUICK DIRECT LAUNCH                                           */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'direct' && (
        <form onSubmit={handleDirectLaunch} className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="goal-input" className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>Engineering Goal & Directive</span>
              </label>

              {/* Prompt Inspirations Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Inspirations:</span>
                {PROMPT_INSPIRATIONS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGoal(p)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    {p.split(' ')[0]} {p.split(' ')[1]}...
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="goal-input"
              rows={4}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Architect and implement a high-throughput authentication and session token governor with full unit test coverage..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 font-sans focus:border-blue-500 focus:outline-none transition-colors shadow-inner"
            />

            {/* Quick Settings Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label htmlFor="project-name-input" className="text-[11px] font-bold text-slate-400 uppercase">
                  Project Name
                </label>
                <input
                  id="project-name-input"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label htmlFor="execution-mode-select" className="text-[11px] font-bold text-slate-400 uppercase">
                  Execution Mode
                </label>
                <select
                  id="execution-mode-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="AUTO_DETECT">AUTO_DETECT (Smart Engine)</option>
                  <option value="SINGLE_AGENT">SINGLE_AGENT (Fast Fixes)</option>
                  <option value="MULTI_AGENT">MULTI_AGENT (Swarm Orchestration)</option>
                </select>
              </div>

              <div>
                <label htmlFor="max-workers-input" className="text-[11px] font-bold text-slate-400 uppercase">
                  Max Swarm Workers ({maxWorkers})
                </label>
                <input
                  id="max-workers-input"
                  type="number"
                  min={1}
                  max={16}
                  value={maxWorkers}
                  onChange={(e) => setMaxWorkers(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>

            {/* Launch Buttons Strip */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 font-mono"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{advancedOpen ? 'Hide Advanced Config ▴' : 'Show Advanced Execution Config ▾'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  id="direct-launch-submit-btn"
                  type="submit"
                  disabled={submitting || !goal.trim() || !targetPath.trim()}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-blue-600/30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Play className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
                  <span>{submitting ? 'Dispatching...' : '🚀 Launch Autonomous Build'}</span>
                </button>
              </div>
            </div>

            {/* Collapsible Advanced Config Section */}
            {advancedOpen && (
              <div className="pt-4 border-t border-slate-800/80 space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Research Profile */}
                  <div className="space-y-1.5">
                    <label htmlFor="adv-research-profile" className="text-xs font-bold text-slate-300">
                      Research Profile
                    </label>
                    <select
                      id="adv-research-profile"
                      value={researchProfile}
                      onChange={(e) => setResearchProfile(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="BASIC">BASIC (Local Code Only)</option>
                      <option value="WEB_ENABLED">WEB_ENABLED (Perplexity / Search)</option>
                      <option value="DEEP_AUDIT">DEEP_AUDIT (Telemetry + Web)</option>
                    </select>
                  </div>

                  {/* Constraining Profile */}
                  <div className="space-y-1.5">
                    <label htmlFor="adv-constrain-profile" className="text-xs font-bold text-slate-300">
                      Model Constraining
                    </label>
                    <select
                      id="adv-constrain-profile"
                      value={constrainProfile}
                      onChange={(e) => setConstrainProfile(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="HIGH_RPM_TPM">HIGH_RPM_TPM (Optimal Cloud Free/Flash)</option>
                      <option value="LOCAL_ONLY">LOCAL_ONLY (Local Ollama Cluster)</option>
                      <option value="BALANCED">BALANCED (Multi-Provider Hybrid)</option>
                    </select>
                  </div>

                  {/* Target Model Tier */}
                  <div className="space-y-1.5">
                    <label htmlFor="adv-target-tier" className="text-xs font-bold text-slate-300">
                      Target Model Tier
                    </label>
                    <select
                      id="adv-target-tier"
                      value={tier}
                      onChange={(e) => setTier(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="AUTO">AUTO (Tier Optimizer)</option>
                      <option value="FAST">FAST (Flash-Lite / Instant)</option>
                      <option value="MID">MID (Flash / 70B Versatile)</option>
                      <option value="HIGH">HIGH (Pro Cloud / Deep Coder)</option>
                      <option value="LOCAL">LOCAL (Local Ollama Cluster)</option>
                    </select>
                  </div>
                </div>

                {/* Staging & Isolation Toggles */}
                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={isolate}
                      onChange={(e) => setIsolate(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>Isolate in Staging Directory (`/tmp/.staging_temp`)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={clearCache}
                      onChange={(e) => setClearCache(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>Clear Model Cache Before Launch</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={autoDefrag}
                      onChange={(e) => setAutoDefrag(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>Auto-Defragment Knowledge Books</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 2: ITERATIVE BLUEPRINT & DRY-RUN                                 */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'blueprint' && (
        <div className="space-y-6">
          {/* Step 1: Blueprint Generator Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label htmlFor="bp-goal-input" className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-400" />
                <span>Pre-Flight Blueprint Generator (Dry Run)</span>
              </label>

              {/* Iterative Prompt Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Iterative Prompts:</span>
                {ITERATIVE_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setBlueprintGoal(p)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    {p.split(' ')[0]} {p.split(' ')[1]}...
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="bp-goal-input"
              rows={3}
              value={blueprintGoal}
              onChange={(e) => setBlueprintGoal(e.target.value)}
              placeholder="e.g. Add JWT auth middleware and update routes, or refactor database models and add unit tests..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 font-sans focus:border-indigo-500 focus:outline-none transition-colors shadow-inner"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={useExistingContext}
                  onChange={(e) => setUseExistingContext(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span>Ground Blueprint with Existing Workspace Files & Structure</span>
              </label>

              <button
                id="generate-blueprint-btn"
                type="button"
                onClick={handleGenerateBlueprint}
                disabled={blueprintGenerating || (!blueprintGoal.trim() && !goal.trim())}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${blueprintGenerating ? 'animate-spin' : ''}`} />
                <span>{blueprintGenerating ? 'Scoping Blueprint...' : '🧭 Generate Pre-Flight Blueprint'}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Interactive Blueprint Table / Cards */}
          {blueprintData && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/20 animate-fade-in">
              {/* Blueprint Summary Bar */}
              <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-400">
                      ID: {blueprintData.blueprint_id}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-xs text-slate-300">
                      Est. Total Tokens: <strong>~{formatTokens(blueprintData.estimated_total_tokens)}</strong>
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-xs text-slate-400">
                      Existing Files Detected: {blueprintData.existing_files_detected}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-1">
                    Goal: <em>"{blueprintData.goal}"</em>
                  </p>
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomTask(true)}
                    className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom File Task</span>
                  </button>
                </div>
              </div>

              {/* Task Rows List */}
              <div className="divide-y divide-slate-800">
                {blueprintData.tasks.map((task) => {
                  const isExpanded = Boolean(expandedTasks[task.task_id]);
                  const isModify = task.action === 'MODIFY';

                  return (
                    <div
                      key={task.task_id}
                      className={`transition-colors ${task.selected !== false ? 'bg-slate-900/60' : 'bg-slate-950/40 opacity-70'}`}
                    >
                      <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Selection Checkbox */}
                          <input
                            type="checkbox"
                            checked={task.selected !== false}
                            onChange={() => handleToggleTaskSelect(task.task_id)}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                          />

                          {/* Action Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono border ${
                              isModify
                                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            }`}
                          >
                            {task.action}
                          </span>

                          {/* File Path */}
                          <div className="min-w-0">
                            <span className="font-mono text-xs font-bold text-white truncate block">
                              {task.target_file}
                            </span>
                            <span className="text-[11px] text-slate-400 line-clamp-1 hidden sm:block">
                              {task.directive}
                            </span>
                          </div>
                        </div>

                        {/* Right: Agent, Model, Tokens & Actions */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          {/* Assigned Agent */}
                          <span className="hidden md:inline-block px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300">
                            {task.assigned_agent}
                          </span>

                          {/* Model Badge */}
                          <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/50 text-[11px] text-indigo-300 font-mono">
                            {task.assigned_model}
                          </span>

                          {/* Tokens */}
                          <span className="text-[11px] font-mono text-slate-400">
                            ~{formatTokens((task.estimated_input_tokens || 500) + (task.estimated_output_tokens || 1000))} tok
                          </span>

                          {/* View Existing File Button (if MODIFY) */}
                          {isModify && (
                            <button
                              type="button"
                              onClick={() => handleInspectFile(task.target_file)}
                              title="Inspect existing code in workspace"
                              className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3 text-blue-400" />
                              <span className="hidden lg:inline">Inspect</span>
                            </button>
                          )}

                          {/* Expand chevron */}
                          <button
                            type="button"
                            onClick={() => handleToggleTaskExpand(task.task_id)}
                            title={isExpanded ? 'Collapse task details' : 'Edit task details'}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Click-to-Expand Row Drawer */}
                      {isExpanded && (
                        <div className="px-5 pb-4 pt-1 bg-slate-950/60 border-t border-slate-800/60 space-y-3 animate-fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-400 uppercase">Target File Path</label>
                              <input
                                type="text"
                                value={task.target_file}
                                onChange={(e) => handleUpdateTask(task.task_id, 'target_file', e.target.value)}
                                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-400 uppercase">Assigned Model</label>
                              <select
                                value={task.assigned_model}
                                onChange={(e) => handleUpdateTask(task.task_id, 'assigned_model', e.target.value)}
                                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
                              >
                                {catalogModels && catalogModels.length > 0 ? (
                                  catalogModels.map((m) => (
                                    <option key={m.model_name} value={m.model_name}>
                                      {m.model_name} ({m.provider} {m.tier})
                                    </option>
                                  ))
                                ) : (
                                  <>
                                    <option value="gemini-3.6-flash">gemini-3.6-flash (Fast)</option>
                                    <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Coder)</option>
                                    <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra Fast)</option>
                                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Groq)</option>
                                    <option value="qwen2.5-coder:32b">qwen2.5-coder:32b (Local)</option>
                                  </>
                                )}
                              </select>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-400 uppercase">Action Type</label>
                              <select
                                value={task.action}
                                onChange={(e) => handleUpdateTask(task.task_id, 'action', e.target.value)}
                                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
                              >
                                <option value="CREATE">CREATE (New File)</option>
                                <option value="MODIFY">MODIFY (Extend Existing)</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-400 uppercase">Directive / Instruction Prompt</label>
                            <textarea
                              rows={3}
                              value={task.directive}
                              onChange={(e) => handleUpdateTask(task.task_id, 'directive', e.target.value)}
                              className="w-full mt-1 bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-100 font-sans"
                            />
                          </div>

                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveTask(task.task_id)}
                              className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 hover:underline"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Task</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 3: Approve & Dispatch Bar */}
              <div className="p-4 sm:p-5 bg-slate-800/80 border-t border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    Ready to dispatch{' '}
                    <strong className="text-indigo-400">
                      {blueprintData.tasks.filter((t) => t.selected !== false).length}
                    </strong>{' '}
                    approved task(s) to autonomous swarm.
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Target: <code className="text-slate-300">{blueprintData.target_dir || targetPath}</code>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    id="dispatch-blueprint-btn"
                    type="button"
                    onClick={handleDispatchApprovedBlueprint}
                    disabled={blueprintExecuting || blueprintData.tasks.filter((t) => t.selected !== false).length === 0}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Play className={`w-3.5 h-3.5 ${blueprintExecuting ? 'animate-spin' : ''}`} />
                    <span>{blueprintExecuting ? 'Dispatching Swarm...' : '🚀 Approve & Dispatch to Swarm'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Custom Task Modal */}
          {showAddCustomTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-lg w-full space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Add Custom File Task to Blueprint</span>
                  </h4>
                  <button onClick={() => setShowAddCustomTask(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300">Target File Path</label>
                    <input
                      type="text"
                      value={customTaskFile}
                      onChange={(e) => setCustomTaskFile(e.target.value)}
                      placeholder="e.g. src/auth/jwt_handler.py"
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-300">Action Type</label>
                      <select
                        value={customTaskAction}
                        onChange={(e) => setCustomTaskAction(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                      >
                        <option value="CREATE">CREATE (New File)</option>
                        <option value="MODIFY">MODIFY (Existing)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300">Assigned Model</label>
                      <select
                        value={customTaskModel}
                        onChange={(e) => setCustomTaskModel(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                      >
                        {catalogModels && catalogModels.length > 0 ? (
                          catalogModels.map((m) => (
                            <option key={m.model_name} value={m.model_name}>
                              {m.model_name}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                            <option value="qwen2.5-coder:32b">qwen2.5-coder:32b</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">Directive Prompt</label>
                    <textarea
                      rows={3}
                      value={customTaskDirective}
                      onChange={(e) => setCustomTaskDirective(e.target.value)}
                      placeholder="Specific implementation requirements for this file..."
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomTask(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomTask}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                  >
                    Append Task
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 3: WORKSPACE FILES & CODE INSPECTOR                              */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'files' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-emerald-400" />
                  <span>Workspace File Scanner & Tree</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time code ledger of the target workspace for fast file inspection
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => performWorkspaceScan()}
                  disabled={scanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                  <span>Re-Scan</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-slate-800/80">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter files by path or extension..."
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none"
                />
              </div>

              {/* Extension filter chips */}
              {scanResult?.language_breakdown && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setScanFilterExt('ALL')}
                    className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap ${
                      scanFilterExt === 'ALL'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    All ({scanResult.file_count})
                  </button>
                  {Object.entries(scanResult.language_breakdown).map(([ext, count]) => (
                    <button
                      key={ext}
                      type="button"
                      onClick={() => setScanFilterExt(ext)}
                      className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap ${
                        scanFilterExt === ext
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {ext} ({count})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scanned Files List */}
            {scanResult ? (
              <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-96 overflow-y-auto">
                {scanResult.files
                  .filter((f) => {
                    const matchesExt = scanFilterExt === 'ALL' || f.ext === scanFilterExt;
                    const matchesSearch =
                      !fileSearchQuery || f.rel_path.toLowerCase().includes(fileSearchQuery.toLowerCase());
                    return matchesExt && matchesSearch;
                  })
                  .map((file, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="font-mono text-xs text-slate-200 truncate">{file.rel_path}</span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-slate-500">
                          {(file.size_bytes / 1024).toFixed(1)} KB
                        </span>

                        <button
                          type="button"
                          onClick={() => handleInspectFile(file.rel_path)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 text-[11px] font-mono border border-slate-700"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-slate-500 font-mono">
                Click "Scan Workspace" above to load repository file hierarchy
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* FILE INSPECTOR MODAL                                                 */}
      {/* -------------------------------------------------------------------- */}
      {inspectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white font-mono truncate flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{inspectingFile?.file_path || 'Loading code...'}</span>
                </h4>
                {inspectingFile && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>Lines: {inspectingFile.line_count}</span>
                    <span>•</span>
                    <span>Size: {(inspectingFile.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>Lang: {inspectingFile.language}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (inspectingFile?.content) {
                      navigator.clipboard.writeText(inspectingFile.content);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInspectModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Code Content Container */}
            <div className="flex-1 overflow-auto rounded-lg bg-slate-950 border border-slate-800 p-3 font-mono text-xs text-slate-200">
              {inspectLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mr-2" />
                  <span>Loading source file...</span>
                </div>
              ) : (
                <pre className="whitespace-pre overflow-x-auto leading-relaxed">
                  {inspectingFile?.content || 'No file content available.'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
