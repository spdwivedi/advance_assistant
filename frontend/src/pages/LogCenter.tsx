import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Minimize2
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
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
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
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
  }, [sourceType, sources]);

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
          // If we had no entries, seed them; otherwise preserve current query view
          setLastPulse(new Date());
        } else if (frame.type === 'new_entries') {
          setLastPulse(new Date());
          if (frame.entries && frame.entries.length > 0) {
            setEntries((prev) => {
              // Apply local filters before appending if necessary
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
      {/* 1. TOP HEADER & TELEMETRY STRIP */}
      {/* ==================================================================== */}
      <header className="shrink-0 px-5 py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-glow-sm shrink-0">
            <ScrollText className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Log Center
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  v6.0 Telemetry
                </span>
              </h1>
              {/* Live Tail Pulse Badge */}
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-medium border ${
                  isLiveTail && wsConnected
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60 shadow-glow-emerald'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
                title={lastPulse ? `Last pulse: ${lastPulse.toLocaleTimeString()}` : 'WebSocket idle'}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLiveTail && wsConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                  }`}
                />
                <span>{isLiveTail && wsConnected ? 'LIVE TAIL ACTIVE' : 'LIVE TAIL PAUSED'}</span>
              </div>

              {/* Incremental New Lines Badge */}
              {newLinesCount > 0 && (
                <button
                  onClick={() => setNewLinesCount(0)}
                  className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-900/90 text-blue-300 border border-blue-700 hover:bg-blue-800 transition-colors animate-pulse"
                  title="Click to reset counter"
                >
                  +{newLinesCount} new
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{activeSourceMeta.label}</span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-[11px] text-cyan-400">{resolvedPath || activeSourceMeta.path}</span>
              {activeSourceMeta.size > 0 && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="font-mono text-slate-300">{formatBytes(activeSourceMeta.size)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Live Tail Toggle Button */}
          <button
            onClick={() => setIsLiveTail(!isLiveTail)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isLiveTail
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900/80'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700/80'
            }`}
          >
            {isLiveTail ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-slate-400" />}
            {isLiveTail ? 'Pause Tail' : 'Resume Tail'}
          </button>

          {/* Follow Bottom Toggle */}
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/70 text-xs text-slate-300 cursor-pointer hover:bg-slate-800 transition-colors">
            <input
              type="checkbox"
              checked={followBottom}
              onChange={(e) => setFollowBottom(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className="flex items-center gap-1">
              <ArrowDownCircle className="w-3.5 h-3.5 text-cyan-400" /> Auto-Scroll
            </span>
          </label>

          {/* Refresh Button */}
          <button
            onClick={() => fetchLogs()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            title="Manual query refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center rounded-lg bg-slate-800/80 border border-slate-700 overflow-hidden text-xs">
            <button
              onClick={handleExportJson}
              className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/80 transition-colors flex items-center gap-1"
              title="Download currently filtered entries as JSON"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" /> JSON
            </button>
            <span className="w-px h-4 bg-slate-700" />
            <button
              onClick={handleExportRaw}
              className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/80 transition-colors flex items-center gap-1"
              title="Download raw lines as .log"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" /> RAW
            </button>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. 6-STREAM LOG SOURCE SWITCHER BAR */}
      {/* ==================================================================== */}
      <section className="shrink-0 px-5 py-2.5 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Stream Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-400" /> Streams:
          </span>

          {/* 1. Master Stream */}
          <button
            onClick={() => setSourceType('master')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceType === 'master'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-glow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-blue-300" />
            Master Timeline
            {sources?.master?.exists && (
              <span className="ml-1 text-[10px] font-mono px-1 py-0.2 rounded bg-black/30 text-blue-200">
                {formatBytes(sources.master.size_bytes)}
              </span>
            )}
          </button>

          {/* 2. Daily IST Stream */}
          <button
            onClick={() => setSourceType('daily')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceType === 'daily'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-glow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-cyan-300" />
            Daily IST Logs
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-cyan-200">
              {sources?.daily_logs?.length || 0}
            </span>
          </button>

          {/* 3. Category Stream */}
          <button
            onClick={() => setSourceType('category')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceType === 'category'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-glow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-purple-300" />
            Categories
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-purple-200">
              {Object.keys(sources?.categories || {}).length}
            </span>
          </button>

          {/* 4. Model Stream */}
          <button
            onClick={() => setSourceType('model')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceType === 'model'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-glow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-amber-300" />
            Models
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-amber-200">
              {sources?.models?.length || 0}
            </span>
          </button>

          {/* 5. Project Stream */}
          <button
            onClick={() => setSourceType('project')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceType === 'project'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-glow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5 text-emerald-300" />
            Projects
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-emerald-200">
              {sources?.projects?.length || 0}
            </span>
          </button>

          {/* 6. Test Stream */}
          <button
            onClick={() => setSourceType('test')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sourceType === 'test'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-glow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            <TestTube className="w-3.5 h-3.5 text-rose-300" />
            Test Mirrors
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-rose-200">
              {sources?.test_logs?.length || 0}
            </span>
          </button>
        </div>

        {/* Secondary Sub-Source Dropdown Selectors */}
        <div className="flex items-center gap-2">
          {sourceType === 'daily' && sources?.daily_logs && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400">Date:</span>
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-cyan-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-cyan-500"
              >
                {sources.daily_logs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name.replace('.log', '')} ({formatBytes(d.size_bytes)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceType === 'category' && sources?.categories && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Domain:</span>
              <select
                value={selectedCategoryDomain}
                onChange={(e) => {
                  setSelectedCategoryDomain(e.target.value);
                  const actions = sources.categories[e.target.value] || [];
                  if (actions.length > 0) {
                    setSourceName(`${e.target.value}/${actions[0].name}`);
                  }
                }}
                className="bg-slate-800 border border-slate-700 text-purple-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-purple-500"
              >
                {Object.keys(sources.categories).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.toUpperCase()} ({sources.categories[cat]?.length || 0} actions)
                  </option>
                ))}
              </select>

              <span className="text-slate-400">Action:</span>
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-purple-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-purple-500 max-w-[200px]"
              >
                {(sources.categories[selectedCategoryDomain] || []).map((af) => (
                  <option key={af.name} value={`${selectedCategoryDomain}/${af.name}`}>
                    {af.action} ({formatBytes(af.size_bytes)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceType === 'model' && sources?.models && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400">Model File:</span>
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-amber-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-amber-500 max-w-[240px]"
              >
                {sources.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.model} ({formatBytes(m.size_bytes)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceType === 'project' && sources?.projects && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Workspace:</span>
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-emerald-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-emerald-500"
              >
                {sources.projects.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({formatBytes(p.trace_size)})
                  </option>
                ))}
              </select>

              {/* View Blueprint Ledger Button */}
              {selectedProjectObj?.has_ledger && (
                <button
                  onClick={() => handleOpenLedger(selectedProjectObj.name)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900 transition-colors text-xs font-semibold"
                >
                  <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  Blueprint Ledger
                </button>
              )}
            </div>
          )}

          {sourceType === 'test' && sources?.test_logs && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400">Test Script:</span>
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-rose-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-rose-500 max-w-[240px]"
              >
                {sources.test_logs.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.test_name} ({formatBytes(t.size_bytes)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. MULTI-DIMENSIONAL FILTER BAR & FACET COUNTERS */}
      {/* ==================================================================== */}
      <section className="shrink-0 px-5 py-2.5 bg-slate-900/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        {/* Severity Filter Pills with Live Facet Counts */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Severity:
          </span>

          {/* ALL */}
          <button
            onClick={() => setSeverityFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
              severityFilter === 'ALL'
                ? 'bg-slate-700 text-white border border-slate-600 font-bold shadow-sm'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>ALL</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900 text-slate-300">
              {totalMatched}
            </span>
          </button>

          {/* INFO */}
          <button
            onClick={() => setSeverityFilter('INFO')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border ${
              severityFilter === 'INFO'
                ? 'bg-blue-950 text-blue-200 border-blue-600 font-bold shadow-sm'
                : 'bg-blue-950/40 text-blue-400 hover:bg-blue-950/70 border-blue-900/60'
            }`}
          >
            <Info className="w-3 h-3 text-blue-400" />
            <span>INFO</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-900/80 text-blue-200">
              {facets.counts.INFO || 0}
            </span>
          </button>

          {/* SUCCESS */}
          <button
            onClick={() => setSeverityFilter('SUCCESS')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border ${
              severityFilter === 'SUCCESS'
                ? 'bg-emerald-950 text-emerald-200 border-emerald-600 font-bold shadow-sm'
                : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/70 border-emerald-900/60'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>SUCCESS</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-900/80 text-emerald-200">
              {facets.counts.SUCCESS || 0}
            </span>
          </button>

          {/* WARNING */}
          <button
            onClick={() => setSeverityFilter('WARNING')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border ${
              severityFilter === 'WARNING'
                ? 'bg-amber-950 text-amber-200 border-amber-600 font-bold shadow-sm'
                : 'bg-amber-950/40 text-amber-400 hover:bg-amber-950/70 border-amber-900/60'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>WARNING</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-900/80 text-amber-200">
              {facets.counts.WARNING || 0}
            </span>
          </button>

          {/* ERROR */}
          <button
            onClick={() => setSeverityFilter('ERROR')}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border ${
              severityFilter === 'ERROR'
                ? 'bg-rose-950 text-rose-200 border-rose-600 font-bold shadow-sm'
                : 'bg-rose-950/40 text-rose-400 hover:bg-rose-950/70 border-rose-900/60'
            }`}
          >
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>ERROR</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-900/80 text-rose-200">
              {facets.counts.ERROR || 0}
            </span>
          </button>
        </div>

        {/* Dynamic Dropdowns & Search */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Model Facet Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400">Model:</span>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-indigo-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500 max-w-[160px]"
            >
              <option value="ALL">All Models ({facets.models?.length || 0})</option>
              {facets.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Category Facet Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-purple-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-purple-500 max-w-[150px]"
            >
              <option value="ALL">All Categories ({facets.categories?.length || 0})</option>
              {facets.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box with Clear Button */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search action, model, details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 bg-slate-800/90 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs rounded-lg pl-8 pr-7 py-1 focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-white"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tail Limit Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400">Limit:</span>
            <select
              value={tailLimit}
              onChange={(e) => setTailLimit(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value={100}>100 lines</option>
              <option value={300}>300 lines</option>
              <option value={500}>500 lines</option>
              <option value={1000}>1000 lines</option>
              <option value={2000}>2000 lines</option>
            </select>
          </div>

          {/* Chronological vs Tail Order Toggle */}
          <button
            onClick={() => setIsTailMode(!isTailMode)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors"
            title={isTailMode ? 'Viewing latest lines at bottom' : 'Viewing oldest lines first'}
          >
            {isTailMode ? 'Tail (Latest)' : 'Head (Oldest)'}
          </button>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 4. ERROR NOTICE IF LOG STREAM CANNOT BE LOADED */}
      {/* ==================================================================== */}
      {errorMsg && (
        <div className="shrink-0 mx-5 mt-3 p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => fetchLogs()}
            className="px-2 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-100 rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. INTERACTIVE MONOSPACE LOG STREAM VIEWER */}
      {/* ==================================================================== */}
      <main
        ref={logContainerRef}
        className="flex-1 overflow-y-auto px-5 py-3 font-mono text-xs select-text space-y-1"
      >
        {isLoading && entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-sm font-sans font-medium">Querying structured log records...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-3">
            <Terminal className="w-10 h-10 text-slate-600" />
            <p className="text-sm font-sans font-medium text-slate-400">No log entries matched your filter parameters.</p>
            <p className="text-xs font-mono text-slate-600">Resolved Path: {resolvedPath || 'None'}</p>
            {(severityFilter !== 'ALL' || modelFilter !== 'ALL' || categoryFilter !== 'ALL' || searchQuery) && (
              <button
                onClick={() => {
                  setSeverityFilter('ALL');
                  setModelFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearchQuery('');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-sans text-xs border border-slate-700"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          entries.map((entry) => {
            const isExpanded = expandedRowId === entry.id;
            const detailsStr = JSON.stringify(entry.details || {});
            const hasDetails = Object.keys(entry.details || {}).length > 0;

            return (
              <div
                key={entry.id}
                className={`rounded-lg border transition-all ${
                  isExpanded
                    ? 'bg-slate-900 border-cyan-700/80 shadow-md ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700'
                }`}
              >
                {/* Primary Log Line Row */}
                <div
                  onClick={() => setExpandedRowId(isExpanded ? null : entry.id)}
                  className="flex items-start gap-2.5 px-3 py-2 cursor-pointer select-none text-[11px] leading-relaxed"
                >
                  {/* Expand Chevron */}
                  <span className="text-slate-500 pt-0.5 shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 hover:text-slate-300" />
                    )}
                  </span>

                  {/* ID */}
                  <span className="text-slate-600 w-10 shrink-0 text-right font-mono" title={`Line #${entry.id}`}>
                    #{entry.id}
                  </span>

                  {/* Timestamp */}
                  <span className="text-slate-400 shrink-0 w-36 truncate" title={entry.timestamp}>
                    {entry.timestamp}
                  </span>

                  {/* Severity Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${getSeverityBadgeClass(
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
                    className="px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-300 hover:border-indigo-500 text-[10px] font-semibold shrink-0 cursor-pointer"
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
                    className="px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/60 text-purple-300 hover:border-purple-500 text-[10px] font-medium shrink-0 cursor-pointer"
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
                    <span className="px-1 py-0.2 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] shrink-0">
                      {entry.env}
                    </span>
                  )}

                  {/* Compact Preview of Details */}
                  <span className="text-slate-400 truncate flex-1 font-normal opacity-90 pl-1" title={detailsStr}>
                    {detailsStr !== '{}' ? detailsStr : entry.raw}
                  </span>
                </div>

                {/* Expanded Structured JSON Inspector Drawer */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-800/80 bg-slate-950/70 rounded-b-lg space-y-3">
                    {/* Action Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-b border-slate-800/60 pb-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Inspect Entry:</span>
                        <span className="text-cyan-400 font-bold">Line #{entry.id}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-300">{entry.timestamp}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Filter Shortcuts */}
                        {entry.model && entry.model !== 'UNKNOWN' && (
                          <button
                            onClick={() => setModelFilter(entry.model)}
                            className="px-2 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-[11px] text-indigo-300 transition-colors"
                          >
                            Filter Model: {entry.model}
                          </button>
                        )}
                        {entry.category && (
                          <button
                            onClick={() => setCategoryFilter(entry.category)}
                            className="px-2 py-1 rounded bg-purple-950 hover:bg-purple-900 border border-purple-700 text-[11px] text-purple-300 transition-colors"
                          >
                            Filter Category: {entry.category}
                          </button>
                        )}

                        {/* Copy JSON */}
                        <button
                          onClick={() => handleCopy(`json_${entry.id}`, JSON.stringify(entry.details, null, 2))}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 transition-colors"
                        >
                          {copiedKey === `json_${entry.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400" />
                          )}
                          {copiedKey === `json_${entry.id}` ? 'Copied JSON!' : 'Copy JSON'}
                        </button>

                        {/* Copy Raw Line */}
                        <button
                          onClick={() => handleCopy(`raw_${entry.id}`, entry.raw)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 transition-colors"
                        >
                          {copiedKey === `raw_${entry.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400" />
                          )}
                          {copiedKey === `raw_${entry.id}` ? 'Copied Line!' : 'Copy Raw Line'}
                        </button>
                      </div>
                    </div>

                    {/* Formatted JSON Payload */}
                    {hasDetails && (
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                          <Terminal className="w-3 h-3 text-cyan-400" /> Structured Details Payload
                        </div>
                        <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-cyan-300 text-[11px] overflow-x-auto leading-relaxed shadow-inner">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Raw Unparsed Log Line */}
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                        <FileText className="w-3 h-3 text-slate-400" /> Raw Log String
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 text-[11px] break-all leading-relaxed">
                        {entry.raw}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      {/* ==================================================================== */}
      {/* 6. BOTTOM STATUS BAR & TELEMETRY */}
      {/* ==================================================================== */}
      <footer className="shrink-0 px-5 py-2 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span>Stream: <strong className="text-cyan-400">{sourceType.toUpperCase()}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Target: <strong className="text-slate-300">{sourceName || 'master_timeline.log'}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Showing: <strong className="text-emerald-400">{entries.length}</strong> / {totalMatched} matched lines</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            <span className="text-[11px] text-slate-400">
              {wsConnected ? 'WebSocket Live Tail Streaming' : 'Polling / Query Mode'}
            </span>
          </div>
          {lastPulse && (
            <span className="text-[11px] text-slate-500">
              Pulse: {lastPulse.toLocaleTimeString()}
            </span>
          )}
        </div>
      </footer>

      {/* ==================================================================== */}
      {/* 7. PROJECT BLUEPRINT LEDGER MODAL / DRAWER */}
      {/* ==================================================================== */}
      {isLedgerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden font-sans">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-950 border border-emerald-700/80 flex items-center justify-center text-emerald-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Project Blueprint Ledger
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {sourceName}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Created: {ledgerData?.created_at || 'N/A'} • Modified: {ledgerData?.last_modified || 'N/A'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsLedgerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-sans">
              {ledgerLoading ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-2 text-slate-400">
                  <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                  <p>Loading project blueprint ledger...</p>
                </div>
              ) : !ledgerData ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-sm font-medium text-slate-400">No blueprint ledger recorded for this project.</p>
                </div>
              ) : (
                <>
                  {/* Architecture Blueprint Mapping */}
                  <div>
                    <h4 className="text-xs uppercase font-bold tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                      <FolderGit2 className="w-4 h-4 text-emerald-400" /> Current Architectural Blueprint & File Targets
                    </h4>

                    {Object.keys(ledgerData.architecture_blueprint || {}).length === 0 ? (
                      <p className="text-slate-500 italic">No files registered in architectural blueprint.</p>
                    ) : (
                      <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/80 bg-slate-950/60 font-mono text-[11px]">
                        {Object.entries(ledgerData.architecture_blueprint || {}).map(([filepath, meta]) => (
                          <div key={filepath} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-slate-900/60">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="text-emerald-300 font-bold truncate">{filepath}</div>
                              <div className="text-slate-400 font-sans text-xs">{meta.associated_task}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  meta.last_action.includes('SUCCESS')
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                    : meta.last_action.includes('FAILED')
                                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                                    : 'bg-blue-950 text-blue-300 border-blue-800'
                                }`}
                              >
                                {meta.last_action}
                              </span>
                              <span className="text-slate-500 text-[10px]">{meta.timestamp}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* File History Stream */}
                  <div>
                    <h4 className="text-xs uppercase font-bold tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-cyan-400" /> Sequential File History Trace
                    </h4>

                    {(!ledgerData.file_history || ledgerData.file_history.length === 0) ? (
                      <p className="text-slate-500 italic">No historical modifications recorded.</p>
                    ) : (
                      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60 font-mono text-[11px]">
                        <table className="w-full text-left">
                          <thead className="bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                            <tr>
                              <th className="p-2.5">Time</th>
                              <th className="p-2.5">File</th>
                              <th className="p-2.5">Action</th>
                              <th className="p-2.5">Associated Task</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {ledgerData.file_history.map((hist, idx) => (
                              <tr key={idx} className="hover:bg-slate-900/60">
                                <td className="p-2.5 text-slate-500 whitespace-nowrap">{hist.timestamp}</td>
                                <td className="p-2.5 text-cyan-300 font-semibold truncate max-w-[200px]">{hist.file}</td>
                                <td className="p-2.5">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                    {hist.action}
                                  </span>
                                </td>
                                <td className="p-2.5 text-slate-400 font-sans text-xs truncate max-w-[300px]">
                                  {hist.task}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end">
              <button
                onClick={() => setIsLedgerOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogCenter;
