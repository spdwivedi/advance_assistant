import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BookOpen,
  Layers,
  Database,
  Sparkles,
  RefreshCw,
  Search,
  Code,
  Cloud,
  Terminal,
  Server,
  HardDrive,
  Shield,
  Cpu,
  Plus,
  Trash2,
  Save,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Zap,
  ChevronRight,
  ChevronDown,
  FileText,
  X,
  Clock,
  Tag,
  Play
} from 'lucide-react';

// ==============================================================================
// TYPE DEFINITIONS
// ==============================================================================

interface BookSection {
  section_id: number;
  heading: string;
  content: string;
  has_code: boolean;
  estimated_tokens: number;
  keywords: string[];
}

interface BookDetail {
  category: string;
  book_name: string;
  title: string;
  content: string;
  sections: BookSection[];
  size_bytes: number;
  estimated_tokens: number;
  last_modified: string;
  tags: string[];
}

interface BookSummaryItem {
  category: string;
  book_name: string;
  title: string;
  size_bytes: number;
  estimated_tokens: number;
  section_count: number;
  last_modified: string;
  tags: string[];
  summary: string;
}

interface CategoryRollup {
  book_count: number;
  total_tokens: number;
  total_bytes: number;
}

interface BooksApiResponse {
  status: string;
  knowledge_telemetry: string;
  categories: Record<string, CategoryRollup>;
  books: BookSummaryItem[];
  total_books: number;
  total_tokens: number;
}

interface MatchedSnippet {
  category: string;
  book_name: string;
  heading: string;
  score: number;
  estimated_tokens: number;
  has_code: boolean;
  preview: string;
  content: string;
}

interface SimulationResponse {
  status: string;
  formatted_context: string;
  model_name: string;
  token_budget: number;
  injected_tokens: number;
  full_books_tokens: number;
  tokens_saved: number;
  matched_snippets: MatchedSnippet[];
}

// Canonical categories with semantic styling
const CANONICAL_CATEGORIES_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  all: { label: 'All Categories', icon: Database, color: 'text-indigo-400', bg: 'bg-indigo-950/40 border-indigo-800/60' },
  coding: { label: 'Coding & Syntaxes', icon: Code, color: 'text-blue-400', bg: 'bg-blue-950/40 border-blue-800/60' },
  frameworks: { label: 'Web Frameworks', icon: Layers, color: 'text-cyan-400', bg: 'bg-cyan-950/40 border-cyan-800/60' },
  cloud: { label: 'Cloud & Deploy', icon: Cloud, color: 'text-purple-400', bg: 'bg-purple-950/40 border-purple-800/60' },
  devops: { label: 'DevOps & CI/CD', icon: Terminal, color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-800/60' },
  ai_ml: { label: 'AI & Ollama ML', icon: Cpu, color: 'text-amber-400', bg: 'bg-amber-950/40 border-amber-800/60' },
  security: { label: 'Security & Auth', icon: Shield, color: 'text-rose-400', bg: 'bg-rose-950/40 border-rose-800/60' },
  databases: { label: 'Databases & ORM', icon: Database, color: 'text-teal-400', bg: 'bg-teal-950/40 border-teal-800/60' },
  architecture: { label: 'Architecture', icon: Server, color: 'text-orange-400', bg: 'bg-orange-950/40 border-orange-800/60' },
  general: { label: 'General Knowledge', icon: FileText, color: 'text-slate-400', bg: 'bg-slate-900 border-slate-800' },
  tools: { label: 'Developer Tools', icon: Terminal, color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-800/60' },
  tech_stack: { label: 'System Tech Stack', icon: Server, color: 'text-amber-400', bg: 'bg-amber-950/40 border-amber-800/60' },
  environment: { label: 'Environment Config', icon: HardDrive, color: 'text-teal-400', bg: 'bg-teal-950/40 border-teal-800/60' },
  history: { label: 'Execution History', icon: Clock, color: 'text-rose-400', bg: 'bg-rose-950/40 border-rose-800/60' },
  cs_fundamentals: { label: 'CS Fundamentals', icon: Layers, color: 'text-violet-400', bg: 'bg-violet-950/40 border-violet-800/60' },
  design_patterns: { label: 'Design Patterns', icon: Sparkles, color: 'text-pink-400', bg: 'bg-pink-950/40 border-pink-800/60' }
};

// Preset models for the Context Injection Simulator
const PRESET_SIM_MODELS = [
  { id: 'qwen2.5-coder:1.5b', label: 'qwen2.5-coder:1.5b (Small Local)', budget: 600 },
  { id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b (Standard Local)', budget: 1200 },
  { id: 'qwen2.5-coder:14b', label: 'qwen2.5-coder:14b (Standard Local)', budget: 1200 },
  { id: 'qwen2.5-coder:32b', label: 'qwen2.5-coder:32b (Heavy Local)', budget: 2000 },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (Cloud High-Capacity)', budget: 3500 }
];

// Sample test directives for fast testing
const SAMPLE_PROMPTS = [
  'Build a FastAPI endpoint with async SQLAlchemy session, CORS middleware and JWT auth.',
  'Implement React component with TypeScript, custom hook, and WebSocket live telemetry.',
  'Docker containerization with multi-stage build, SQLite persistence and uvicorn server.',
  'Operating system process threading with thread safety locks and non-blocking IO.'
];

export const KnowledgeBase: React.FC = () => {
  // Navigation / View Mode
  const [activeMode, setActiveMode] = useState<'explorer' | 'simulator'>('explorer');

  // Knowledge Inventory State
  const [booksData, setBooksData] = useState<BooksApiResponse | null>(null);
  const [loadingBooks, setLoadingBooks] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBookKey, setSelectedBookKey] = useState<{ category: string; book_name: string } | null>(null);

  // Active Selected Book Details
  const [activeBook, setActiveBook] = useState<BookDetail | null>(null);
  const [loadingActiveBook, setLoadingActiveBook] = useState<boolean>(false);
  const [bookWorkspaceTab, setBookWorkspaceTab] = useState<'sections' | 'editor' | 'recipe'>('sections');

  // Markdown Editor State
  const [editorContent, setEditorContent] = useState<string>('');
  const [editorTags, setEditorTags] = useState<string>('');
  const [savingBook, setSavingBook] = useState<boolean>(false);
  const [bookFeedbackMsg, setBookFeedbackMsg] = useState<{ text: string; success: boolean } | null>(null);

  // New Recipe Form State
  const [recipeTitle, setRecipeTitle] = useState<string>('');
  const [recipeInsight, setRecipeInsight] = useState<string>('');
  const [recipeSnippet, setRecipeSnippet] = useState<string>('');
  const [recipeTags, setRecipeTags] = useState<string>('');
  const [addingRecipe, setAddingRecipe] = useState<boolean>(false);

  // New Book Modal State
  const [showNewBookModal, setShowNewBookModal] = useState<boolean>(false);
  const [newBookCategory, setNewBookCategory] = useState<string>('coding');
  const [newBookName, setNewBookName] = useState<string>('');
  const [newBookContent, setNewBookContent] = useState<string>('# New Knowledge Book\n\n## Overview\nDocumentation and operational patterns.\n');
  const [newBookTags, setNewBookTags] = useState<string>('general');
  const [creatingBook, setCreatingBook] = useState<boolean>(false);

  // Defrag State
  const [defragging, setDefragging] = useState<boolean>(false);
  const [defragFeedback, setDefragFeedback] = useState<string | null>(null);

  // Simulator State
  const [simPrompt, setSimPrompt] = useState<string>(SAMPLE_PROMPTS[0]);
  const [simModel, setSimModel] = useState<string>('qwen2.5-coder:7b');
  const [simCustomBudget, setSimCustomBudget] = useState<string>('');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResponse | null>(null);
  const [copiedContext, setCopiedContext] = useState<boolean>(false);
  const [expandedSnippets, setExpandedSnippets] = useState<Record<number, boolean>>({});

  // ----------------------------------------------------------------------------
  // DATA FETCHING: INVENTORY
  // ----------------------------------------------------------------------------
  const fetchBooks = useCallback(async () => {
    setLoadingBooks(true);
    try {
      const res = await fetch('/api/memory/books');
      if (res.ok) {
        const data: BooksApiResponse = await res.json();
        setBooksData(data);

        // Auto-select first book if nothing is selected
        if (data.books && data.books.length > 0 && !selectedBookKey) {
          setSelectedBookKey({
            category: data.books[0].category,
            book_name: data.books[0].book_name
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch books inventory:', err);
    } finally {
      setLoadingBooks(false);
    }
  }, [selectedBookKey]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // ----------------------------------------------------------------------------
  // DATA FETCHING: ACTIVE BOOK DETAILS
  // ----------------------------------------------------------------------------
  const fetchActiveBook = useCallback(async (cat: string, name: string) => {
    setLoadingActiveBook(true);
    setBookFeedbackMsg(null);
    try {
      const res = await fetch(`/api/memory/book/${encodeURIComponent(cat)}/${encodeURIComponent(name)}`);
      if (res.ok) {
        const json = await res.json();
        const b: BookDetail = json.book;
        setActiveBook(b);
        setEditorContent(b.content);
        setEditorTags((b.tags || []).join(', '));
      } else {
        setActiveBook(null);
      }
    } catch (err) {
      console.error('Failed to fetch active book:', err);
      setActiveBook(null);
    } finally {
      setLoadingActiveBook(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBookKey) {
      fetchActiveBook(selectedBookKey.category, selectedBookKey.book_name);
    }
  }, [selectedBookKey, fetchActiveBook]);

  // ----------------------------------------------------------------------------
  // ACTION: SAVE BOOK
  // ----------------------------------------------------------------------------
  const handleSaveBook = async () => {
    if (!activeBook) return;
    setSavingBook(true);
    setBookFeedbackMsg(null);
    try {
      const tagsList = editorTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/memory/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeBook.category,
          book_name: activeBook.book_name,
          content: editorContent,
          tags: tagsList
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setBookFeedbackMsg({ text: `Book "${activeBook.book_name}" saved successfully.`, success: true });
        setActiveBook(data.book);
        fetchBooks();
      } else {
        setBookFeedbackMsg({ text: data.detail || 'Failed to save book changes.', success: false });
      }
    } catch (err: any) {
      setBookFeedbackMsg({ text: `Save error: ${err.message || err}`, success: false });
    } finally {
      setSavingBook(false);
    }
  };

  // ----------------------------------------------------------------------------
  // ACTION: DELETE BOOK
  // ----------------------------------------------------------------------------
  const handleDeleteBook = async () => {
    if (!activeBook) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${activeBook.category}/${activeBook.book_name}"?`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/memory/book/${encodeURIComponent(activeBook.category)}/${encodeURIComponent(activeBook.book_name)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedBookKey(null);
        setActiveBook(null);
        fetchBooks();
      } else {
        const data = await res.json();
        alert(`Delete failed: ${data.detail || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message || err}`);
    }
  };

  // ----------------------------------------------------------------------------
  // ACTION: APPEND RECIPE
  // ----------------------------------------------------------------------------
  const handleAppendRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBook || !recipeTitle.trim() || !recipeInsight.trim()) return;

    setAddingRecipe(true);
    setBookFeedbackMsg(null);
    try {
      const tagsList = recipeTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/memory/book/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: activeBook.category,
          book_name: activeBook.book_name,
          title: recipeTitle.trim(),
          insight: recipeInsight.trim(),
          code_snippet: recipeSnippet.trim(),
          tags: tagsList
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setActiveBook(data.book);
        setEditorContent(data.book.content);
        setRecipeTitle('');
        setRecipeInsight('');
        setRecipeSnippet('');
        setRecipeTags('');
        setBookWorkspaceTab('sections');
        setBookFeedbackMsg({ text: `Recipe "${recipeTitle}" appended successfully!`, success: true });
        fetchBooks();
      } else {
        setBookFeedbackMsg({ text: data.detail || 'Failed to append recipe.', success: false });
      }
    } catch (err: any) {
      setBookFeedbackMsg({ text: `Recipe error: ${err.message || err}`, success: false });
    } finally {
      setAddingRecipe(false);
    }
  };

  // ----------------------------------------------------------------------------
  // ACTION: CREATE NEW BOOK
  // ----------------------------------------------------------------------------
  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanName = newBookName.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
    if (!cleanName) return;
    if (!cleanName.endsWith('.md')) cleanName += '.md';

    setCreatingBook(true);
    try {
      const tagsList = newBookTags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/memory/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newBookCategory,
          book_name: cleanName,
          content: newBookContent,
          tags: tagsList
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setShowNewBookModal(false);
        setNewBookName('');
        setSelectedBookKey({ category: newBookCategory, book_name: cleanName });
        fetchBooks();
      } else {
        alert(data.detail || 'Failed to create new book.');
      }
    } catch (err: any) {
      alert(`Create error: ${err.message || err}`);
    } finally {
      setCreatingBook(false);
    }
  };

  // ----------------------------------------------------------------------------
  // ACTION: DEFRAGMENT BOOKS
  // ----------------------------------------------------------------------------
  const handleDefragment = async () => {
    setDefragging(true);
    setDefragFeedback(null);
    try {
      const res = await fetch('/api/memory/defrag', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setDefragFeedback(data.message || 'Defragmentation complete.');
        fetchBooks();
        setTimeout(() => setDefragFeedback(null), 6000);
      }
    } catch (err) {
      console.error('Defragmentation failed:', err);
    } finally {
      setDefragging(false);
    }
  };

  // ----------------------------------------------------------------------------
  // ACTION: CONTEXT SIMULATION
  // ----------------------------------------------------------------------------
  const handleRunSimulation = async () => {
    if (!simPrompt.trim()) return;
    setSimulating(true);
    try {
      const budgetNum = simCustomBudget.trim() ? parseInt(simCustomBudget.trim(), 10) : undefined;
      const res = await fetch('/api/memory/simulate-injection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: simPrompt.trim(),
          model_name: simModel,
          max_tokens: budgetNum
        })
      });

      if (res.ok) {
        const data: SimulationResponse = await res.json();
        setSimResult(data);
      }
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimulating(false);
    }
  };

  const copyInjectedContext = () => {
    if (!simResult?.formatted_context) return;
    navigator.clipboard.writeText(simResult.formatted_context);
    setCopiedContext(true);
    setTimeout(() => setCopiedContext(false), 2500);
  };

  // ----------------------------------------------------------------------------
  // FILTERED BOOKS LIST
  // ----------------------------------------------------------------------------
  const filteredBooks = useMemo(() => {
    if (!booksData?.books) return [];
    return booksData.books.filter((b) => {
      const matchesCat = selectedCategory === 'all' || b.category.toLowerCase() === selectedCategory.toLowerCase();
      if (!matchesCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nameMatch = b.book_name.toLowerCase().includes(q) || b.title.toLowerCase().includes(q);
      const tagMatch = (b.tags || []).some((t) => t.toLowerCase().includes(q));
      const summaryMatch = (b.summary || '').toLowerCase().includes(q);
      return nameMatch || tagMatch || summaryMatch;
    });
  }, [booksData, selectedCategory, searchQuery]);

  // Total sections count rollup
  const totalSectionsCount = useMemo(() => {
    if (!booksData?.books) return 0;
    return booksData.books.reduce((acc, b) => acc + (b.section_count || 0), 0);
  }, [booksData]);

  return (
    <div className="space-y-6 pb-12">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER & TELEMETRY COUNTER BANNER                             */}
      {/* ==================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Knowledge Base & Snippet Engine
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  v6.0 Unified
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Precision Markdown Section Parser &bull; Model-Aware Token Budgeter &bull; Offline Ollama Context Simulator
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            id="new-book-modal-btn"
            onClick={() => setShowNewBookModal(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-amber-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Knowledge Book</span>
          </button>

          <button
            type="button"
            id="defrag-books-btn"
            onClick={handleDefragment}
            disabled={defragging}
            className="px-3.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${defragging ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
            <span>{defragging ? 'Consolidating...' : 'Defrag & Consolidate'}</span>
          </button>
        </div>
      </div>

      {/* Defrag Alert Banner */}
      {defragFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{defragFeedback}</span>
          </div>
          <button onClick={() => setDefragFeedback(null)} className="text-slate-400 hover:text-slate-200 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Live Telemetry Summary Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Total Topic Books</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {booksData?.total_books ?? '--'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Persisted in .agent_memory/books/</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>Active Categories</span>
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-300 mt-1">
            {booksData?.categories ? Object.keys(booksData.categories).length : '--'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Canonical knowledge domains</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sections & Recipes</span>
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300 mt-1">
            {totalSectionsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Discrete parsed Markdown blocks</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Estimated Tokens</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {booksData?.total_tokens ? booksData.total_tokens.toLocaleString() : '--'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Indexed total corpus size</div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. MODE SELECTOR BAR (EXPLORER vs CONTEXT SIMULATOR)                 */}
      {/* ==================================================================== */}
      <div className="flex border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveMode('explorer')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-bold transition-all ${
            activeMode === 'explorer'
              ? 'border-amber-500 text-amber-300 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Explorer & Markdown Workspace</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('simulator')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-bold transition-all ${
            activeMode === 'simulator'
              ? 'border-emerald-500 text-emerald-300 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>Precision Context Simulator</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Offline Ollama
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 3. MODE 1: SPLIT-PANE EXPLORER & WORKSPACE                           */}
      {/* ==================================================================== */}
      {activeMode === 'explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Categories & Book Selector (4 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Category Pills Scroller */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Categories
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(CANONICAL_CATEGORIES_META).map(([catKey, meta]) => {
                  const Icon = meta.icon;
                  const isSelected = selectedCategory === catKey;
                  const count =
                    catKey === 'all'
                      ? booksData?.books?.length || 0
                      : booksData?.categories?.[catKey]?.book_count || 0;

                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setSelectedCategory(catKey)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      <span>{meta.label}</span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-slate-500">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Book Search & Book List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter books by title, filename, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Books List View */}
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {loadingBooks ? (
                  <div className="p-8 text-center text-xs text-slate-500 font-mono flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Loading knowledge catalog...</span>
                  </div>
                ) : filteredBooks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No books matched category or filter query.
                  </div>
                ) : (
                  filteredBooks.map((b) => {
                    const isSelected =
                      selectedBookKey?.category === b.category && selectedBookKey?.book_name === b.book_name;
                    const meta = CANONICAL_CATEGORIES_META[b.category] || CANONICAL_CATEGORIES_META.general;

                    return (
                      <div
                        key={`${b.category}/${b.book_name}`}
                        onClick={() => setSelectedBookKey({ category: b.category, book_name: b.book_name })}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-850 border-amber-500/70 shadow-amber-500/10 ring-1 ring-amber-500/30'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                              {b.title}
                            </h3>
                            <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                              {b.book_name}
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border shrink-0 ${meta.bg} ${meta.color}`}>
                            {b.category}
                          </span>
                        </div>

                        {b.summary && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                            {b.summary}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
                          <span className="text-slate-400">
                            {b.section_count} sections &bull; {b.estimated_tokens} tokens
                          </span>
                          <span>{(b.size_bytes / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Active Book Workspace (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {activeBook ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                {/* Book Workspace Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {activeBook.category}
                      </span>
                      <h2 className="text-base font-bold text-white truncate">{activeBook.title}</h2>
                    </div>
                    <div className="text-xs font-mono text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                      <span>Path: .agent_memory/books/{activeBook.category}/{activeBook.book_name}</span>
                      <span>&bull;</span>
                      <span className="text-emerald-400">{activeBook.estimated_tokens} tokens</span>
                      <span>&bull;</span>
                      <span className="text-slate-500">{activeBook.last_modified}</span>
                    </div>
                  </div>

                  {/* Sub-tab Switcher Buttons */}
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBookWorkspaceTab('sections')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        bookWorkspaceTab === 'sections'
                          ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Sections ({activeBook.sections?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookWorkspaceTab('editor')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        bookWorkspaceTab === 'editor'
                          ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Markdown Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookWorkspaceTab('recipe')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        bookWorkspaceTab === 'recipe'
                          ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      + Add Recipe
                    </button>
                  </div>
                </div>

                {/* Feedback banner */}
                {bookFeedbackMsg && (
                  <div
                    className={`mx-5 mt-4 p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                      bookFeedbackMsg.success
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                    }`}
                  >
                    <span>{bookFeedbackMsg.text}</span>
                    <button onClick={() => setBookFeedbackMsg(null)} className="text-slate-400 hover:text-white text-xs">
                      ✕
                    </button>
                  </div>
                )}

                {/* SUB-TAB 1: PARSED SECTIONS & RECIPES */}
                {bookWorkspaceTab === 'sections' && (
                  <div className="p-5 space-y-4 max-h-[720px] overflow-y-auto">
                    {loadingActiveBook ? (
                      <div className="p-12 text-center text-xs text-slate-500 font-mono">
                        Parsing sections...
                      </div>
                    ) : !activeBook.sections || activeBook.sections.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No parsed sections found. Add a recipe or edit Markdown.
                      </div>
                    ) : (
                      activeBook.sections.map((sec) => (
                        <div
                          key={sec.section_id}
                          className="bg-slate-950 border border-slate-800/90 hover:border-slate-700 rounded-xl p-4 space-y-2.5 transition-all shadow-md"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-center shrink-0">
                                #{sec.section_id}
                              </span>
                              <h4 className="text-xs font-bold text-white font-mono">{sec.heading}</h4>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {sec.has_code && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                                  <Code className="w-3 h-3" /> Code
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                                {sec.estimated_tokens} tok
                              </span>
                            </div>
                          </div>

                          {/* Keywords */}
                          {sec.keywords && sec.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sec.keywords.slice(0, 8).map((kw, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-900 border border-slate-800 text-slate-400"
                                >
                                  #{kw}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Section Markdown Content */}
                          <pre className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800/80 text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                            {sec.content}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* SUB-TAB 2: RAW MARKDOWN EDITOR */}
                {bookWorkspaceTab === 'editor' && (
                  <div className="p-5 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Tags (Comma Separated)
                      </label>
                      <input
                        type="text"
                        value={editorTags}
                        onChange={(e) => setEditorTags(e.target.value)}
                        placeholder="fastapi, async, sqlalchemy, rest"
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <label className="font-bold text-slate-300 uppercase tracking-wider">
                          Raw Markdown Content
                        </label>
                        <span className="font-mono text-[11px]">
                          ~{Math.max(1, Math.floor(editorContent.length / 4))} estimated tokens
                        </span>
                      </div>
                      <textarea
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        rows={18}
                        className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={handleDeleteBook}
                        className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Book</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditorContent(activeBook.content);
                            setEditorTags((activeBook.tags || []).join(', '));
                          }}
                          className="px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-400 text-xs font-medium"
                        >
                          Reset
                        </button>

                        <button
                          type="button"
                          onClick={handleSaveBook}
                          disabled={savingBook}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{savingBook ? 'Saving Changes...' : 'Save Book Changes'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUB-TAB 3: APPEND OPERATIONAL RECIPE */}
                {bookWorkspaceTab === 'recipe' && (
                  <form onSubmit={handleAppendRecipe} className="p-5 space-y-4">
                    <div className="text-xs text-slate-400">
                      Appends a structured knowledge insight block into{' '}
                      <strong className="text-amber-400 font-mono">{activeBook.book_name}</strong>. The backend automatically parses it into a discrete section and indexes keywords for precision retrieval.
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Recipe Directive / Title
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Non-blocking Session Disposal in Lifespan Context"
                        value={recipeTitle}
                        onChange={(e) => setRecipeTitle(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Operational Insight & Architecture Notes
                      </label>
                      <textarea
                        required
                        rows={4}
                        placeholder="Explain syntax specifics, concurrency protections, or bug fixes..."
                        value={recipeInsight}
                        onChange={(e) => setRecipeInsight(e.target.value)}
                        className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Standard Code Snippet (Optional)
                      </label>
                      <textarea
                        rows={5}
                        placeholder="async with async_session() as session: ..."
                        value={recipeSnippet}
                        onChange={(e) => setRecipeSnippet(e.target.value)}
                        className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-emerald-300 placeholder-slate-600 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Tags (Comma Separated)
                      </label>
                      <input
                        type="text"
                        placeholder="async, session, lifespan, sqlalchemy"
                        value={recipeTags}
                        onChange={(e) => setRecipeTags(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={addingRecipe}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{addingRecipe ? 'Appending Recipe...' : 'Append Recipe to Book'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
                <BookOpen className="w-10 h-10 text-slate-700" />
                <div className="text-sm font-semibold text-slate-400">No Knowledge Book Selected</div>
                <div className="text-xs max-w-sm text-slate-500">
                  Select a book from the left catalogue or click &quot;New Knowledge Book&quot; to initialize a new knowledge layer.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. MODE 2: PRECISION CONTEXT INJECTION SIMULATOR                     */}
      {/* ==================================================================== */}
      {activeMode === 'simulator' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Model-Aware Precision Context Simulation
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulate what discrete knowledge snippets our weighted scoring algorithm compiles for offline local models.
                </p>
              </div>

              <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-3 py-1 rounded-lg border border-emerald-800/60">
                POST /api/memory/simulate-injection
              </div>
            </div>

            {/* Quick Sample Prompts */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Quick Preset Engineering Directives:
              </label>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSimPrompt(promptText)}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-mono transition-all text-left line-clamp-1"
                  >
                    &quot;{promptText.slice(0, 48)}...&quot;
                  </button>
                ))}
              </div>
            </div>

            {/* Directive Input Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Task / Prompt Directive
              </label>
              <textarea
                rows={3}
                value={simPrompt}
                onChange={(e) => setSimPrompt(e.target.value)}
                placeholder="Type engineering directive here..."
                className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 leading-relaxed"
              />
            </div>

            {/* Model & Budget Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Target Inference Model
                </label>
                <select
                  value={simModel}
                  onChange={(e) => setSimModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                >
                  {PRESET_SIM_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} &bull; Default Budget: {m.budget} tokens
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Custom Budget Override
                </label>
                <input
                  type="number"
                  placeholder="Auto by model"
                  value={simCustomBudget}
                  onChange={(e) => setSimCustomBudget(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Run Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating || !simPrompt.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
                <span>{simulating ? 'Evaluating Relevance Scores...' : 'Run Precision Context Simulation'}</span>
              </button>
            </div>
          </div>

          {/* SIMULATION RESULTS VIEW */}
          {simResult && (
            <div className="space-y-5 animate-fadeIn">
              {/* Optimization KPI Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Token Budget</div>
                  <div className="text-2xl font-bold font-mono text-white mt-1">
                    {simResult.token_budget}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Scale for {simResult.model_name}</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Injected Tokens</div>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                    {simResult.injected_tokens}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">High-signal snippets</div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Full Books Size</div>
                  <div className="text-2xl font-bold font-mono text-slate-400 mt-1">
                    {simResult.full_books_tokens}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Uncompressed raw tokens</div>
                </div>

                <div className="bg-slate-900 border border-emerald-900/60 rounded-xl p-4 bg-emerald-950/20">
                  <div className="text-[10px] text-emerald-400 uppercase font-semibold">Tokens Saved</div>
                  <div className="text-2xl font-bold font-mono text-emerald-300 mt-1 flex items-baseline gap-2">
                    <span>{simResult.tokens_saved}</span>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {simResult.full_books_tokens > 0
                        ? `${Math.round((simResult.tokens_saved / simResult.full_books_tokens) * 100)}% Saved`
                        : '100%'}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-500/80 mt-0.5">Context pollution prevented</div>
                </div>
              </div>

              {/* Matched Snippets Cards */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Top Matched Snippets ({simResult.matched_snippets?.length || 0})</span>
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    Weighted scoring: Heading (3x) + Domain (2.5x) + Body (1x) + Code (+1.5)
                  </span>
                </div>

                <div className="space-y-2.5">
                  {simResult.matched_snippets.map((snip, idx) => {
                    const isExpanded = !!expandedSnippets[idx];

                    return (
                      <div
                        key={idx}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Score: {snip.score}
                            </span>
                            <span className="text-xs font-bold text-white truncate font-mono">
                              [{snip.category}/{snip.book_name} &gt; {snip.heading}]
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {snip.has_code && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-emerald-950/40 text-emerald-300 border border-emerald-800/60">
                                Code
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                              {snip.estimated_tokens} tok
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedSnippets((prev) => ({ ...prev, [idx]: !isExpanded }))}
                              className="text-slate-400 hover:text-white p-1"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Preview or Expanded Content */}
                        <pre className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                          {isExpanded ? snip.content : `${snip.preview}...`}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exact Injected Context Prompt Preview */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Compiled Model Prompt Context
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      The exact Markdown string assembled and prepended to the system prompt.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={copyInjectedContext}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    {copiedContext ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedContext ? 'Copied Context!' : 'Copy Injected Context'}</span>
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {simResult.formatted_context}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. NEW KNOWLEDGE BOOK MODAL                                          */}
      {/* ==================================================================== */}
      {showNewBookModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Create New Knowledge Book</h3>
              </div>
              <button
                onClick={() => setShowNewBookModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBook} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Target Canonical Domain
                </label>
                <select
                  value={newBookCategory}
                  onChange={(e) => setNewBookCategory(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                >
                  <option value="coding">coding (Syntax, algorithms, languages)</option>
                  <option value="frameworks">frameworks (FastAPI, React, testing)</option>
                  <option value="cloud">cloud (Docker, OCI, deployment)</option>
                  <option value="devops">devops (CI/CD, pipelines, monitoring)</option>
                  <option value="ai_ml">ai_ml (Ollama, models, weights)</option>
                  <option value="security">security (OAuth, JWT, hashing)</option>
                  <option value="databases">databases (SQLAlchemy, PostgreSQL, Redis)</option>
                  <option value="architecture">architecture (HLD, microservices)</option>
                  <option value="general">general (System notes, runbooks)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Book Filename
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. docker_compose_templates"
                  value={newBookName}
                  onChange={(e) => setNewBookName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                />
                <div className="text-[10px] text-slate-500 font-mono">
                  Will be saved as .agent_memory/books/{newBookCategory}/{newBookName || 'book_name'}.md
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Tags (Comma-Separated)
                </label>
                <input
                  type="text"
                  placeholder="docker, compose, container"
                  value={newBookTags}
                  onChange={(e) => setNewBookTags(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Initial Content
                </label>
                <textarea
                  rows={6}
                  value={newBookContent}
                  onChange={(e) => setNewBookContent(e.target.value)}
                  className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewBookModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBook}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50"
                >
                  {creatingBook ? 'Creating...' : 'Create Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
