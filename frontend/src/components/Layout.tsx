import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Sparkles, Terminal, Bell } from 'lucide-react';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Master Execution Studio',
    subtitle: 'Workspace target selection, dual-model configuration, and pipeline launcher',
  },
  '/swarm': {
    title: 'Real-Time Swarm Monitor',
    subtitle: 'Live worker status, task queues, and concurrent domain locks',
  },
  '/knowledge': {
    title: 'Knowledge Base Explorer',
    subtitle: '19 Unified Topic Books across 9 technical categories with live defragmentation',
  },
  '/governor': {
    title: 'Token Governor & Quota Telemetry',
    subtitle: 'Live RPM/TPM/RPD gauges, financial rate limit shields, and model allocations',
  },
  '/tools': {
    title: 'Tool Bridges & System Logs',
    subtitle: 'External bridge status (Aider, RooCode, n8n) and operational audit logs',
  },
};

export const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const location = useLocation();

  const currentMeta = PAGE_TITLES[location.pathname] || {
    title: 'Advance Assistant OS',
    subtitle: 'Adaptive Autonomous Development Operating Engine v6.0',
  };

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
        {/* Top Operational Header */}
        <header className="sticky top-0 z-30 h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-6 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>{currentMeta.title}</span>
            </h1>
            <p className="text-xs text-slate-400 truncate max-w-xl">
              {currentMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs font-mono text-slate-300">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span>Host: 0.0.0.0:8000</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/50 text-xs font-semibold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              <span>v6.0 Hybrid</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
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
