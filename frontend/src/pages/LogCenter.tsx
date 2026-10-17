import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScrollText,
  Terminal,
  Activity,
  Search,
  RefreshCw,
  Play,
  Pause,
  Filter,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Copy,
  Check,
  X,
  Radio,
  FileText,
  Calendar,
  Cpu,
  FolderGit2,
  TestTube,
  Sparkles,
  BookOpen,
  ArrowDownCircle,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  Maximize2,
  Minimize2,
  Sliders,
  Zap,
  ArrowUpRight
} from 'lucide-react';

// ==============================================================================
// TYPES & INTERFACES
// ==============================================================================

export type SeverityLevel = 'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
export type SourceType = 'master' | 'daily' | 'category' | 'model' | 'project' | 'test';

export interface LogEntry {
  id: number;
  timestamp: string;
  model: string;
  category: string;
  action: string;
  env: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  details: Record<string, any>;
  raw: string;
}

export interface LogSources {
  master: {
    exists: boolean;
    size_bytes: number;
    path: string;
  };
  daily_logs: Array<{
    name: string;
    size_bytes: number;
    path: string;
  }>;
  categories: Record<string, Array<{
    name: string;
    action: string;
    size_bytes: number;
    path: string;
  }>>;
  models: Array<{
    name: string;
    model: string;
    size_bytes: number;
    path: string;
  }>;
  projects: Array<{
    name: string;
    has_trace: boolean;
    has_ledger: boolean;
    trace_size: number;
    path: string;
  }>;
  test_logs: Array<{
    name: string;
    test_name: string;
    size_bytes: number;
    path: string;
  }>;
}

export interface LogQueryResponse {
  status: string;
  source_type: string;
  source_name: string | null;
  resolved_path: string;
  total_matched: number;
  entries: LogEntry[];
  facets: {
    models: string[];
    categories: string[];
    counts: {
      INFO: number;
      SUCCESS: number;
      WARNING: number;
      ERROR: number;
    };
  };
}

export interface BlueprintLedger {
  project_name: string;
  created_at?: string;
  last_modified?: string;
  architecture_blueprint?: Record<string, {
    last_action: string;
    associated_task: string;
    timestamp: string;
  }>;
  file_history?: Array<{
    file: string;
    action: string;
    task: string;
    timestamp: string;
  }>;
}

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getSeverityBadgeClass(sev: string): string {
  switch (sev?.toUpperCase()) {
    case 'ERROR':
      return 'bg-rose-950/80 text-rose-300 border-rose-800/70 shadow-rose-950/40';
    case 'WARNING':
      return 'bg-amber-950/80 text-amber-300 border-amber-800/70 shadow-amber-950/40';
    case 'SUCCESS':
      return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/70 shadow-emerald-950/40';
    case 'INFO':
    default:
      return 'bg-blue-950/80 text-blue-300 border-blue-800/70 shadow-blue-950/40';
  }
}

function getSeverityIcon(sev: string) {
  switch (sev?.toUpperCase()) {
    case 'ERROR':
      return <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    case 'WARNING':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case 'SUCCESS':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'INFO':
    default:
      return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  }
}

// ==============================================================================
// COMPONENT
// ==============================================================================

export const LogCenter: React.FC = () => {
  const navigate = useNavigate();

  // 1. Source Selection State
  const [sources, setSources] = useState<LogSources | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('master');
  const [sourceName, setSourceName] = useState<string>('');
  const [selectedCategoryDomain, setSelectedCategoryDomain] = useState<string>('');

  // 2. Query & Filter State
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalMatched, setTotalMatched] = useState<number>(0);
  const [facets, setFacets] = useState<LogQueryResponse['facets']>({
    models: [],
    categories: [],
    counts: { INFO: 0, SUCCESS: 0, WARNING: 0, ERROR: 0 }
  });
  const [resolvedPath, setResolvedPath] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel>('ALL');
  const [modelFilter, setModelFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tailLimit, setTailLimit] = useState<number>(300);
  const [isTailMode, setIsTailMode] = useState<boolean>(true); // true = newest first/tail

  // 3. UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspectedEntry, setInspectedEntry] = useState<LogEntry | null>(null);
  const [isInspectorMinimized, setIsInspectorMinimized] = useState<boolean>(false);
  const [isExportTrayOpen, setIsExportTrayOpen] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 4. WebSocket Live Tail State
  const [isLiveTail, setIsLiveTail] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [newLinesCount, setNewLinesCount] = useState<number>(0);
  const [lastPulse, setLastPulse] = useState<Date | null>(null);
  const [followBottom, setFollowBottom] = useState<boolean>(true);

  // 5. Project Blueprint Ledger Modal
  const [isLedgerOpen, setIsLedgerOpen] = useState<boolean>(false);
  const [ledgerData, setLedgerData] = useState<BlueprintLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);

  // Refs
  const logContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ----------------------------------------------------------------------------
  // INITIAL SOURCES FETCH
  // ----------------------------------------------------------------------------
  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/logs/sources');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data.status === 'success' && data.sources) {
        setSources(data.sources);

        // Set initial category domain if available
        const catKeys = Object.keys(data.sources.categories || {});
        if (catKeys.length > 0 && !selectedCategoryDomain) {
          setSelectedCategoryDomain(catKeys[0]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load log sources:', err);
      setErrorMsg(`Failed to discover log sources: ${err.message}`);
    }
  }, [selectedCategoryDomain]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // ----------------------------------------------------------------------------
  // AUTO SELECT FIRST ITEM WHEN SOURCE TYPE CHANGES
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (!sources) return;

    if (sourceType === 'master') {
      setSourceName('');
    } else if (sourceType === 'daily') {
      if (sources.daily_logs?.length > 0) {
        setSourceName(sources.daily_logs[0].name);
      } else {
        setSourceName('');
      }
    } else if (sourceType === 'category') {
      const catKeys = Object.keys(sources.categories || {});
      const domain = selectedCategoryDomain || catKeys[0] || 'general';
      const actions = sources.categories[domain] || [];
      if (actions.length > 0) {
        setSourceName(`${domain}/${actions[0].name}`);
      } else {
        setSourceName('');
      }
    } else if (sourceType === 'model') {
      if (sources.models?.length > 0) {
        setSourceName(sources.models[0].name);
      } else {
        setSourceName('');
      }
    } else if (sourceType === 'project') {
      if (sources.projects?.length > 0) {
        setSourceName(sources.projects[0].name);
      } else {
        setSourceName('');
      }
    } else if (sourceType === 'test') {
      if (sources.test_logs?.length > 0) {
        setSourceName(sources.test_logs[0].name);
      } else {
        setSourceName('');
      }
    }
  }, [sourceType, sources, selectedCategoryDomain]);

  // ----------------------------------------------------------------------------
  // QUERY LOGS API
  // ----------------------------------------------------------------------------
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('source_type', sourceType);
      if (sourceName) params.set('source_name', sourceName);
      if (modelFilter && modelFilter !== 'ALL') params.set('model', modelFilter);
      if (categoryFilter && categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (severityFilter && severityFilter !== 'ALL') params.set('severity', severityFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', tailLimit.toString());
      params.set('tail', isTailMode ? 'true' : 'false');

      const res = await fetch(`/api/logs/query?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: LogQueryResponse = await res.json();

      if (data.status === 'success') {
        setEntries(data.entries || []);
        setTotalMatched(data.total_matched || 0);
        setFacets(data.facets || { models: [], categories: [], counts: { INFO: 0, SUCCESS: 0, WARNING: 0, ERROR: 0 } });
        setResolvedPath(data.resolved_path || '');
      } else if (data.status === 'not_found') {
        setEntries([]);
        setTotalMatched(0);
        setResolvedPath(data.resolved_path || '');
      }
    } catch (err: any) {
      console.error('Log query failed:', err);
      setErrorMsg(`Log query error: ${err.message}`);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [sourceType, sourceName, modelFilter, categoryFilter, severityFilter, searchQuery, tailLimit, isTailMode]);

  // Trigger query on filter or source changes
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ----------------------------------------------------------------------------
  // WEBSOCKET REAL-TIME LIVE TAIL
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (!isLiveTail) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host || 'localhost:8000';
    const wsUrl = `${wsProtocol}//${wsHost}/ws/logs?source_type=${sourceType}&source_name=${encodeURIComponent(sourceName || '')}`;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      setLastPulse(new Date());
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.type === 'heartbeat') {
          setLastPulse(new Date());
        } else if (frame.type === 'initial_batch') {
          setLastPulse(new Date());
        } else if (frame.type === 'new_entries') {
          setLastPulse(new Date());
          if (frame.entries && frame.entries.length > 0) {
            setEntries((prev) => {
              const newLines = frame.entries as LogEntry[];
              const updated = [...prev, ...newLines];
              return updated.slice(-tailLimit);
            });
            setNewLinesCount((prev) => prev + frame.entries.length);
            setTotalMatched((prev) => prev + frame.entries.length);

            if (followBottom && logContainerRef.current) {
              setTimeout(() => {
                logContainerRef.current?.scrollTo({
                  top: logContainerRef.current.scrollHeight,
                  behavior: 'smooth'
                });
              }, 50);
            }
          }
        } else if (frame.type === 'file_rotated') {
          fetchLogs(true);
        }
      } catch (err) {
        console.error('WS log message parse error:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isLiveTail, sourceType, sourceName, followBottom, tailLimit, fetchLogs]);

  // ----------------------------------------------------------------------------
  // AUTO SCROLL TO BOTTOM ON MOUNT / LOAD IF FOLLOW ACTIVE
  // ----------------------------------------------------------------------------
  useEffect(() => {
    if (followBottom && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [entries, followBottom]);

  // ----------------------------------------------------------------------------
  // COPY CLIPBOARD HANDLER
  // ----------------------------------------------------------------------------
  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ----------------------------------------------------------------------------
  // EXPORT HANDLERS
  // ----------------------------------------------------------------------------
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `logs_${sourceType}_${sourceName || 'master'}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportRaw = () => {
    const rawText = entries.map((e) => e.raw).join('\n');
    const dataStr = 'data:text/plain;charset=utf-8,' + encodeURIComponent(rawText);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `logs_${sourceType}_${sourceName || 'master'}_${Date.now()}.log`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // ----------------------------------------------------------------------------
  // PROJECT BLUEPRINT LEDGER HANDLER
  // ----------------------------------------------------------------------------
  const handleOpenLedger = async (projectName: string) => {
    setIsLedgerOpen(true);
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/logs/project/${encodeURIComponent(projectName)}/ledger`);
      const data = await res.json();
      if (data.status === 'success' && data.ledger) {
        setLedgerData(data.ledger);
      } else {
        setLedgerData(null);
      }
    } catch (err) {
      console.error('Failed to fetch project ledger:', err);
      setLedgerData(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  // ----------------------------------------------------------------------------
  // ACTIVE SOURCE METADATA
  // ----------------------------------------------------------------------------
  const activeSourceMeta = useMemo(() => {
    if (!sources) return { label: 'Loading...', size: 0, path: '' };

    switch (sourceType) {
      case 'master':
        return {
          label: 'Master Global Timeline',
          size: sources.master.size_bytes,
          path: sources.master.path
        };
      case 'daily': {
        const found = sources.daily_logs.find((d) => d.name === sourceName);
        return {
          label: sourceName ? `Daily Log: ${sourceName}` : 'Daily IST Logs',
          size: found?.size_bytes || 0,
          path: found?.path || 'logs/daily/'
        };
      }
      case 'category': {
        return {
          label: sourceName ? `Category: ${sourceName}` : 'Domain Categories',
          size: 0,
          path: `logs/categories/${sourceName}`
        };
      }
      case 'model': {
        const found = sources.models.find((m) => m.name === sourceName);
        return {
          label: sourceName ? `Model: ${found?.model || sourceName}` : 'Model Activity',
          size: found?.size_bytes || 0,
          path: found?.path || 'logs/categories/models/'
        };
      }
      case 'project': {
        const found = sources.projects.find((p) => p.name === sourceName);
        return {
          label: sourceName ? `Project: ${sourceName}` : 'Project Workspaces',
          size: found?.trace_size || 0,
          path: found?.path || 'logs/projects/'
        };
      }
      case 'test': {
        const found = sources.test_logs.find((t) => t.name === sourceName);
        return {
          label: sourceName ? `Test: ${found?.test_name || sourceName}` : 'Test Mirrors',
          size: found?.size_bytes || 0,
          path: found?.path || 'test/test_logs/'
        };
      }
    }
  }, [sources, sourceType, sourceName]);

  const selectedProjectObj = useMemo(() => {
    if (sourceType !== 'project' || !sources) return null;
    return sources.projects.find((p) => p.name === sourceName) || null;
  }, [sourceType, sources, sourceName]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ==================================================================== */}
      {/* 1. COMPACT TOP NAVIGATION & STREAM BAR */}
      {/* ==================================================================== */}
      <header className="shrink-0 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur flex flex-wrap items-center justify-between gap-3">
        {/* Left: Title + Stream Path & Size Pill */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-glow-sm shrink-0">
            <ScrollText className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                Log Center
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 uppercase">
                  v6.0
                </span>
              </h1>

              {/* Active Stream Path & Size Pill */}
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800/80 border border-slate-700/70 text-slate-300">
                <span className="text-cyan-400 font-semibold">{activeSourceMeta.label}</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 truncate max-w-[200px]" title={resolvedPath || activeSourceMeta.path}>
                  {resolvedPath || activeSourceMeta.path}
                </span>
                {activeSourceMeta.size > 0 && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-200">{formatBytes(activeSourceMeta.size)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Quick-Return Buttons, Stream Dropdown, Live Tail & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 1-Click Back to Studio */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors shadow-sm"
            title="Return to Execution Studio"
          >
            <span>🚀 Studio</span>
          </button>

          {/* 1-Click Swarm Monitor */}
          <button
            onClick={() => navigate('/swarm')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors shadow-sm"
            title="Open Swarm Monitor"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Swarm</span>
          </button>

          <span className="w-px h-5 bg-slate-800 hidden sm:block" />

          {/* Stream Type Dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="bg-slate-800 border border-slate-700 text-cyan-300 font-semibold rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500 shadow-sm"
            >
              <option value="master">🌐 Master Timeline</option>
              <option value="daily">📅 Daily IST Logs</option>
              <option value="category">🗂️ Category Logs</option>
              <option value="model">🤖 Model Logs</option>
              <option value="project">📁 Project Traces</option>
              <option value="test">🧪 Test Logs</option>
            </select>
          </div>

          {/* Secondary Sub-Target Dropdowns */}
          {sourceType === 'daily' && sources?.daily_logs && (
            <select
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-cyan-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              {sources.daily_logs.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name.replace('.log', '')} ({formatBytes(d.size_bytes)})
                </option>
              ))}
            </select>
          )}

          {sourceType === 'category' && sources?.categories && (
            <>
              <select
                value={selectedCategoryDomain}
                onChange={(e) => {
                  setSelectedCategoryDomain(e.target.value);
                  const actions = sources.categories[e.target.value] || [];
                  if (actions.length > 0) {
                    setSourceName(`${e.target.value}/${actions[0].name}`);
                  }
                }}
                className="bg-slate-800 border border-slate-700 text-purple-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-500"
              >
                {Object.keys(sources.categories).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.toUpperCase()} ({sources.categories[cat]?.length || 0})
                  </option>
                ))}
              </select>

              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-purple-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-purple-500 max-w-[160px]"
              >
                {(sources.categories[selectedCategoryDomain] || []).map((af) => (
                  <option key={af.name} value={`${selectedCategoryDomain}/${af.name}`}>
                    {af.action} ({formatBytes(af.size_bytes)})
                  </option>
                ))}
              </select>
            </>
          )}

          {sourceType === 'model' && sources?.models && (
            <select
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-amber-500 max-w-[200px]"
            >
              {sources.models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.model} ({formatBytes(m.size_bytes)})
                </option>
              ))}
            </select>
          )}

          {sourceType === 'project' && sources?.projects && (
            <select
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-emerald-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500 max-w-[180px]"
            >
              {sources.projects.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.has_ledger ? '📐' : ''} ({formatBytes(p.trace_size)})
                </option>
              ))}
            </select>
          )}

          {sourceType === 'test' && sources?.test_logs && (
            <select
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-rose-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-rose-500 max-w-[200px]"
            >
              {sources.test_logs.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.test_name} ({formatBytes(t.size_bytes)})
                </option>
              ))}
            </select>
          )}

          {/* Live Tail Toggle Pill */}
          <button
            onClick={() => setIsLiveTail(!isLiveTail)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isLiveTail && wsConnected
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900/80'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700/80'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveTail && wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
              }`}
            />
            <span>{isLiveTail && wsConnected ? 'Live' : 'Paused'}</span>
          </button>

          {/* Auto-Scroll Checkbox */}
          <label className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/70 text-xs text-slate-300 cursor-pointer hover:bg-slate-800 transition-colors">
            <input
              type="checkbox"
              checked={followBottom}
              onChange={(e) => setFollowBottom(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5"
            />
            <span className="hidden sm:inline text-[11px]">Auto-Scroll</span>
          </label>

          {/* Collapsible Filters & Export Toggle */}
          <button
            onClick={() => setIsExportTrayOpen(!isExportTrayOpen)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isExportTrayOpen
                ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="Configure tail limits, ordering, and export logs"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden md:inline">Options</span>
            {isExportTrayOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Refresh Button */}
          <button
            onClick={() => fetchLogs()}
            disabled={isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            title="Manual query refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. COLLAPSIBLE FILTERS & EXPORT TRAY */}
      {/* ==================================================================== */}
      {isExportTrayOpen && (
        <section className="shrink-0 px-4 py-2 bg-slate-900/95 border-b border-indigo-900/50 flex flex-wrap items-center justify-between gap-3 text-xs animate-in slide-in-from-top duration-150">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Tail Limit Selector */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-400">Tail Limit:</span>
              <select
                value={tailLimit}
                onChange={(e) => setTailLimit(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-cyan-500"
              >
                <option value={100}>100 lines</option>
                <option value={300}>300 lines</option>
                <option value={500}>500 lines</option>
                <option value={1000}>1,000 lines</option>
                <option value={2000}>2,000 lines</option>
              </select>
            </div>

            {/* Ordering Selector */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-400">Ordering:</span>
              <button
                onClick={() => setIsTailMode(!isTailMode)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-cyan-300"
              >
                {isTailMode ? '⬇️ Newest First (Tail)' : '⬆️ Oldest First (Head)'}
              </button>
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Export:</span>
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-indigo-300 transition-colors"
              title="Download currently matched entries as formatted JSON"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>JSON ({entries.length})</span>
            </button>
            <button
              onClick={handleExportRaw}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-cyan-300 transition-colors"
              title="Download raw log lines as .log"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>RAW (.log)</span>
            </button>
          </div>
        </section>
      )}

      {/* ==================================================================== */}
      {/* 3. COMPACT SEVERITY PILLS, MODEL/CAT DROPDOWNS & SEARCH ROW */}
      {/* ==================================================================== */}
      <section className="shrink-0 px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
        {/* Severity Pills with Live Facet Counts */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setSeverityFilter('ALL')}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-all flex items-center gap-1 ${
              severityFilter === 'ALL'
                ? 'bg-slate-700 text-white font-bold border border-slate-600 shadow-sm'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>ALL</span>
            <span className="px-1 py-0.1 rounded text-[10px] bg-slate-900 text-slate-300 font-bold">
              {totalMatched}
            </span>
          </button>

          <button
            onClick={() => setSeverityFilter('INFO')}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-all flex items-center gap-1 border ${
              severityFilter === 'INFO'
                ? 'bg-blue-950 text-blue-200 border-blue-600 font-bold shadow-sm'
                : 'bg-blue-950/40 text-blue-400 hover:bg-blue-950/70 border-blue-900/60'
            }`}
          >
            <Info className="w-3 h-3 text-blue-400" />
            <span>INFO</span>
            <span className="px-1 py-0.1 rounded text-[10px] bg-blue-900/80 text-blue-200">
              {facets.counts.INFO || 0}
            </span>
          </button>

          <button
            onClick={() => setSeverityFilter('SUCCESS')}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-all flex items-center gap-1 border ${
              severityFilter === 'SUCCESS'
                ? 'bg-emerald-950 text-emerald-200 border-emerald-600 font-bold shadow-sm'
                : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/70 border-emerald-900/60'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>SUCCESS</span>
            <span className="px-1 py-0.1 rounded text-[10px] bg-emerald-900/80 text-emerald-200">
              {facets.counts.SUCCESS || 0}
            </span>
          </button>

          <button
            onClick={() => setSeverityFilter('WARNING')}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-all flex items-center gap-1 border ${
              severityFilter === 'WARNING'
                ? 'bg-amber-950 text-amber-200 border-amber-600 font-bold shadow-sm'
                : 'bg-amber-950/40 text-amber-400 hover:bg-amber-950/70 border-amber-900/60'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>WARN</span>
            <span className="px-1 py-0.1 rounded text-[10px] bg-amber-900/80 text-amber-200">
              {facets.counts.WARNING || 0}
            </span>
          </button>

          <button
            onClick={() => setSeverityFilter('ERROR')}
            className={`px-2 py-0.5 rounded text-xs font-mono transition-all flex items-center gap-1 border ${
              severityFilter === 'ERROR'
                ? 'bg-rose-950 text-rose-200 border-rose-600 font-bold shadow-sm'
                : 'bg-rose-950/40 text-rose-400 hover:bg-rose-950/70 border-rose-900/60'
            }`}
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>ERR</span>
            <span className="px-1 py-0.1 rounded text-[10px] bg-rose-900/80 text-rose-200">
              {facets.counts.ERROR || 0}
            </span>
          </button>
        </div>

        {/* Dropdowns, Search Box & Ledger Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Model Filter Dropdown */}
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-indigo-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500 max-w-[140px]"
          >
            <option value="ALL">All Models ({facets.models?.length || 0})</option>
            {facets.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Category Filter Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-purple-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-purple-500 max-w-[140px]"
          >
            <option value="ALL">All Categories ({facets.categories?.length || 0})</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search action, details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 sm:w-56 bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs rounded pl-7 pr-6 py-1 focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 text-slate-400 hover:text-white"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Optional Project Blueprint Ledger Button */}
          {sourceType === 'project' && selectedProjectObj?.has_ledger && (
            <button
              onClick={() => handleOpenLedger(selectedProjectObj.name)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-xs font-semibold text-emerald-300 shadow-sm transition-colors"
            >
              <span>📐 Blueprint Ledger</span>
            </button>
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. HIGH-CLARITY MONOSPACE LOG TABLE */}
      {/* ==================================================================== */}
      <main
        ref={logContainerRef}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs select-text space-y-0.5 bg-slate-950"
      >
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 font-sans">
            <ScrollText className="w-12 h-12 text-slate-600 animate-pulse" />
            <p className="text-sm font-medium">No log entries matched current criteria</p>
            <p className="text-xs text-slate-600 max-w-sm text-center">
              Try adjusting the severity filter, search term, or select a different stream from the top navigation bar.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const isSelected = inspectedEntry?.id === entry.id;
            const detailsStr = entry.details ? JSON.stringify(entry.details) : '';

            return (
              <div
                key={entry.id}
                onClick={() => {
                  setInspectedEntry(isSelected ? null : entry);
                  setIsInspectorMinimized(false);
                }}
                className={`group flex items-baseline gap-2 py-1 px-2 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-slate-800/90 border-l-2 border-cyan-400'
                    : 'hover:bg-slate-900/90 border-l-2 border-transparent'
                }`}
              >
                {/* Line ID */}
                <span className="text-slate-600 text-[10px] w-9 shrink-0 text-right font-mono">
                  #{entry.id}
                </span>

                {/* Timestamp */}
                <span className="text-slate-400 text-[11px] shrink-0 whitespace-nowrap">
                  {entry.timestamp}
                </span>

                {/* Severity Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold border uppercase shrink-0 ${getSeverityBadgeClass(
                    entry.severity
                  )}`}
                >
                  {getSeverityIcon(entry.severity)}
                  {entry.severity}
                </span>

                {/* Model Chip */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (entry.model && entry.model !== 'UNKNOWN') setModelFilter(entry.model);
                  }}
                  className="px-1.5 py-0.2 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-300 hover:border-indigo-500 text-[10px] font-semibold shrink-0 cursor-pointer"
                  title={`Click to filter by model: ${entry.model}`}
                >
                  {entry.model || 'SYSTEM'}
                </span>

                {/* Category Pill */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (entry.category) setCategoryFilter(entry.category);
                  }}
                  className="px-1.5 py-0.2 rounded bg-purple-950/70 border border-purple-800/60 text-purple-300 hover:border-purple-500 text-[10px] font-medium shrink-0 cursor-pointer"
                  title={`Click to filter by category: ${entry.category}`}
                >
                  {entry.category}
                </span>

                {/* Action Badge */}
                <span className="text-cyan-300 font-bold tracking-tight shrink-0">
                  [{entry.action}]
                </span>

                {/* Environment Tag */}
                {entry.env && (
                  <span className="px-1 py-0.1 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] shrink-0">
                    {entry.env}
                  </span>
                )}

                {/* Compact Preview of Details */}
                <span className="text-slate-400 truncate flex-1 font-normal opacity-90 pl-1" title={detailsStr}>
                  {detailsStr !== '{}' ? detailsStr : entry.raw}
                </span>
              </div>
            );
          })
        )}
      </main>

      {/* ==================================================================== */}
      {/* 5. MINIMIZABLE / CLOSABLE JSON PAYLOAD INSPECTOR PANEL */}
      {/* ==================================================================== */}
      {inspectedEntry && (
        <div className="shrink-0 border-t border-cyan-800/50 bg-slate-900/95 shadow-2xl backdrop-blur transition-all">
          {isInspectorMinimized ? (
            /* Minimized Sticky Bar */
            <div className="px-4 py-2 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-slate-400">Inspecting:</span>
                <span className="text-cyan-300 font-bold">Line #{inspectedEntry.id}</span>
                <span className="text-slate-200 font-semibold">[{inspectedEntry.action}]</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border uppercase ${getSeverityBadgeClass(inspectedEntry.severity)}`}>
                  {inspectedEntry.severity}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsInspectorMinimized(false)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200"
                >
                  <Maximize2 className="w-3 h-3 text-cyan-400" />
                  <span>Maximize ▴</span>
                </button>
                <button
                  onClick={() => setInspectedEntry(null)}
                  className="p-1 text-slate-400 hover:text-white"
                  title="Close Inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Full Expanded Inspector Drawer */
            <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-400">Inspect Entry:</span>
                  <span className="text-cyan-400 font-bold">Line #{inspectedEntry.id}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-300">{inspectedEntry.timestamp}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-cyan-300 font-bold">[{inspectedEntry.action}]</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Filter Shortcuts */}
                  {inspectedEntry.model && inspectedEntry.model !== 'UNKNOWN' && (
                    <button
                      onClick={() => setModelFilter(inspectedEntry.model)}
                      className="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-[11px] text-indigo-300 transition-colors"
                    >
                      Filter Model: {inspectedEntry.model}
                    </button>
                  )}
                  {inspectedEntry.category && (
                    <button
                      onClick={() => setCategoryFilter(inspectedEntry.category)}
                      className="px-2 py-1 rounded bg-purple-950 hover:bg-purple-900 border border-purple-700 text-[11px] text-purple-300 transition-colors"
                    >
                      Filter Category: {inspectedEntry.category}
                    </button>
                  )}

                  {/* Copy JSON */}
                  <button
                    onClick={() => handleCopy(`json_${inspectedEntry.id}`, JSON.stringify(inspectedEntry.details, null, 2))}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 transition-colors"
                  >
                    {copiedKey === `json_${inspectedEntry.id}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400" />
                    )}
                    {copiedKey === `json_${inspectedEntry.id}` ? 'Copied JSON!' : 'Copy JSON'}
                  </button>

                  {/* Copy Raw Line */}
                  <button
                    onClick={() => handleCopy(`raw_${inspectedEntry.id}`, inspectedEntry.raw)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 transition-colors"
                  >
                    {copiedKey === `raw_${inspectedEntry.id}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400" />
                    )}
                    {copiedKey === `raw_${inspectedEntry.id}` ? 'Copied Line!' : 'Copy Raw Line'}
                  </button>

                  {/* Minimize */}
                  <button
                    onClick={() => setIsInspectorMinimized(true)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    title="Minimize Inspector Panel"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Close */}
                  <button
                    onClick={() => setInspectedEntry(null)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                    title="Close Inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Formatted JSON Payload */}
              {inspectedEntry.details && Object.keys(inspectedEntry.details).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-cyan-400" /> Structured Details Payload
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 text-[11px] font-mono overflow-x-auto leading-relaxed shadow-inner max-h-48">
                    {JSON.stringify(inspectedEntry.details, null, 2)}
                  </pre>
                </div>
              )}

              {/* Raw Unparsed Log Line */}
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-400" /> Raw Log String
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-[11px] font-mono break-all leading-relaxed">
                  {inspectedEntry.raw}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. BOTTOM TELEMETRY STRIP */}
      {/* ==================================================================== */}
      <footer className="shrink-0 px-4 py-1.5 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span>Stream: <strong className="text-cyan-400">{sourceType.toUpperCase()}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Target: <strong className="text-slate-300">{sourceName || 'master_timeline.log'}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Loaded: <strong className="text-indigo-400">{entries.length}</strong> / {totalMatched}</span>
        </div>

        <div className="flex items-center gap-3">
          {newLinesCount > 0 && (
            <span
              onClick={() => setNewLinesCount(0)}
              className="cursor-pointer text-emerald-400 font-bold hover:underline"
              title="Click to reset counter"
            >
              +{newLinesCount} new entries
            </span>
          )}
          <span>{lastPulse ? `Last pulse: ${lastPulse.toLocaleTimeString()}` : 'Idle'}</span>
        </div>
      </footer>

      {/* ==================================================================== */}
      {/* 7. BLUEPRINT LEDGER MODAL */}
      {/* ==================================================================== */}
      {isLedgerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">
                  Blueprint Ledger: {selectedProjectObj?.name}
                </h3>
              </div>
              <button
                onClick={() => setIsLedgerOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
              {ledgerLoading ? (
                <div className="py-10 text-center text-slate-400">Loading ledger...</div>
              ) : ledgerData ? (
                <>
                  {ledgerData.architecture_blueprint && (
                    <div>
                      <h4 className="font-sans font-semibold text-slate-200 mb-2">Architecture Blueprint Map</h4>
                      <pre className="p-3 rounded bg-slate-950 border border-slate-800 text-cyan-300 overflow-x-auto text-[11px]">
                        {JSON.stringify(ledgerData.architecture_blueprint, null, 2)}
                      </pre>
                    </div>
                  )}

                  {ledgerData.file_history && (
                    <div>
                      <h4 className="font-sans font-semibold text-slate-200 mb-2">File Modification History</h4>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {ledgerData.file_history.map((fh, idx) => (
                          <div key={idx} className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[11px]">
                            <span className="text-emerald-400">{fh.file}</span>
                            <span className="text-slate-400">{fh.action}</span>
                            <span className="text-slate-500 text-[10px]">{fh.timestamp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-10 text-center text-slate-400">No blueprint ledger recorded for this workspace yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogCenter;
