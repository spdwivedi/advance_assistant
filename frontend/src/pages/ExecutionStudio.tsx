import React, { useState, useEffect, useCallback } from 'react';
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
  Unlock
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
        const [configRes, historyRes, healthRes, bpRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/history'),
          fetch('/api/health'),
          fetch('/api/blueprint/preview')
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
            // Auto scan last location
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
        const data: FileInspectResult = await res.json();
        setInspectingFile(data);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setInspectingFile({
          status: 'error',
          file_path: filePath,
          full_path: '',
          size_bytes: 0,
          line_count: 0,
          language: 'plaintext',
          last_modified: '',
          content: `Error inspecting file: ${errJson.detail || res.statusText}`
        });
      }
    } catch (err: any) {
      setInspectingFile({
        status: 'error',
        file_path: filePath,
        full_path: '',
        size_bytes: 0,
        line_count: 0,
        language: 'plaintext',
        last_modified: '',
        content: `Connection error: ${err.message || String(err)}`
      });
    } finally {
      setInspectLoading(false);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = () => {
    if (inspectingFile?.content) {
      navigator.clipboard.writeText(inspectingFile.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Send a file to Tab 2 for targeted iterative modification
  const handleSendFileToBlueprint = (filePath: string) => {
    setInspectModalOpen(false);
    setActiveTab('blueprint');
    const updatePrompt = `Update and refactor ${filePath} to `;
    setBlueprintGoal((prev) => (prev ? `${prev}\n- ${updatePrompt}` : updatePrompt));
  };

  // Generate Pre-Flight Blueprint Dry Run
  const handleGenerateBlueprint = async () => {
    if (!targetPath.trim()) {
      setErrorMessage('Please specify a target workspace directory before generating a blueprint.');
      return;
    }
    if (!blueprintGoal.trim() && !goal.trim()) {
      setErrorMessage('Please enter an engineering goal or directive for the blueprint.');
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
          use_existing_context: useExistingContext
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
      // Create fresh blueprint data container
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
          model_profile: constrainProfile
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
        auto_defrag: autoDefrag
      };

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(`Build initiated! Workspace: ${projectName}. You can track progress in Swarm Monitor or Log Center.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.detail || 'Execution launch failed. Check server status.');
      }
    } catch (err: any) {
      setErrorMessage(`Connection error: ${err.message || String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Preset Goals for Tab 1
  const PRESET_GOALS = [
    {
      title: 'Full-Stack Web App',
      project: 'task_manager_app',
      text: 'Build a production full-stack Task Manager with FastAPI async SQLAlchemy SQLite backend, REST endpoints for tasks and tags, and a modern Vite React TypeScript frontend with dark mode.'
    },
    {
      title: 'Microservice API',
      project: 'metrics_api',
      text: 'Implement an asynchronous Python microservice using FastAPI with rate limiting, Pydantic v2 schemas, automated health-check router, and comprehensive Pytest test fixtures.'
    },
    {
      title: 'Automated Agent Bridge',
      project: 'automation_bridge',
      text: 'Create a local orchestration bridge connecting n8n webhook handlers with filesystem event listeners, structured JSON logging, and autonomous error recovery mechanisms.'
    }
  ];

  // Quick Iterative Prompts for Tab 2
  const ITERATIVE_PROMPTS = [
    'Add JWT authentication middleware and update protected user endpoints',
    'Refactor SQLite database models, add connection pooling, and write Pytest fixtures',
    'Implement rate limiting and token bucket throttles on public API routes',
    'Create production Dockerfile and multi-stage docker-compose configuration'
  ];

  const isBuildActive = Boolean(
    executionState?.is_running ||
    executionState?.status === 'PAUSED' ||
    executionState?.is_paused
  );

  const isPaused = Boolean(
    executionState?.is_paused ||
    executionState?.status === 'PAUSED' ||
    executionState?.current_phase === 'PAUSED'
  );

  // Filter scanned files for Tab 3
  const filteredFiles = (scanResult?.files || []).filter((f) => {
    const matchesExt = scanFilterExt === 'ALL' || f.ext.toLowerCase() === scanFilterExt.toLowerCase();
    const matchesSearch = !fileSearchQuery.trim() || f.rel_path.toLowerCase().includes(fileSearchQuery.toLowerCase());
    return matchesExt && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------------------- */}
      {/* 1. TOP WORKSPACE SELECTOR & 3-TAB MODE SWITCHER                     */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Target Workspace Directory Input & History Dropdown */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="workspace-target-input" className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                <FolderTree className="w-3.5 h-3.5 text-blue-400" />
                <span>Target Workspace Directory</span>
              </label>

              {/* Scan Status Pill */}
              {scanResult && (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      scanResult.exists && scanResult.file_count > 0
                        ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                        : 'bg-indigo-950/60 border-indigo-800/60 text-indigo-300'
                    }`}
                  >
                    <span>📁 {scanResult.file_count} file{scanResult.file_count !== 1 ? 's' : ''} detected</span>
                    {scanResult.has_existing_ledger && (
                      <span className="text-[10px] bg-emerald-800/80 text-white px-1.5 py-0.2 rounded">Ledger Active</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="workspace-target-input"
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

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 text-xs shadow-md animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-200 text-xs shadow-md animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 1: QUICK DIRECT LAUNCH (Minimalist by Default)                   */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'direct' && (
        <form onSubmit={handleDirectLaunch} className="space-y-5">
          {/* Primary Directive Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="direct-goal-input" className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <span>Engineering Goal & Directive</span>
              </label>

              {/* Quick Preset Chips */}
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Quick Presets:</span>
                {PRESET_GOALS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setGoal(p.text);
                      setProjectName(p.project);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="direct-goal-input"
              rows={4}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Build a production FastAPI backend with async SQLite, REST endpoints, and automated tests..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 font-sans focus:border-blue-500 focus:outline-none transition-colors shadow-inner"
            />

            {/* 3 Essential Controls in Single Clean Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* 1. Execution Mode */}
              <div className="space-y-1.5">
                <label htmlFor="direct-mode-select" className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Execution Mode
                </label>
                <select
                  id="direct-mode-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-medium focus:outline-none focus:border-blue-500"
                >
                  {(config?.execution_modes || [
                    'AUTO_DETECT',
                    'HYBRID_CLOUD',
                    'OFFLINE_ONLY',
                    'OFFLINE_AGENTIC',
                    'HYBRID_AGENTIC'
                  ]).map((m) => (
                    <option key={m} value={m} className="bg-slate-900 text-slate-200">
                      {m.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Swarm Concurrency Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="direct-workers-slider" className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Swarm Concurrency
                  </label>
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 rounded">
                    {maxWorkers} Worker{maxWorkers > 1 ? 's' : ''}
                  </span>
                </div>
                <input
                  id="direct-workers-slider"
                  type="range"
                  min={1}
                  max={16}
                  value={maxWorkers}
                  onChange={(e) => setMaxWorkers(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* 3. Launch Autonomous Build Button & Inline Stop/Pause */}
              <div className="flex items-end gap-2">
                <button
                  id="direct-launch-submit-btn"
                  type="submit"
                  disabled={submitting || !goal.trim() || !targetPath.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 shadow-lg shadow-blue-600/30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Rocket className="w-4 h-4 shrink-0" />
                  <span>{submitting ? 'Initiating Build...' : 'Launch Autonomous Build'}</span>
                </button>

                {/* Inline Pause/Resume & Stop if active */}
                {isBuildActive && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch('/api/execute/pause', { method: 'POST' });
                      }}
                      title={isPaused ? 'Resume Build' : 'Pause Build'}
                      className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    >
                      {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch('/api/execute/stop', { method: 'POST' });
                      }}
                      title="Stop Build Immediately"
                      className="p-2.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 transition-colors"
                    >
                      <Square className="w-4 h-4 fill-rose-400 text-rose-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Collapsible Accordion: Advanced Routing, Research & Isolation Settings */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <button
              id="toggle-advanced-accordion-btn"
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Advanced Routing, Research & Isolation Settings
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  ({researchProfile} research • {constrainProfile} profile)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{advancedOpen ? 'Hide' : 'Configure'}</span>
                {advancedOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {advancedOpen && (
              <div className="p-5 border-t border-slate-800/80 bg-slate-950/50 space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Research Depth Profile */}
                  <div className="space-y-1.5">
                    <label htmlFor="adv-research-profile" className="text-xs font-bold text-slate-300">
                      Research Depth Profile
                    </label>
                    <select
                      id="adv-research-profile"
                      value={researchProfile}
                      onChange={(e) => setResearchProfile(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="BASIC">BASIC (Offline/Deterministic)</option>
                      <option value="MEDIUM">MEDIUM (Focused Web Grounding)</option>
                      <option value="HIGH">HIGH (Comprehensive Research)</option>
                      <option value="MAX">MAX (Deep Web & Topic Synthesis)</option>
                    </select>
                  </div>

                  {/* Model Constraining Profile */}
                  <div className="space-y-1.5">
                    <label htmlFor="adv-constrain-profile" className="text-xs font-bold text-slate-300">
                      Model Constraining Profile
                    </label>
                    <select
                      id="adv-constrain-profile"
                      value={constrainProfile}
                      onChange={(e) => setConstrainProfile(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="HIGH_RPM_TPM">HIGH_RPM_TPM (3.6-Flash / Qwen 32B)</option>
                      <option value="HIGHEST_RPM_TPM">HIGHEST_RPM_TPM (Flash-Lite Maximum Throughput)</option>
                      <option value="PRO_PLAN">PRO_PLAN (Gemini 2.5/3.1 Pro Cloud)</option>
                      <option value="OFFLINE_PURE">OFFLINE_PURE (Local Ollama Only)</option>
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
                  className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span>Include existing workspace files in blueprint context (scans `{targetPath || 'workspace'}`)</span>
              </label>

              <button
                id="generate-blueprint-btn"
                type="button"
                onClick={handleGenerateBlueprint}
                disabled={blueprintGenerating || (!blueprintGoal.trim() && !goal.trim())}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 shadow-lg shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${blueprintGenerating ? 'animate-spin' : ''}`} />
                <span>{blueprintGenerating ? 'Decomposing Tasks...' : '🔍 Generate Pre-Flight Blueprint'}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Compact Task Table with Click-to-Expand Details */}
          {blueprintData && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/20 space-y-0">
              {/* Summary Header */}
              <div className="p-4 sm:p-5 bg-slate-800/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Blueprint Task List</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                      ID: {blueprintData.blueprint_id}
                    </span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>Project: <strong className="text-slate-200">{blueprintData.project_name}</strong></span>
                    <span>•</span>
                    <span>Existing Files: <strong className="text-slate-200">{blueprintData.existing_files_detected}</strong></span>
                    <span>•</span>
                    <span>
                      Selected:{' '}
                      <strong className="text-indigo-400">
                        {blueprintData.tasks.filter((t) => t.selected !== false).length} / {blueprintData.tasks.length}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>Estimated Tokens: <strong className="text-emerald-400">~{formatTokens(blueprintData.estimated_total_tokens)} tok</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Deselect All
                  </button>
                  <button
                    id="add-custom-task-btn"
                    type="button"
                    onClick={() => setShowAddCustomTask(true)}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add File Task</span>
                  </button>
                </div>
              </div>

              {/* Task Rows List */}
              <div className="divide-y divide-slate-800/80">
                {blueprintData.tasks.map((task) => {
                  const isExpanded = Boolean(expandedTasks[task.task_id]);
                  const isModify = task.action === 'MODIFY';

                  return (
                    <div key={task.task_id} className="transition-colors hover:bg-slate-800/30">
                      {/* Compact Task Row Header */}
                      <div className="p-3.5 sm:px-5 flex items-center justify-between gap-3">
                        {/* Checkbox & File info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={task.selected !== false}
                            onChange={() => handleToggleTaskSelect(task.task_id)}
                            className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer h-4 w-4"
                          />

                          {/* Action Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border shrink-0 ${
                              isModify
                                ? 'bg-amber-950/70 border-amber-700/60 text-amber-300'
                                : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                            }`}
                          >
                            {task.action}
                          </span>

                          {/* Target File */}
                          <span className="font-mono text-xs text-slate-200 font-semibold truncate" title={task.target_file}>
                            {task.target_file}
                          </span>
                        </div>

                        {/* Model & Token metadata */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          {/* Agent Badge */}
                          <span className="hidden md:inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-300 font-medium">
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
                                <option value="gemini-3.6-flash">gemini-3.6-flash (Fast)</option>
                                <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Coder)</option>
                                <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra Fast)</option>
                                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Groq)</option>
                                <option value="qwen2.5-coder:32b">qwen2.5-coder:32b (Local)</option>
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
                    id="approve-dispatch-blueprint-btn"
                    type="button"
                    onClick={handleDispatchApprovedBlueprint}
                    disabled={blueprintExecuting || blueprintData.tasks.filter((t) => t.selected !== false).length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 shadow-lg shadow-emerald-600/30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{blueprintExecuting ? 'Dispatching Swarm...' : `Approve & Dispatch (${blueprintData.tasks.filter((t) => t.selected !== false).length} Files)`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/swarm')}
                    title="Jump to Swarm Monitor"
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal / Panel: Add Custom File Task */}
          {showAddCustomTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-lg w-full space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-indigo-400" />
                    <span>Add Custom File Task to Blueprint</span>
                  </h4>
                  <button onClick={() => setShowAddCustomTask(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300">Target File Path (Relative)</label>
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
                      <label className="text-xs font-bold text-slate-300">Action</label>
                      <select
                        value={customTaskAction}
                        onChange={(e) => setCustomTaskAction(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                      >
                        <option value="CREATE">CREATE</option>
                        <option value="MODIFY">MODIFY</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300">Assigned Model</label>
                      <select
                        value={customTaskModel}
                        onChange={(e) => setCustomTaskModel(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                      >
                        <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                        <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                        <option value="qwen2.5-coder:32b">qwen2.5-coder:32b</option>
                        <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300">Directive Prompt</label>
                    <textarea
                      rows={3}
                      value={customTaskDirective}
                      onChange={(e) => setCustomTaskDirective(e.target.value)}
                      placeholder="Detailed directives for the autonomous worker..."
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
                    disabled={!customTaskFile.trim()}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold text-white"
                  >
                    Add Task
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
        <div className="space-y-5">
          {/* Workspace Browser Header Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl shadow-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-emerald-400" />
                  <span>Workspace File Browser & Inspector</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Path: <code className="text-slate-200">{scanResult?.resolved_path || targetPath}</code>
                </p>
              </div>

              <button
                type="button"
                onClick={() => performWorkspaceScan()}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                <span>Refresh Scan</span>
              </button>
            </div>

            {/* Language Breakdown Badges */}
            {scanResult?.language_breakdown && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 font-semibold">Filter:</span>
                <button
                  type="button"
                  onClick={() => setScanFilterExt('ALL')}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                    scanFilterExt === 'ALL'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All ({scanResult.file_count})
                </button>
                {Object.entries(scanResult.language_breakdown).map(([ext, count]) => (
                  <button
                    key={ext}
                    type="button"
                    onClick={() => setScanFilterExt(ext)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                      scanFilterExt === ext
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {ext}: {count}
                  </button>
                ))}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                placeholder="Search files by path or extension..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Files List Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/20">
            {filteredFiles.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {scanning
                  ? 'Scanning workspace files...'
                  : 'No files found in workspace matching current filter.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {filteredFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 sm:px-5 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2.5">
                      <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-mono text-xs text-slate-200 font-semibold truncate" title={file.rel_path}>
                        {file.rel_path}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono shrink-0">
                        {file.ext}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                        {(file.size_bytes / 1024).toFixed(1)} KB
                      </span>
                      <span className="text-[11px] text-slate-500 hidden md:inline">
                        {file.last_modified}
                      </span>

                      {/* Action 1: Inspect Code */}
                      <button
                        type="button"
                        onClick={() => handleInspectFile(file.rel_path)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span>Inspect</span>
                      </button>

                      {/* Action 2: Modify in Blueprint */}
                      <button
                        type="button"
                        onClick={() => handleSendFileToBlueprint(file.rel_path)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 text-xs text-indigo-300 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="hidden sm:inline">Modify in Blueprint</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* CODE INSPECTOR MODAL                                                 */}
      {/* -------------------------------------------------------------------- */}
      {inspectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                <h4 className="text-sm font-bold text-white font-mono truncate">
                  {inspectingFile?.file_path || 'Inspecting File'}
                </h4>
                {inspectingFile && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                    {inspectingFile.language}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {inspectingFile && (
                  <>
                    <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                      {inspectingFile.line_count} lines • {(inspectingFile.size_bytes / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendFileToBlueprint(inspectingFile.file_path)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Modify in Blueprint</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => setInspectModalOpen(false)}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Code View */}
            <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-200 leading-relaxed">
              {inspectLoading ? (
                <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                  <span>Loading file content...</span>
                </div>
              ) : inspectingFile ? (
                <pre className="whitespace-pre overflow-x-auto select-text">
                  {inspectingFile.content}
                </pre>
              ) : (
                <div className="text-slate-500">No content available.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
