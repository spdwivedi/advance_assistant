import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ScrollText,
  Rocket,
  Activity,
  BookOpen,
  Gauge,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Zap,
  Server,
  ShieldCheck,
  Key,
  Bot
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface HealthData {
  status: string;
  orchestrator_model?: string;
  worker_model?: string;
  key_pool?: {
    total_keys: number;
    active_keys: number;
    selected_keys?: number;
    exhausted_keys: number;
    active_tier_mode: string;
    routing_policy?: string;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
          setIsOnline(data.status === 'healthy' || data.status === 'ok');
        } else {
          setIsOnline(false);
        }
      } catch (err) {
        setIsOnline(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    {
      to: '/',
      label: 'Execution Studio',
      icon: Rocket,
      id: 'nav-execution-studio',
      badge: 'Core'
    },
    {
      to: '/swarm',
      label: 'Live Swarm Monitor',
      icon: Activity,
      id: 'nav-swarm-monitor',
      badge: 'Realtime'
    },
    {
      to: '/agents',
      label: 'Agent Hub',
      icon: Bot,
      id: 'nav-agent-hub',
      badge: 'Matrix'
    },
    {
      to: '/knowledge',
      label: 'Knowledge Base',
      icon: BookOpen,
      id: 'nav-knowledge-base',
      badge: 'Memory'
    },
    {
      to: '/governor',
      label: 'Token Governor',
      icon: Gauge,
      id: 'nav-token-governor',
      badge: 'Quotas'
    },
    {
      to: '/keys',
      label: 'Key Manager',
      icon: Key,
      id: 'nav-key-manager',
      badge: 'Matrix'
    },
    {
      to: '/logs',
      label: 'Log Center',
      icon: ScrollText,
      id: 'nav-log-center',
      badge: 'Live'
    },
    {
      to: '/tools',
      label: 'Tool Bridges & Logs',
      icon: Wrench,
      id: 'nav-tool-bridges',
      badge: 'System'
    },
  ];

  const orchestrator = health?.orchestrator_model || 'qwen2.5-coder:32b';
  const worker = health?.worker_model || 'qwen2.5-coder:7b';

  return (
    <aside
      id="main-sidebar"
      className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out bg-slate-900 border-r border-slate-800 flex flex-col ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-glow-sm shrink-0">
            <Cpu className="w-5 h-5 text-white animate-pulse" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white truncate">
                  Advance Assistant
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-blue-400 bg-blue-950/80 border border-blue-800/60 rounded">
                  v6.0
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-emerald-400 shadow-glow-emerald animate-pulse' : 'bg-rose-500'
                  }`}
                />
                <span className="text-[11px] font-medium text-slate-400">
                  {isOnline ? 'Bridge Connected' : 'Bridge Offline'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          id="sidebar-toggle-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              id={item.id}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/10 text-white border border-blue-500/30 shadow-glow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  {!collapsed && (
                    <span className="truncate flex-1">{item.label}</span>
                  )}
                  {!collapsed && isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-glow-sm shrink-0" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom Model Telemetry Section */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        {!collapsed ? (
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 font-semibold tracking-wider text-[10px] uppercase">
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3 text-indigo-400" /> Dual-Model Engines
              </span>
              <span className="text-emerald-400 font-mono">READY</span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-purple-400" /> Orch
                </span>
                <span className="text-purple-300 font-medium truncate max-w-[120px]" title={orchestrator}>
                  {orchestrator}
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Work
                </span>
                <span className="text-amber-300 font-medium truncate max-w-[120px]" title={worker}>
                  {worker}
                </span>
              </div>

              {/* Cloud Keys Active Indicator */}
              <div className="flex items-center justify-between bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1">
                  <Key className="w-3 h-3 text-cyan-400" /> Keys
                </span>
                <span className="text-cyan-300 font-medium truncate">
                  🔑 {health?.key_pool?.selected_keys ?? health?.key_pool?.active_keys ?? 0}/{health?.key_pool?.total_keys ?? (health?.key_pool?.active_keys ?? 0)} Keys Active
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2 text-slate-400" title={`Orch: ${orchestrator}\nWorker: ${worker}\nKeys: ${health?.key_pool?.selected_keys ?? health?.key_pool?.active_keys ?? 0}/${health?.key_pool?.total_keys ?? (health?.key_pool?.active_keys ?? 0)} Keys Active`}>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 text-purple-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 text-cyan-400">
              <Key className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
