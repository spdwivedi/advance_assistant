import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import {
  Sparkles,
  Terminal,
  Key,
  Lock,
  Unlock,
  Pause,
  Play,
  Square,
  FileText,
  Activity,
  AlertCircle
} from 'lucide-react';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Master Execution Studio',
    subtitle: 'Quick direct launch, iterative blueprint dry-run, and live workspace code inspector',
  },
  '/swarm': {
    title: 'Real-Time Swarm Monitor',
    subtitle: 'Live worker status, task queues, and concurrent domain locks',
  },
  '/agents': {
    title: 'Autonomous Agent Hub',
    subtitle: 'Sub-agent configuration, specialized roles, and dynamic capability bounds',
  },
  '/knowledge': {
    title: 'Knowledge Base Explorer',
    subtitle: '20 Unified Topic Books across technical categories with snippet context simulator',
  },
  '/governor': {
    title: 'Token Governor & Quota Telemetry',
    subtitle: 'Live provider-tier-model quotas, RPM/TPM monitors, and cloud cost estimations',
  },
  '/keys': {
    title: 'Multi-Provider Key Manager',
    subtitle: 'Google & Groq API key matrix, health validation, and adaptive routing policies',
  },
  '/logs': {
    title: 'Dedicated Global Log Center',
    subtitle: 'Real-time dual WebSocket log streams, severity filters, and master timeline query',
  },
  '/tools': {
    title: 'Tool Bridges & System Diagnostics',
    subtitle: 'External IDE bridge status (Aider, RooCode, n8n), VRAM arbitrator, and local models',
  },
};

interface ExecutionState {
  is_running?: boolean;
  is_paused?: boolean;
  status?: string;
  current_phase?: string;
  project_name?: string;
}

export const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Global Top Control Bar states
  const [routingPolicy, setRoutingPolicy] = useState<string>('GLOBAL_HYBRID');
  const [paidLocked, setPaidLocked] = useState<boolean>(false);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [policyLoading, setPolicyLoading] = useState<boolean>(false);
  const [shieldLoading, setShieldLoading] = useState<boolean>(false);
  const [lifecycleLoading, setLifecycleLoading] = useState<boolean>(false);

  const currentMeta = PAGE_TITLES[location.pathname] || {
    title: 'Advance Assistant OS',
    subtitle: 'Adaptive Autonomous Development Operating Engine v6.0',
  };

  // Fetch telemetry & states for the global control bar
  const fetchGlobalControls = useCallback(async () => {
    try {
      const [healthRes, hierRes, policyRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/governor/hierarchy'),
        fetch('/api/keys/policy')
      ]);

      if (healthRes.ok) {
        const hData = await healthRes.json();
        if (hData.execution_state) {
          setExecutionState(hData.execution_state);
        }
      }

      if (hierRes.ok) {
        const hierData = await hierRes.json();
        if (hierData.financial_shield) {
          setPaidLocked(Boolean(hierData.financial_shield.paid_tier_locked));
        }
      }

      if (policyRes.ok) {
        const pData = await policyRes.json();
        if (pData.routing_policy) {
          setRoutingPolicy(pData.routing_policy);
        }
      }
    } catch {
      // Background poll silently handles network glitches
    }
  }, []);

  useEffect(() => {
    fetchGlobalControls();
    const interval = setInterval(fetchGlobalControls, 5000);
    return () => clearInterval(interval);
  }, [fetchGlobalControls]);

  // Dispatch Key Policy change
  const handlePolicyChange = async (newPolicy: string) => {
    setPolicyLoading(true);
    try {
      const res = await fetch('/api/keys/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: newPolicy })
      });
      if (res.ok) {
        const data = await res.json();
        setRoutingPolicy(data.policy || newPolicy);
      }
    } catch (err) {
      console.error('Failed to change key policy:', err);
    } finally {
      setPolicyLoading(false);
    }
  };

  // Toggle 1-Click Paid Tier Lock
  const handleTogglePaidLock = async () => {
    setShieldLoading(true);
    try {
      const nextState = !paidLocked;
      const res = await fetch('/api/governor/shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid_tier_locked: nextState })
      });
      if (res.ok) {
        setPaidLocked(nextState);
      }
    } catch (err) {
      console.error('Failed to toggle paid lock shield:', err);
    } finally {
      setShieldLoading(false);
    }
  };

  // Pause or Resume active build
  const handleTogglePause = async () => {
    setLifecycleLoading(true);
    try {
      const res = await fetch('/api/execute/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        await fetchGlobalControls();
      }
    } catch (err) {
      console.error('Failed to toggle build pause:', err);
    } finally {
      setLifecycleLoading(false);
    }
  };

  // Stop active build immediately
  const handleStopBuild = async () => {
    setLifecycleLoading(true);
    try {
      const res = await fetch('/api/execute/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        await fetchGlobalControls();
      }
    } catch (err) {
      console.error('Failed to stop build:', err);
    } finally {
      setLifecycleLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Collapsible Sidebar */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          collapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {/* Global Sticky Top Header */}
        <header className="sticky top-0 z-30 min-h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-black/20">
          {/* Left: Dynamic Page Title & Subtitle */}
          <div className="min-w-0 pr-2">
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>{currentMeta.title}</span>
            </h1>
            <p className="text-xs text-slate-400 truncate max-w-md sm:max-w-lg lg:max-w-xl">
              {currentMeta.subtitle}
            </p>
          </div>

          {/* Right: Global Top Control Bar */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* 1. Key Policy Quick-Select Dropdown */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-xs shadow-inner">
              <Key className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <select
                id="global-key-policy-select"
                aria-label="Global Key Policy"
                value={routingPolicy}
                disabled={policyLoading}
                onChange={(e) => handlePolicyChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
                title="Active API Key Routing Policy"
              >
                <option value="GLOBAL_HYBRID" className="bg-slate-900 text-slate-200">
                  Global Hybrid
                </option>
                <option value="FREE_POOL" className="bg-slate-900 text-slate-200">
                  Free Pool Only
                </option>
                <option value="PAID_POOL" className="bg-slate-900 text-slate-200">
                  Paid Pool Only
                </option>
                <option value="SINGLE_PINNED" className="bg-slate-900 text-slate-200">
                  Single Pinned
                </option>
              </select>
            </div>

            {/* 2. 1-Click Paid Tier Spend Lock Pill */}
            <button
              id="global-paid-lock-pill"
              onClick={handleTogglePaidLock}
              disabled={shieldLoading}
              title={
                paidLocked
                  ? 'Paid Tier Locked: Strictly zero paid cloud overage allowed'
                  : 'Paid Tier Unlocked: Paid cloud models permitted within strict financial caps'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all duration-150 ${
                paidLocked
                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60 shadow-sm shadow-emerald-900/30'
                  : 'bg-amber-950/70 border-amber-700/60 text-amber-300 hover:bg-amber-900/60 shadow-sm shadow-amber-900/30'
              } ${shieldLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
            >
              {paidLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-mono">🔒 Paid Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-mono">🔓 Paid Unlocked</span>
                </>
              )}
            </button>

            {/* 3. Global Build Status & Emergency Lifecycle Controls */}
            {isBuildActive && (
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950/80 border border-slate-700/70 shadow-sm">
                {/* Live Status Pill */}
                {isPaused ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium animate-pulse">
                    <Activity className="w-3 h-3 text-amber-400" />
                    <span>⏸️ Paused</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>🟢 Running</span>
                  </span>
                )}

                {/* Pause / Resume Button */}
                <button
                  id="global-pause-resume-btn"
                  onClick={handleTogglePause}
                  disabled={lifecycleLoading}
                  title={isPaused ? 'Resume active build execution' : 'Pause active build execution'}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all active:scale-95"
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>Pause</span>
                    </>
                  )}
                </button>

                {/* Stop Button */}
                <button
                  id="global-stop-btn"
                  onClick={handleStopBuild}
                  disabled={lifecycleLoading}
                  title="Immediately cancel active build and clear domain locks"
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-xs font-semibold transition-all active:scale-95 shadow-sm shadow-rose-950/40"
                >
                  <Square className="w-3 h-3 fill-rose-400 text-rose-400 shrink-0" />
                  <span>Stop</span>
                </button>
              </div>
            )}

            {/* 4. Quick Log Center Shortcut Button */}
            <button
              id="global-logs-shortcut-btn"
              onClick={() => navigate('/logs')}
              title="Jump to Dedicated Full-Screen Log Center"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 text-xs font-semibold text-blue-300 transition-all active:scale-95 shadow-sm shadow-blue-950/30"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>📜 Global Logs</span>
            </button>

            {/* Host / Version badge */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-800/50 text-[11px] font-semibold text-indigo-300">
              <Sparkles className="w-3 h-3 text-indigo-400 animate-spin" />
              <span>v6.0 Hybrid</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Footer Bar */}
        <footer className="py-3 px-6 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-between">
          <div>Advance Assistant Autonomous OS v6.0 &copy; 2026 DeepMind Pair Programming</div>
          <div className="font-mono text-slate-400">WSL2 / Windows Bridge Mode</div>
        </footer>
      </div>
    </div>
  );
};
