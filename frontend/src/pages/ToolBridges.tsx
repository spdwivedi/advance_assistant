import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  Terminal,
  Webhook,
  Bot,
  Eye,
  Mic,
  CheckCircle2,
  AlertTriangle,
  Search,
  Copy,
  Check,
  RefreshCw,
  Play,
  Pause,
  Filter,
  Clock,
  Layers,
  ExternalLink,
  Shield,
  Code,
  Sparkles,
  Sliders,
  Globe,
  Radio,
  FileCode,
  FolderGit2,
  Calendar,
  ChevronRight,
  Maximize2,
  Trash2,
  ArrowDown
} from 'lucide-react';

interface ToolBridgeCard {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'ACTIVE' | 'READY' | 'STANDBY';
  statusColor: string;
  icon: any;
  iconColor: string;
  endpointOrCommand: string;
  protocol: string;
  latency: string;
  features: string[];
  integrationDoc: string;
}

interface ResearchProfile {
  id: string;
  name: string;
  groundingEnabled: boolean;
  maxGroundingCalls: number;
  maxDDGCalls: number;
  cacheRaw: boolean;
  desc: string;
  color: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  model: string;
  category: string;
  action: string;
  env: string;
  details: Record<string, any>;
  rawText: string;
}

const EXTERNAL_BRIDGES: ToolBridgeCard[] = [
  {
    id: 'aider',
    name: 'Aider AI CLI Bridge',
    category: 'Agentic IDE & In-Place Refactoring',
    description: 'Windows & WSL batch non-interactive coding agent for autonomous multi-file edits, Git commits, and lint-repair loops.',
    status: 'ACTIVE',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: Bot,
    iconColor: 'text-purple-400',
    endpointOrCommand: 'aider --message "<directive>" --no-auto-commit --no-analytics',
    protocol: 'Subprocess CLI (Timeout: 300s)',
    latency: '< 1.8s spawn',
    features: ['In-place AST edits', 'Automated git diffs', 'Deterministic test loops', 'Local workspace mounts'],
    integrationDoc: 'Executes via src/tool_bridge.py normalize_tool_path translation. Directs headless code refactors inside target project directory.'
  },
  {
    id: 'n8n',
    name: 'n8n Workflow Automation',
    category: 'Local Windows Desktop Automation',
    description: 'Local Windows n8n webhook automation bridge orchestrating desktop workflows, notifications, and external microservice dispatches.',
    status: 'ACTIVE',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: Webhook,
    iconColor: 'text-emerald-400',
    endpointOrCommand: 'http://localhost:5678/webhook/advance-assistant-task',
    protocol: 'HTTP POST Webhook (Timeout: 15s)',
    latency: '12ms dispatch',
    features: ['Cross-platform triggers', 'Payload routing', 'Project trace logging', 'Desktop notifications'],
    integrationDoc: 'Dispatches task telemetry to port 5678. Automatically serializes project names, task prompts, and execution timestamps.'
  },
  {
    id: 'roocode',
    name: 'RooCode / Cursor Bridge',
    category: 'VS Code & Cursor IDE Extension',
    description: 'Direct workspace directive generator producing structured .roocode_task.md instruction files for instant editor pick-up.',
    status: 'READY',
    statusColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    icon: Wrench,
    iconColor: 'text-amber-400',
    endpointOrCommand: '<project_root>/.roocode_task.md',
    protocol: 'Filesystem Directive Protocol',
    latency: '< 5ms write',
    features: ['Markdown task spec', 'Sub-task checklists', 'Scope containment', 'Automated file targeting'],
    integrationDoc: 'Creates in-workspace .roocode_task.md prompt blueprints. Compatible with Cursor Composer, RooCode, and Windsurf agent modes.'
  },
  {
    id: 'antigravity',
    name: 'Antigravity Sandbox Bridge',
    category: 'Isolated Sub-Agent Executor',
    description: 'Autonomous isolated execution sandbox environment running sub-goal tasks with strict filesystem boundaries and live telemetry.',
    status: 'ACTIVE',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: Shield,
    iconColor: 'text-indigo-400',
    endpointOrCommand: 'antigravity run --dir "<target_dir>" --goal "<directive>"',
    protocol: 'Agentic Process Isolation (Timeout: 300s)',
    latency: '< 2.2s init',
    features: ['Process sandboxing', 'Context isolation', 'Concurrent sub-tasking', 'Direct stdout tracing'],
    integrationDoc: 'Invokes isolated task instances via Antigravity runtime, redirecting stdout/stderr into centralized categorical logs.'
  },
  {
    id: 'vision',
    name: 'Multimodal Vision Engine',
    category: 'Headless UI & Visual Regression',
    description: 'Headless Playwright browser automation capturing high-res viewport snapshots analyzed by Gemini 2.5 Flash for UI regressions.',
    status: 'ACTIVE',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: Eye,
    iconColor: 'text-cyan-400',
    endpointOrCommand: 'Playwright Chromium Headless + Gemini 2.5 Flash',
    protocol: 'Sync Playwright Viewport Capture + GenAI API',
    latency: '~1.4s render',
    features: ['Pixel-perfect captures', 'Zero-cost multimodal audit', 'Padding & border scrutiny', 'Alignment metrics'],
    integrationDoc: 'Inspects active web URLs, saves snapshots to ./logs/latest_screenshot.png, and prompts Gemini 2.5 Flash under sliding governor budget.'
  },
  {
    id: 'voice',
    name: 'Voice Engine (STT & TTS)',
    category: 'CUDA Audio Processing & Synthesis',
    description: 'Lazy-loaded CUDA Faster-Whisper float16 speech-to-text combined with lightweight espeak-ng local voice synthesizer.',
    status: 'READY',
    statusColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    icon: Mic,
    iconColor: 'text-rose-400',
    endpointOrCommand: 'Faster-Whisper (small.en / CUDA) + espeak-ng',
    protocol: 'CUDA Tensor Core (Float16) + Local Audio Daemon',
    latency: '180ms STT inference',
    features: ['GPU memory-efficient lazy loading', 'Input shell sanitization', 'Zero external audio API cost', 'Sub-200ms latency'],
    integrationDoc: 'Allocates VRAM only on microphone input. Synthesizes voice notifications via sanitized local system audio daemon.'
  }
];

const RESEARCH_PROFILES: ResearchProfile[] = [
  {
    id: 'BASIC',
    name: 'BASIC (Zero-Cost)',
    groundingEnabled: false,
    maxGroundingCalls: 0,
    maxDDGCalls: 2,
    cacheRaw: false,
    desc: 'Pure DuckDuckGo HTML scraper. Zero cloud API calls, zero quota expenditure. Ideal for quick offline queries.',
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-300'
  },
  {
    id: 'MEDIUM',
    name: 'MEDIUM (Balanced)',
    groundingEnabled: true,
    maxGroundingCalls: 1,
    maxDDGCalls: 4,
    cacheRaw: true,
    desc: 'DuckDuckGo scraper augmented with a single Gemini 3.5 Flash Search Grounding pass for verification.',
    color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/40 text-blue-300'
  },
  {
    id: 'HIGH',
    name: 'HIGH (Deep Research)',
    groundingEnabled: true,
    maxGroundingCalls: 3,
    maxDDGCalls: 6,
    cacheRaw: true,
    desc: 'Full dual-engine synthesis with up to 3 Gemini 3.5 Flash Grounding passes and comprehensive raw caching in .search_data/.',
    color: 'from-purple-500/20 to-indigo-500/20 border-purple-500/40 text-purple-300'
  },
  {
    id: 'MAX',
    name: 'MAX (Exhaustive Grounding)',
    groundingEnabled: true,
    maxGroundingCalls: 5,
    maxDDGCalls: 10,
    cacheRaw: true,
    desc: 'Maximum depth investigation utilizing full DuckDuckGo and Google Search Grounding budgets for novel architecture specs.',
    color: 'from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-300'
  }
];

// Sample multi-stream logs mimicking src/logger.py output format
const MOCK_CATEGORICAL_LOGS: Record<string, LogEntry[]> = {
  agent_router: [
    {
      id: 'ar-1',
      timestamp: '2026-10-13 14:48:10.114',
      model: 'QWEN2.5-CODER:32B',
      category: 'AGENT_ROUTER',
      action: 'DECOMPOSE_MASTER_GOAL',
      env: 'LOCAL',
      details: { goal: 'Construct deep modules for KnowledgeBase, TokenGovernor, and ToolBridges', sub_tasks_assigned: 3, strategy: 'PARALLEL_DOMAIN_LOCK' },
      rawText: '[2026-10-13 14:48:10.114 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:AGENT_ROUTER] [DECOMPOSE_MASTER_GOAL] [ENV:LOCAL] {"goal": "Construct deep modules for KnowledgeBase, TokenGovernor, and ToolBridges", "sub_tasks_assigned": 3, "strategy": "PARALLEL_DOMAIN_LOCK"}'
    },
    {
      id: 'ar-2',
      timestamp: '2026-10-13 14:48:12.305',
      model: 'QWEN2.5-CODER:32B',
      category: 'AGENT_ROUTER',
      action: 'WORKER_ROUTED',
      env: 'LOCAL',
      details: { worker_id: 'worker-1', target_file: 'frontend/src/pages/KnowledgeBase.tsx', tier: 'LOCAL', model: 'qwen2.5-coder:7b' },
      rawText: '[2026-10-13 14:48:12.305 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:AGENT_ROUTER] [WORKER_ROUTED] [ENV:LOCAL] {"worker_id": "worker-1", "target_file": "frontend/src/pages/KnowledgeBase.tsx", "tier": "LOCAL", "model": "qwen2.5-coder:7b"}'
    },
    {
      id: 'ar-3',
      timestamp: '2026-10-13 14:48:14.512',
      model: 'QWEN2.5-CODER:32B',
      category: 'AGENT_ROUTER',
      action: 'WORKER_ROUTED',
      env: 'LOCAL',
      details: { worker_id: 'worker-2', target_file: 'frontend/src/pages/TokenGovernor.tsx', tier: 'FLASH_LITE', model: 'gemini-3.5-flash' },
      rawText: '[2026-10-13 14:48:14.512 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:AGENT_ROUTER] [WORKER_ROUTED] [ENV:LOCAL] {"worker_id": "worker-2", "target_file": "frontend/src/pages/TokenGovernor.tsx", "tier": "FLASH_LITE", "model": "gemini-3.5-flash"}'
    },
    {
      id: 'ar-4',
      timestamp: '2026-10-13 14:48:16.890',
      model: 'QWEN2.5-CODER:32B',
      category: 'AGENT_ROUTER',
      action: 'WORKER_ROUTED',
      env: 'LOCAL',
      details: { worker_id: 'worker-3', target_file: 'frontend/src/pages/ToolBridges.tsx', tier: 'FLASH_LITE', model: 'gemini-3.5-flash' },
      rawText: '[2026-10-13 14:48:16.890 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:AGENT_ROUTER] [WORKER_ROUTED] [ENV:LOCAL] {"worker_id": "worker-3", "target_file": "frontend/src/pages/ToolBridges.tsx", "tier": "FLASH_LITE", "model": "gemini-3.5-flash"}'
    }
  ],
  gatekeeper: [
    {
      id: 'gk-1',
      timestamp: '2026-10-13 14:49:01.020',
      model: 'SYSTEM',
      category: 'GATEKEEPER',
      action: 'VALIDATE_AST_SYNTAX',
      env: 'LOCAL',
      details: { target: 'frontend/src/pages/KnowledgeBase.tsx', linter: 'typescript-eslint', errors: 0, status: 'PASSED' },
      rawText: '[2026-10-13 14:49:01.020 IST] [MODEL:SYSTEM] [CAT:GATEKEEPER] [VALIDATE_AST_SYNTAX] [ENV:LOCAL] {"target": "frontend/src/pages/KnowledgeBase.tsx", "linter": "typescript-eslint", "errors": 0, "status": "PASSED"}'
    },
    {
      id: 'gk-2',
      timestamp: '2026-10-13 14:49:03.440',
      model: 'SYSTEM',
      category: 'GATEKEEPER',
      action: 'COLLISION_CHECK',
      env: 'LOCAL',
      details: { domain_lock_file: 'frontend/src/pages/TokenGovernor.tsx', holder: 'worker-2', collision_detected: false },
      rawText: '[2026-10-13 14:49:03.440 IST] [MODEL:SYSTEM] [CAT:GATEKEEPER] [COLLISION_CHECK] [ENV:LOCAL] {"domain_lock_file": "frontend/src/pages/TokenGovernor.tsx", "holder": "worker-2", "collision_detected": false}'
    },
    {
      id: 'gk-3',
      timestamp: '2026-10-13 14:49:05.811',
      model: 'SYSTEM',
      category: 'GATEKEEPER',
      action: 'ENVIRONMENT_BOUNDARY_VERIFY',
      env: 'WSL2_UBUNTU',
      details: { filesystem: 'ext4_native', cross_boundary_mnt: false, status: 'SECURE' },
      rawText: '[2026-10-13 14:49:05.811 IST] [MODEL:SYSTEM] [CAT:GATEKEEPER] [ENVIRONMENT_BOUNDARY_VERIFY] [ENV:WSL2_UBUNTU] {"filesystem": "ext4_native", "cross_boundary_mnt": false, "status": "SECURE"}'
    }
  ],
  general: [
    {
      id: 'gen-1',
      timestamp: '2026-10-13 14:40:00.001',
      model: 'SYSTEM',
      category: 'GENERAL',
      action: 'SYSTEM_BOOT',
      env: 'WSL2',
      details: { os: 'Linux 6.6.36.6-microsoft-standard-WSL2', python: '3.12.3', fastapi_port: 8000, vite_port: 5173 },
      rawText: '[2026-10-13 14:40:00.001 IST] [MODEL:SYSTEM] [CAT:GENERAL] [SYSTEM_BOOT] [ENV:WSL2] {"os": "Linux 6.6.36.6-microsoft-standard-WSL2", "python": "3.12.3", "fastapi_port": 8000, "vite_port": 5173}'
    },
    {
      id: 'gen-2',
      timestamp: '2026-10-13 14:40:02.150',
      model: 'SYSTEM',
      category: 'GENERAL',
      action: 'MEMORY_BOOKS_MOUNTED',
      env: 'LOCAL',
      details: { total_books: 19, categories: 9, defrag_state: 'OPTIMAL' },
      rawText: '[2026-10-13 14:40:02.150 IST] [MODEL:SYSTEM] [CAT:GENERAL] [MEMORY_BOOKS_MOUNTED] [ENV:LOCAL] {"total_books": 19, "categories": 9, "defrag_state": "OPTIMAL"}'
    }
  ],
  supervisor: [
    {
      id: 'sup-1',
      timestamp: '2026-10-13 14:50:11.450',
      model: 'QWEN2.5-CODER:32B',
      category: 'SUPERVISOR',
      action: 'STAGE_5_INITIATED',
      env: 'LOCAL',
      details: { stage: 5, module_targets: ['KnowledgeBase.tsx', 'TokenGovernor.tsx', 'ToolBridges.tsx'], max_workers: 4 },
      rawText: '[2026-10-13 14:50:11.450 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:SUPERVISOR] [STAGE_5_INITIATED] [ENV:LOCAL] {"stage": 5, "module_targets": ["KnowledgeBase.tsx", "TokenGovernor.tsx", "ToolBridges.tsx"], "max_workers": 4}'
    },
    {
      id: 'sup-2',
      timestamp: '2026-10-13 14:51:30.220',
      model: 'QWEN2.5-CODER:32B',
      category: 'SUPERVISOR',
      action: 'MILESTONE_VERIFIED',
      env: 'LOCAL',
      details: { target: 'KnowledgeBase.tsx', line_count: 663, status: 'SUCCESS' },
      rawText: '[2026-10-13 14:51:30.220 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:SUPERVISOR] [MILESTONE_VERIFIED] [ENV:LOCAL] {"target": "KnowledgeBase.tsx", "line_count": 663, "status": "SUCCESS"}'
    },
    {
      id: 'sup-3',
      timestamp: '2026-10-13 14:52:15.890',
      model: 'QWEN2.5-CODER:32B',
      category: 'SUPERVISOR',
      action: 'MILESTONE_VERIFIED',
      env: 'LOCAL',
      details: { target: 'TokenGovernor.tsx', line_count: 468, status: 'SUCCESS' },
      rawText: '[2026-10-13 14:52:15.890 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:SUPERVISOR] [MILESTONE_VERIFIED] [ENV:LOCAL] {"target": "TokenGovernor.tsx", "line_count": 468, "status": "SUCCESS"}'
    }
  ],
  token_governor: [
    {
      id: 'tg-1',
      timestamp: '2026-10-13 14:47:05.312',
      model: 'SYSTEM',
      category: 'TOKEN_GOVERNOR',
      action: 'SLIDING_WINDOW_PURGE',
      env: 'LOCAL',
      details: { window_seconds: 60, entries_purged: 14, active_rpm: 3, active_tpm: 12450 },
      rawText: '[2026-10-13 14:47:05.312 IST] [MODEL:SYSTEM] [CAT:TOKEN_GOVERNOR] [SLIDING_WINDOW_PURGE] [ENV:LOCAL] {"window_seconds": 60, "entries_purged": 14, "active_rpm": 3, "active_tpm": 12450}'
    },
    {
      id: 'tg-2',
      timestamp: '2026-10-13 14:47:06.110',
      model: 'GEMINI-3.5-FLASH',
      category: 'TOKEN_GOVERNOR',
      action: 'BUDGET_APPROVED',
      env: 'LOCAL',
      details: { model: 'gemini-3.5-flash', estimated_tokens: 3500, current_tpm: 15950, max_tpm: 2000000, shield_status: 'HEALTHY' },
      rawText: '[2026-10-13 14:47:06.110 IST] [MODEL:GEMINI-3.5-FLASH] [CAT:TOKEN_GOVERNOR] [BUDGET_APPROVED] [ENV:LOCAL] {"model": "gemini-3.5-flash", "estimated_tokens": 3500, "current_tpm": 15950, "max_tpm": 2000000, "shield_status": "HEALTHY"}'
    },
    {
      id: 'tg-3',
      timestamp: '2026-10-13 14:47:10.994',
      model: 'GEMINI-3.1-PRO-PREVIEW',
      category: 'TOKEN_GOVERNOR',
      action: 'PROJECT_CAP_TRACKED',
      env: 'LOCAL',
      details: { project_requests_used: 4, hard_cap: 40, failover_ready: true, fallback_model: 'gemini-3.5-flash' },
      rawText: '[2026-10-13 14:47:10.994 IST] [MODEL:GEMINI-3.1-PRO-PREVIEW] [CAT:TOKEN_GOVERNOR] [PROJECT_CAP_TRACKED] [ENV:LOCAL] {"project_requests_used": 4, "hard_cap": 40, "failover_ready": true, "fallback_model": "gemini-3.5-flash"}'
    }
  ]
};

const MOCK_PROJECT_LOGS: Record<string, LogEntry[]> = {
  advance_assistant_v6: [
    {
      id: 'proj-1',
      timestamp: '2026-10-13 14:45:00.000',
      model: 'QWEN2.5-CODER:32B',
      category: 'PROJECT_TRACE',
      action: 'PROJECT_INIT',
      env: 'LOCAL',
      details: { project_name: 'advance_assistant_v6', target_path: '/home/assistantuser/advance_assistant', isolation: false },
      rawText: '[2026-10-13 14:45:00.000 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:PROJECT_TRACE] [PROJECT_INIT] [ENV:LOCAL] {"project_name": "advance_assistant_v6", "target_path": "/home/assistantuser/advance_assistant", "isolation": false}'
    },
    {
      id: 'proj-2',
      timestamp: '2026-10-13 14:46:12.450',
      model: 'QWEN2.5-CODER:32B',
      category: 'PROJECT_TRACE',
      action: 'DISPATCH_STAGE_5',
      env: 'LOCAL',
      details: { project_name: 'advance_assistant_v6', target: 'Deep Modules Implementation', status: 'IN_PROGRESS' },
      rawText: '[2026-10-13 14:46:12.450 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:PROJECT_TRACE] [DISPATCH_STAGE_5] [ENV:LOCAL] {"project_name": "advance_assistant_v6", "target": "Deep Modules Implementation", "status": "IN_PROGRESS"}'
    }
  ],
  ecommerce_portal: [
    {
      id: 'ecom-1',
      timestamp: '2026-10-12 18:22:45.310',
      model: 'GEMINI-2.5-PRO',
      category: 'PROJECT_TRACE',
      action: 'SCHEMA_MIGRATION',
      env: 'CLOUD',
      details: { project_name: 'ecommerce_portal', tables: ['orders', 'line_items', 'inventory'], status: 'APPLIED' },
      rawText: '[2026-10-12 18:22:45.310 IST] [MODEL:GEMINI-2.5-PRO] [CAT:PROJECT_TRACE] [SCHEMA_MIGRATION] [ENV:CLOUD] {"project_name": "ecommerce_portal", "tables": ["orders", "line_items", "inventory"], "status": "APPLIED"}'
    }
  ],
  auth_microservice: [
    {
      id: 'auth-1',
      timestamp: '2026-10-12 11:05:12.012',
      model: 'QWEN2.5-CODER:32B',
      category: 'PROJECT_TRACE',
      action: 'JWT_ROTATION_TEST',
      env: 'LOCAL',
      details: { project_name: 'auth_microservice', keys_rotated: 2, test_coverage: '98.5%' },
      rawText: '[2026-10-12 11:05:12.012 IST] [MODEL:QWEN2.5-CODER:32B] [CAT:PROJECT_TRACE] [JWT_ROTATION_TEST] [ENV:LOCAL] {"project_name": "auth_microservice", "keys_rotated": 2, "test_coverage": "98.5%"}'
    }
  ]
};

const MOCK_DAILY_LOGS: Record<string, LogEntry[]> = {
  'master_timeline.log': [
    {
      id: 'mt-1',
      timestamp: '2026-10-13 14:35:00.000',
      model: 'SYSTEM',
      category: 'MASTER_TIMELINE',
      action: 'PROMPT_2_SUCCESS',
      env: 'LOCAL',
      details: { components: 18, lines: 1155, status: 'COMPLETED' },
      rawText: '[2026-10-13 14:35:00.000 IST] [MODEL:SYSTEM] [CAT:MASTER_TIMELINE] [PROMPT_2_SUCCESS] [ENV:LOCAL] {"components": 18, "lines": 1155, "status": "COMPLETED"}'
    },
    {
      id: 'mt-2',
      timestamp: '2026-10-13 14:45:00.000',
      model: 'SYSTEM',
      category: 'MASTER_TIMELINE',
      action: 'PROMPT_3_SUCCESS',
      env: 'LOCAL',
      details: { target: 'ExecutionStudio.tsx', status: 'COMPLETED' },
      rawText: '[2026-10-13 14:45:00.000 IST] [MODEL:SYSTEM] [CAT:MASTER_TIMELINE] [PROMPT_3_SUCCESS] [ENV:LOCAL] {"target": "ExecutionStudio.tsx", "status": "COMPLETED"}'
    },
    {
      id: 'mt-3',
      timestamp: '2026-10-13 14:52:00.000',
      model: 'SYSTEM',
      category: 'MASTER_TIMELINE',
      action: 'PROMPT_4_SUCCESS',
      env: 'LOCAL',
      details: { target: 'SwarmMonitor.tsx', status: 'COMPLETED' },
      rawText: '[2026-10-13 14:52:00.000 IST] [MODEL:SYSTEM] [CAT:MASTER_TIMELINE] [PROMPT_4_SUCCESS] [ENV:LOCAL] {"target": "SwarmMonitor.tsx", "status": "COMPLETED"}'
    }
  ],
  '2026-10-13.log': [
    {
      id: 'd-1',
      timestamp: '2026-10-13 13:50:00.000',
      model: 'SYSTEM',
      category: 'DAILY_OPERATIONS',
      action: 'SERVER_BOOT',
      env: 'LOCAL',
      details: { service: 'advance_assistant_web_bridge', port: 8000 },
      rawText: '[2026-10-13 13:50:00.000 IST] [MODEL:SYSTEM] [CAT:DAILY_OPERATIONS] [SERVER_BOOT] [ENV:LOCAL] {"service": "advance_assistant_web_bridge", "port": 8000}'
    },
    {
      id: 'd-2',
      timestamp: '2026-10-13 14:52:48.000',
      model: 'SYSTEM',
      category: 'DAILY_OPERATIONS',
      action: 'TOKEN_QUOTA_RESET_BOUNDARY',
      env: 'LOCAL',
      details: { anchor: '1:30 PM IST', next_reset: '2026-10-14 13:30:00 IST' },
      rawText: '[2026-10-13 14:52:48.000 IST] [MODEL:SYSTEM] [CAT:DAILY_OPERATIONS] [TOKEN_QUOTA_RESET_BOUNDARY] [ENV:LOCAL] {"anchor": "1:30 PM IST", "next_reset": "2026-10-14 13:30:00 IST"}'
    }
  ],
  '2026-10-12.log': [
    {
      id: 'd-prev',
      timestamp: '2026-10-12 23:59:59.999',
      model: 'SYSTEM',
      category: 'DAILY_OPERATIONS',
      action: 'DAY_ROLLOVER',
      env: 'LOCAL',
      details: { status: 'ARCHIVED', logs_stored: 418 },
      rawText: '[2026-10-12 23:59:59.999 IST] [MODEL:SYSTEM] [CAT:DAILY_OPERATIONS] [DAY_ROLLOVER] [ENV:LOCAL] {"status": "ARCHIVED", "logs_stored": 418}'
    }
  ]
};

export const ToolBridges: React.FC = () => {
  // Selected Tool for Modal Details
  const [selectedTool, setSelectedTool] = useState<ToolBridgeCard | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string>('HIGH');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Multi-Stream Log Viewer State
  const [logViewMode, setLogViewMode] = useState<'CATEGORICAL' | 'PROJECT' | 'DAILY'>('CATEGORICAL');
  const [selectedCategoryStream, setSelectedCategoryStream] = useState<string>('supervisor');
  const [selectedProjectStream, setSelectedProjectStream] = useState<string>('advance_assistant_v6');
  const [selectedDailyStream, setSelectedDailyStream] = useState<string>('master_timeline.log');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isSimulatingStream, setIsSimulatingStream] = useState<boolean>(true);

  // Live streaming log state
  const [activeLogs, setActiveLogs] = useState<LogEntry[]>([]);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Synchronize active logs based on category and sub-selection
  useEffect(() => {
    let logs: LogEntry[] = [];
    if (logViewMode === 'CATEGORICAL') {
      logs = MOCK_CATEGORICAL_LOGS[selectedCategoryStream] || [];
    } else if (logViewMode === 'PROJECT') {
      logs = MOCK_PROJECT_LOGS[selectedProjectStream] || [];
    } else {
      logs = MOCK_DAILY_LOGS[selectedDailyStream] || [];
    }
    setActiveLogs(logs);
  }, [logViewMode, selectedCategoryStream, selectedProjectStream, selectedDailyStream]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [activeLogs, autoScroll]);

  // Periodic heartbeat log simulation
  useEffect(() => {
    if (!isSimulatingStream) return;

    const interval = setInterval(() => {
      const now = new Date();
      const istTime = now.toLocaleTimeString('en-IN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const dateStr = now.toISOString().split('T')[0];

      if (logViewMode === 'CATEGORICAL' && selectedCategoryStream === 'supervisor') {
        const heartbeatLog: LogEntry = {
          id: `live-sup-${Date.now()}`,
          timestamp: `${dateStr} ${istTime}`,
          model: 'QWEN2.5-CODER:32B',
          category: 'SUPERVISOR',
          action: 'SWARM_HEARTBEAT_ACK',
          env: 'LOCAL',
          details: { status: 'SUPERVISING', active_workers: 0, lock_state: 'CLEAR' },
          rawText: `[${dateStr} ${istTime} IST] [MODEL:QWEN2.5-CODER:32B] [CAT:SUPERVISOR] [SWARM_HEARTBEAT_ACK] [ENV:LOCAL] {"status": "SUPERVISING", "active_workers": 0, "lock_state": "CLEAR"}`
        };
        setActiveLogs(prev => [...prev.slice(-49), heartbeatLog]);
      } else if (logViewMode === 'CATEGORICAL' && selectedCategoryStream === 'token_governor') {
        const heartbeatLog: LogEntry = {
          id: `live-tg-${Date.now()}`,
          timestamp: `${dateStr} ${istTime}`,
          model: 'SYSTEM',
          category: 'TOKEN_GOVERNOR',
          action: 'SLIDING_PULSE',
          env: 'LOCAL',
          details: { sliding_window_sec: 60, current_rpm: 0, financial_shield: 'ARMED' },
          rawText: `[${dateStr} ${istTime} IST] [MODEL:SYSTEM] [CAT:TOKEN_GOVERNOR] [SLIDING_PULSE] [ENV:LOCAL] {"sliding_window_sec": 60, "current_rpm": 0, "financial_shield": "ARMED"}`
        };
        setActiveLogs(prev => [...prev.slice(-49), heartbeatLog]);
      }
    }, 4500);

    return () => clearInterval(interval);
  }, [isSimulatingStream, logViewMode, selectedCategoryStream]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const copyAllLogs = () => {
    const fullLogText = activeLogs.map(l => l.rawText).join('\n');
    handleCopy(fullLogText, 'all_logs');
  };

  const filteredLogs = activeLogs.filter(log => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      log.rawText.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.model.toLowerCase().includes(q) ||
      log.category.toLowerCase().includes(q)
    );
  });

  return (
    <div id="tool-bridges-page" className="space-y-8 pb-12">
      {/* ==================================================================== */}
      {/* 1. HEADER BANNER */}
      {/* ==================================================================== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900/60 border border-cyan-500/20 p-6 md:p-8 backdrop-blur shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-inner">
                <Wrench className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Tool Bridges & System Log Console
              </h1>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                v6.0 Unified
              </span>
            </div>
            <p className="text-sm md:text-base text-slate-300 max-w-3xl leading-relaxed">
              Real-time interface for local CLI integrations (Aider, n8n, RooCode, Antigravity, Vision, Voice), dual-engine web research grounding, and multi-stream system telemetry logs.
            </p>
          </div>

          <div className="flex items-center space-x-3 self-start md:self-auto">
            <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center space-x-2 text-xs font-medium text-slate-300 shadow">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>6 Bridges Online</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center space-x-2 text-xs font-medium text-slate-300 shadow">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>Log Stream Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. EXTERNAL TOOL BRIDGES MATRIX */}
      {/* ==================================================================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              External Automation & Agentic Bridges Matrix
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Interactive Bridge Adapters • Click card to view runtime directives
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {EXTERNAL_BRIDGES.map((bridge) => {
            const Icon = bridge.icon;
            return (
              <div
                key={bridge.id}
                onClick={() => setSelectedTool(bridge)}
                className="group relative cursor-pointer rounded-xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/70 hover:border-cyan-500/50 p-5 transition-all duration-200 shadow-lg hover:shadow-cyan-500/5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 ${bridge.iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                          {bridge.name}
                        </h3>
                        <p className="text-xs text-slate-400">{bridge.category}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${bridge.statusColor}`}>
                      {bridge.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {bridge.description}
                  </p>

                  <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5 text-[11px] font-mono text-cyan-300/90 break-all select-all flex items-center justify-between">
                    <span className="truncate pr-2">{bridge.endpointOrCommand}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(bridge.endpointOrCommand, bridge.id);
                      }}
                      className="p-1 text-slate-400 hover:text-white transition-colors"
                      title="Copy endpoint or command"
                    >
                      {copiedText === bridge.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{bridge.latency}</span>
                  </span>
                  <span className="flex items-center space-x-1 text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                    <span>Inspect Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. DUAL-ENGINE RESEARCH TOOL STATUS & DEPTH PROFILES */}
      {/* ==================================================================== */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 md:p-7 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <Globe className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white tracking-wide">
                Dual-Engine Web Research Scraper & Google Grounding
              </h2>
            </div>
            <p className="text-xs md:text-sm text-slate-400">
              Coordinated dual pipeline balancing zero-cost HTML scraping with live Gemini 3.5 Flash Google Search Grounding.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 font-medium">Select Depth:</span>
            <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              {['BASIC', 'MEDIUM', 'HIGH', 'MAX'].map((profKey) => (
                <button
                  key={profKey}
                  onClick={() => setSelectedProfile(profKey)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    selectedProfile === profKey
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {profKey}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dual Engines Architecture Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Engine 1: DuckDuckGo */}
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/70 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Engine 1: DuckDuckGo Scraper</h3>
                  <p className="text-[11px] text-emerald-400/90 font-medium">Zero-API Cost • Local HTML Parser</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Scrapes raw HTML search result pages from DuckDuckGo lite endpoints. Strips operational prompt tags and indexes code snippets directly into <code className="text-cyan-300 font-mono text-[11px]">.search_data/</code> cache.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/50 text-center">
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="block text-[10px] text-slate-400">Rate Limit</span>
                <span className="text-xs font-bold text-white">Bounded / pass</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="block text-[10px] text-slate-400">Quota Cost</span>
                <span className="text-xs font-bold text-emerald-400">0 Tokens</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="block text-[10px] text-slate-400">Cache Staging</span>
                <span className="text-xs font-bold text-white">.search_data/</span>
              </div>
            </div>
          </div>

          {/* Engine 2: Gemini 3.5 Grounding */}
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/70 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Engine 2: Gemini 3.5 Search Grounding</h3>
                  <p className="text-[11px] text-blue-400/90 font-medium">Google AI Studio • Live Web Grounding</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                ENABLED (HIGH/MAX)
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Leverages native Google Search tool grounding in <code className="text-cyan-300 font-mono text-[11px]">gemini-3.5-flash</code> for high-precision technical documentation, official API signatures, and up-to-date syntax verification.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/50 text-center">
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="block text-[10px] text-slate-400">Model Tier</span>
                <span className="text-xs font-bold text-white">Flash (Free)</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="block text-[10px] text-slate-400">Max Pass Limit</span>
                <span className="text-xs font-bold text-blue-400">Up to 5 calls</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="block text-[10px] text-slate-400">Governor Shield</span>
                <span className="text-xs font-bold text-emerald-400">Protected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Depth Profiles Cards */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Research Depth Profile Configurations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {RESEARCH_PROFILES.map((prof) => {
              const isSelected = selectedProfile === prof.id;
              return (
                <div
                  key={prof.id}
                  onClick={() => setSelectedProfile(prof.id)}
                  className={`cursor-pointer rounded-xl p-4 border transition-all ${
                    isSelected
                      ? `bg-slate-800/90 shadow-lg ${prof.color} ring-1 ring-cyan-400/40`
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-850/50 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{prof.name}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-normal mb-3">
                    {prof.desc}
                  </p>
                  <div className="space-y-1 text-[10px] text-slate-400 border-t border-slate-700/40 pt-2 font-mono">
                    <div className="flex justify-between">
                      <span>DDG Limit:</span>
                      <span className="text-white font-semibold">{prof.maxDDGCalls} passes</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Grounding:</span>
                      <span className={prof.groundingEnabled ? 'text-cyan-300 font-semibold' : 'text-slate-500'}>
                        {prof.groundingEnabled ? `${prof.maxGroundingCalls} calls` : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Raw Cache:</span>
                      <span className="text-slate-300">{prof.cacheRaw ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. MULTI-STREAM LOG VIEWER PANEL */}
      {/* ==================================================================== */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-2xl overflow-hidden space-y-0">
        {/* Top Control Bar */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center space-x-2.5">
              <Terminal className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white tracking-wide">
                Multi-Stream System Log Console
              </h2>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
              <button
                onClick={() => setLogViewMode('CATEGORICAL')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  logViewMode === 'CATEGORICAL'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                <span>Categorical Logs</span>
              </button>
              <button
                onClick={() => setLogViewMode('PROJECT')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  logViewMode === 'PROJECT'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Project Traces</span>
              </button>
              <button
                onClick={() => setLogViewMode('DAILY')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
                  logViewMode === 'DAILY'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Daily Operational</span>
              </button>
            </div>
          </div>

          {/* Sub-Selection Stream Pill Selector */}
          <div className="flex items-center space-x-3 flex-wrap">
            {logViewMode === 'CATEGORICAL' && (
              <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
                {['agent_router', 'gatekeeper', 'general', 'supervisor', 'token_governor'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategoryStream(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                      selectedCategoryStream === cat
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {logViewMode === 'PROJECT' && (
              <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
                {['advance_assistant_v6', 'ecommerce_portal', 'auth_microservice'].map((proj) => (
                  <button
                    key={proj}
                    onClick={() => setSelectedProjectStream(proj)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                      selectedProjectStream === proj
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                    }`}
                  >
                    {proj}
                  </button>
                ))}
              </div>
            )}

            {logViewMode === 'DAILY' && (
              <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
                {['master_timeline.log', '2026-10-13.log', '2026-10-12.log'].map((daily) => (
                  <button
                    key={daily}
                    onClick={() => setSelectedDailyStream(daily)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                      selectedDailyStream === daily
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                    }`}
                  >
                    {daily}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Secondary Toolbar (Search filter, auto-scroll toggle, copy all) */}
        <div className="px-5 py-3 bg-slate-950/90 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search active stream by model, action, timestamp, or payload..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex items-center space-x-3 text-slate-400">
            <button
              onClick={() => setIsSimulatingStream(!isSimulatingStream)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md border text-[11px] transition-colors ${
                isSimulatingStream
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Toggle periodic live streaming heartbeat"
            >
              {isSimulatingStream ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isSimulatingStream ? 'Stream Live' : 'Stream Paused'}</span>
            </button>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md border text-[11px] transition-colors ${
                autoScroll
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Auto-scroll to latest log entries"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Auto-Scroll {autoScroll ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={copyAllLogs}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors text-[11px]"
              title="Copy entire log stream to clipboard"
            >
              {copiedText === 'all_logs' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Stream</span>
                </>
              )}
            </button>

            <span className="text-slate-500 font-mono text-[11px]">
              {filteredLogs.length} entries
            </span>
          </div>
        </div>

        {/* Monospace Log Viewer Viewport */}
        <div
          ref={logScrollRef}
          className="h-96 md:h-[480px] overflow-y-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed space-y-1.5 select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Terminal className="w-8 h-8 text-slate-600" />
              <p>No log records match the current filter criteria.</p>
              <span className="text-[11px] text-slate-600 font-sans">
                Try switching categories or clearing search keywords.
              </span>
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              return (
                <div
                  key={log.id}
                  className={`group flex items-start space-x-3 py-1 px-2 rounded hover:bg-slate-900/90 transition-colors border-l-2 ${
                    log.category === 'SUPERVISOR'
                      ? 'border-indigo-500'
                      : log.category === 'TOKEN_GOVERNOR'
                      ? 'border-emerald-500'
                      : log.category === 'GATEKEEPER'
                      ? 'border-amber-500'
                      : log.category === 'AGENT_ROUTER'
                      ? 'border-cyan-500'
                      : 'border-slate-600'
                  }`}
                >
                  {/* Line Number */}
                  <span className="text-slate-600 select-none w-8 text-right font-mono text-[11px] shrink-0 pt-0.5">
                    {index + 1}
                  </span>

                  {/* Log Content Elements */}
                  <div className="flex-1 break-all leading-relaxed">
                    <span className="text-slate-400 select-none">[{log.timestamp} IST] </span>
                    <span className="text-purple-300 font-semibold">[MODEL:{log.model}] </span>
                    <span className="text-cyan-300 font-semibold">[CAT:{log.category}] </span>
                    <span className="text-amber-300 font-bold">[{log.action}] </span>
                    <span className="text-emerald-400 font-semibold">[ENV:{log.env}] </span>
                    <span className="text-slate-200">
                      {JSON.stringify(log.details)}
                    </span>
                  </div>

                  {/* Copy Individual Row Action */}
                  <button
                    onClick={() => handleCopy(log.rawText, log.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-white transition-opacity shrink-0"
                    title="Copy line"
                  >
                    {copiedText === log.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Console Status Footer */}
        <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Target Sink: <span className="text-slate-300">./logs/categories/{selectedCategoryStream}/</span></span>
          </div>
          <div className="flex items-center space-x-4">
            <span>Buffer: <span className="text-slate-300">UTF-8 File Append Lock</span></span>
            <span>Anchor: <span className="text-cyan-400 font-semibold">IST (UTC+5:30)</span></span>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. TOOL DETAIL / INTEGRATION SPEC MODAL */}
      {/* ==================================================================== */}
      {selectedTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 md:p-7 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3.5">
                <div className={`p-3 rounded-xl bg-slate-800 border border-slate-700 ${selectedTool.iconColor}`}>
                  <selectedTool.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedTool.name}</h3>
                  <p className="text-xs text-cyan-400">{selectedTool.category}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTool(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-300 leading-relaxed">
              {selectedTool.description}
            </p>

            {/* Protocol & Latency Matrix */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 block font-medium">Invocation Protocol</span>
                <span className="text-white font-mono font-semibold">{selectedTool.protocol}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 block font-medium">Typical Latency</span>
                <span className="text-emerald-400 font-mono font-semibold">{selectedTool.latency}</span>
              </div>
            </div>

            {/* Key Features */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Supported Architectural Features
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {selectedTool.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center space-x-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Endpoint / Command block */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Endpoint / Command Prototype
                </h4>
                <button
                  onClick={() => handleCopy(selectedTool.endpointOrCommand, 'modal_cmd')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                >
                  {copiedText === 'modal_cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedText === 'modal_cmd' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 font-mono text-xs text-cyan-300 select-all break-all">
                {selectedTool.endpointOrCommand}
              </div>
            </div>

            {/* Integration Specification */}
            <div className="space-y-1.5 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 text-xs">
              <span className="text-slate-400 font-semibold block">Integration Specification:</span>
              <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
                {selectedTool.integrationDoc}
              </p>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTool(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
