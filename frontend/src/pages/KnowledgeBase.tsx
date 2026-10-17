import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ChevronUp,
  FileText,
  X,
  Clock,
  Tag,
  Play,
  Filter,
  ExternalLink,
  Edit3
} from 'lucide-react';

// ==============================================================================
// TYPE DEFINITIONS
// ==============================================================================

export interface BookSection {
  section_id: number;
  heading: string;
  content: string;
  has_code: boolean;
  estimated_tokens: number;
  keywords: string[];
}

export interface BookDetail {
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

export interface BookSummaryItem {
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

export interface CategoryRollup {
  book_count: number;
  total_tokens: number;
  total_bytes: number;
}

export interface BooksApiResponse {
  status: string;
  knowledge_telemetry: string;
  categories: Record<string, CategoryRollup>;
  books: BookSummaryItem[];
  total_books: number;
  total_tokens: number;
}

export interface MatchedSnippet {
  category: string;
  book_name: string;
  heading: string;
  score: number;
  estimated_tokens: number;
  has_code: boolean;
  preview: string;
  content: string;
}

export interface SimulationResponse {
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
  general: { label: 'General Knowledge', icon: FileText, color: 'text-slate-400', bg: 'bg-slate-900 border-slate-800' }
};

// Preset models for Context Injection Simulator
const PRESET_SIM_MODELS = [
  { id: 'qwen2.5-coder:1.5b', label: 'Local: qwen2.5-coder:1.5b (600 tok)', budget: 600, provider: 'OLLAMA' },
  { id: 'qwen2.5-coder:7b', label: 'Local: qwen2.5-coder:7b (1200 tok)', budget: 1200, provider: 'OLLAMA' },
  { id: 'qwen2.5-coder:32b', label: 'Local: qwen2.5-coder:32b (2000 tok)', budget: 2000, provider: 'OLLAMA' },
  { id: 'qwen-2.5-coder-32b', label: 'Groq: qwen-2.5-coder-32b (1500 tok)', budget: 1500, provider: 'GROQ' },
  { id: 'llama-3.3-70b-versatile', label: 'Groq: llama-3.3-70b-versatile (1500 tok)', budget: 1500, provider: 'GROQ' },
  { id: 'gemini-3.6-flash', label: 'Google: gemini-3.6-flash (3500 tok)', budget: 3500, provider: 'GOOGLE' },
  { id: 'gemini-2.5-pro', label: 'Google: gemini-2.5-pro (3500 tok)', budget: 3500, provider: 'GOOGLE' }
];

const SAMPLE_PROMPTS = [
  'Build a FastAPI endpoint with async SQLAlchemy session, CORS middleware and JWT auth.',
  'Implement React component with TypeScript, custom hook, and WebSocket live telemetry.',
  'Docker containerization with multi-stage build, SQLite persistence and uvicorn server.',
  'Operating system process threading with thread safety locks and non-blocking IO.'
];

export const KnowledgeBase: React.FC = () => {
  const navigate = useNavigate();

  // 3-Tab Mode Switcher
  const [activeTab, setActiveTab] = useState<'EXPLORER' | 'EDITOR' | 'SIMULATOR'>('EXPLORER');

  // Knowledge Inventory State
  const [booksData, setBooksData] = useState<BooksApiResponse | null>(null);
  const [loadingBooks, setLoadingBooks] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBookKey, setSelectedBookKey] = useState<{ category: string; book_name: string } | null>(null);

  // Active Selected Book Details
  const [activeBook, setActiveBook] = useState<BookDetail | null>(null);
  const [loadingActiveBook, setLoadingActiveBook] = useState<boolean>(false);
  const [bookFeedbackMsg, setBookFeedbackMsg] = useState<{ text: string; success: boolean } | null>(null);

  // Section Expansion State
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Inline Append Recipe State
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState<boolean>(false);
  const [recipeTitle, setRecipeTitle] = useState<string>('');
  const [recipeInsight, setRecipeInsight] = useState<string>('');
  const [recipeSnippet, setRecipeSnippet] = useState<string>('');
  const [recipeTags, setRecipeTags] = useState<string>('');
  const [addingRecipe, setAddingRecipe] = useState<boolean>(false);

  // Markdown Editor State
  const [editorContent, setEditorContent] = useState<string>('');
  const [editorTags, setEditorTags] = useState<string>('');
  const [savingBook, setSavingBook] = useState<boolean>(false);

  // New Book Modal State
  const [showNewBookModal, setShowNewBookModal] = useState<boolean>(false);
  const [newBookCategory, setNewBookCategory] = useState<string>('coding');
  const [newBookName, setNewBookName] = useState<string>('');
  const [newBookContent, setNewBookContent] = useState<string>('# New Knowledge Book\n\n## Overview\nDocumentation and operational patterns.\n');
  const [newBookTags, setNewBookTags] = useState<string>('general');
  const [creatingBook, setCreatingBook] = useState<boolean>(false);

  // Defrag State
  const [defragging, setDefragging] = useState<boolean>(false);

  // Simulator State
  const [simPrompt, setSimPrompt] = useState<string>(SAMPLE_PROMPTS[0]);
  const [simModel, setSimModel] = useState<string>('qwen2.5-coder:7b');
  const [simCustomBudget, setSimCustomBudget] = useState<string>('');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResponse | null>(null);
  const [copiedContext, setCopiedContext] = useState<boolean>(false);
  const [showFullPromptString, setShowFullPromptString] = useState<boolean>(false);
  const [expandedSimSnippets, setExpandedSimSnippets] = useState<Set<number>>(new Set());

  // Notification Toast Helper
  const showToast = (text: string, success = true) => {
    setBookFeedbackMsg({ text, success });
    setTimeout(() => {
      setBookFeedbackMsg(null);
    }, 4500);
  };

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

        // Auto-select first book if nothing selected
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
  // ACTIONS: SAVE, DELETE, APPEND RECIPE, CREATE, DEFRAG
  // ----------------------------------------------------------------------------
  const handleSaveBook = async () => {
    if (!activeBook) return;
    setSavingBook(true);
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
        showToast(`Book "${activeBook.book_name}" saved successfully.`, true);
        setActiveBook(data.book);
        fetchBooks();
      } else {
        showToast(data.detail || 'Failed to save book changes.', false);
      }
    } catch (err: any) {
      showToast(`Save error: ${err.message || err}`, false);
    } finally {
      setSavingBook(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!activeBook) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${activeBook.category}/${activeBook.book_name}"?`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `/api/memory/book/${encodeURIComponent(activeBook.category)}/${encodeURIComponent(activeBook.book_name)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        showToast(`Book "${activeBook.book_name}" deleted.`, true);
        setSelectedBookKey(null);
        setActiveBook(null);
        setActiveTab('EXPLORER');
        fetchBooks();
      } else {
        const data = await res.json();
        showToast(`Delete failed: ${data.detail || 'Unknown error'}`, false);
      }
    } catch (err: any) {
      showToast(`Delete error: ${err.message || err}`, false);
    }
  };

  const handleAppendRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBook || !recipeTitle.trim() || !recipeInsight.trim()) return;

    setAddingRecipe(true);
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
        setIsRecipeFormOpen(false);
        showToast(`Recipe "${recipeTitle}" appended successfully!`, true);
        fetchBooks();
      } else {
        showToast(data.detail || 'Failed to append recipe.', false);
      }
    } catch (err: any) {
      showToast(`Recipe error: ${err.message || err}`, false);
    } finally {
      setAddingRecipe(false);
    }
  };

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanName = newBookName.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
    if (!cleanName) return;
    if (!cleanName.endsWith('.md')) cleanName += '.md';

    setCreatingBook(true);
    try {
      const tagsList = newBookTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

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
        showToast(`Book "${cleanName}" created successfully!`, true);
        fetchBooks();
      } else {
        showToast(data.detail || 'Failed to create new book.', false);
      }
    } catch (err: any) {
      showToast(`Create error: ${err.message || err}`, false);
    } finally {
      setCreatingBook(false);
    }
  };

  const handleDefragment = async () => {
    setDefragging(true);
    try {
      const res = await fetch('/api/memory/defrag', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        showToast(data.message || 'Defragmentation complete.', true);
        fetchBooks();
      } else {
        showToast('Defragmentation failed.', false);
      }
    } catch (err) {
      showToast('Defragmentation network error.', false);
    } finally {
      setDefragging(false);
    }
  };

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
      } else {
        showToast('Simulation failed.', false);
      }
    } catch (err) {
      showToast('Simulation network error.', false);
    } finally {
      setSimulating(false);
    }
  };

  const handleCopyContext = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedContext(true);
    setTimeout(() => setCopiedContext(false), 2000);
  };

  // ----------------------------------------------------------------------------
  // SECTION EXPAND / COLLAPSE HELPERS
  // ----------------------------------------------------------------------------
  const toggleSection = (id: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSections = () => {
    if (!activeBook?.sections) return;
    if (expandedSections.size === activeBook.sections.length) {
      setExpandedSections(new Set());
    } else {
      setExpandedSections(new Set(activeBook.sections.map((s) => s.section_id)));
    }
  };

  const toggleSimSnippet = (idx: number) => {
    setExpandedSimSnippets((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ----------------------------------------------------------------------------
  // FILTERED BOOKS
  // ----------------------------------------------------------------------------
  const filteredBooks = useMemo(() => {
    if (!booksData?.books) return [];
    return booksData.books.filter((b) => {
      if (selectedCategory !== 'all' && b.category !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = b.title.toLowerCase().includes(q) || b.book_name.toLowerCase().includes(q);
        const matchCategory = b.category.toLowerCase().includes(q);
        const matchTags = (b.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchCategory && !matchTags) return false;
      }
      return true;
    });
  }, [booksData, selectedCategory, searchQuery]);

  // Total Section Count across all books
  const totalSectionsCount = useMemo(() => {
    if (!booksData?.books) return 0;
    return booksData.books.reduce((sum, b) => sum + (b.section_count || 0), 0);
  }, [booksData]);

  return (
    <div id="knowledge-base-page" className="space-y-6 pb-12 font-sans">
      {/* Toast Feedback */}
      {bookFeedbackMsg && (
        <div
          id="kb-toast"
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-mono transition-all animate-bounce ${
            bookFeedbackMsg.success
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-glow-emerald'
              : 'bg-rose-950/90 text-rose-300 border-rose-500/50'
          }`}
        >
          {bookFeedbackMsg.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{bookFeedbackMsg.text}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. COMPACT TOP CONTROL BAR & INVENTORY TELEMETRY               */}
      {/* ------------------------------------------------------------- */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900/90 to-cyan-950/40 border border-blue-500/20 p-4 sm:p-5 backdrop-blur shadow-2xl">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Title & Live Inventory Pill */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-300">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Knowledge Base & Memory Index</span>
            </span>

            {/* Inventory Telemetry Pill */}
            <span
              id="kb-telemetry-pill"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300"
            >
              <span>
                📚 <strong className="text-white">{booksData?.total_books || 0}</strong> Books
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-cyan-400 font-bold">{totalSectionsCount} Sections</span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-emerald-400 font-bold">
                {(booksData?.total_tokens || 0).toLocaleString()} Tokens
              </span>
            </span>
          </div>

          {/* Right: Quick-Controls (Category Dropdown, Search, Actions) */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Category Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 text-[11px] hidden sm:inline">Category:</span>
              <select
                id="kb-category-select"
                aria-label="Filter Category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-blue-300 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="all" className="bg-slate-900 text-slate-200">All Categories</option>
                {Object.keys(CANONICAL_CATEGORIES_META)
                  .filter((k) => k !== 'all')
                  .map((catKey) => (
                    <option key={catKey} value={catKey} className="bg-slate-900 text-slate-200">
                      {CANONICAL_CATEGORIES_META[catKey]?.label || catKey}
                    </option>
                  ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search books & tags..."
                className="bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-3 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 w-36 sm:w-48"
              />
            </div>

            {/* + New Book Button */}
            <button
              id="new-book-btn"
              onClick={() => setShowNewBookModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-mono font-semibold transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Book</span>
            </button>

            {/* Defrag Button */}
            <button
              id="defrag-memory-btn"
              onClick={handleDefragment}
              disabled={defragging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-mono transition-all disabled:opacity-50"
              title="Defragment and index memory ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${defragging ? 'animate-spin' : ''}`} />
              <span>{defragging ? 'Defragging...' : 'Defrag'}</span>
            </button>

            {/* Global Logs Shortcut */}
            <button
              id="kb-nav-logs-btn"
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
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. 3-TAB MODE SWITCHER BAR                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          id="tab-explorer-btn"
          onClick={() => setActiveTab('EXPLORER')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'EXPLORER'
              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span>Book Explorer & Recipes</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-blue-300 border border-blue-500/30">
            {filteredBooks.length} Books
          </span>
        </button>

        <button
          id="tab-editor-btn"
          onClick={() => setActiveTab('EDITOR')}
          disabled={!activeBook}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'EDITOR'
              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Edit3 className="w-4 h-4 text-cyan-400" />
          <span>Raw Markdown Editor</span>
          {activeBook && (
            <span className="ml-1 text-[11px] font-mono text-slate-400 hidden md:inline">
              ({activeBook.book_name})
            </span>
          )}
        </button>

        <button
          id="tab-simulator-btn"
          onClick={() => setActiveTab('SIMULATOR')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'SIMULATOR'
              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30 shadow-glow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          }`}
        >
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>Precision Context Simulator</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TAB 1: BOOK EXPLORER & RECIPES (SPLIT-PANE)                */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'EXPLORER' && (
        <div id="tab-explorer-content" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Sidebar List: Compact Book Rows (Cols 1-4) */}
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center justify-between px-2 text-xs font-mono text-slate-400">
              <span>Catalog ({filteredBooks.length})</span>
              <span>Sorted by category</span>
            </div>

            <div className="space-y-1.5 max-h-[700px] overflow-y-auto pr-1">
              {filteredBooks.length === 0 ? (
                <div className="p-6 text-center text-slate-500 font-mono text-xs rounded-xl border border-slate-800 bg-slate-950/40">
                  No books match current search or category filter.
                </div>
              ) : (
                filteredBooks.map((b) => {
                  const isSelected =
                    selectedBookKey?.category === b.category && selectedBookKey?.book_name === b.book_name;

                  return (
                    <div
                      key={`${b.category}/${b.book_name}`}
                      onClick={() => setSelectedBookKey({ category: b.category, book_name: b.book_name })}
                      className={`glass-panel p-3 rounded-xl border transition-all cursor-pointer font-mono text-xs space-y-1.5 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-950/30 shadow-glow-sm'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-white text-xs truncate" title={b.title}>
                          {b.title || b.book_name}
                        </h4>
                        <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
                          {b.category}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="text-slate-500 truncate text-[10px]">{b.book_name}</span>
                        <span className="text-cyan-300 font-semibold shrink-0">
                          {b.section_count || 0} sec &bull; {((b.estimated_tokens || 0) / 1000).toFixed(1)}K tok
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Workspace: Selected Book Sections (Cols 5-12) */}
          <div className="lg:col-span-8 space-y-4">
            {loadingActiveBook ? (
              <div className="p-12 text-center text-slate-400 font-mono text-xs rounded-2xl border border-slate-800 bg-slate-950/40 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                <span>Loading active book sections...</span>
              </div>
            ) : !activeBook ? (
              <div className="p-12 text-center text-slate-500 font-mono text-xs rounded-2xl border border-slate-800 bg-slate-950/40">
                Select a knowledge book from the catalog to view parsed section insights.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Book Workspace Header Card */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 font-mono text-xs space-y-3 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{activeBook.title}</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-950 text-blue-300 border border-blue-800">
                          {activeBook.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Path: <span className="text-slate-300">{activeBook.category}/{activeBook.book_name}</span> &bull; {activeBook.estimated_tokens} tokens
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setActiveTab('EDITOR')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Open in Editor</span>
                      </button>

                      <button
                        onClick={() => setIsRecipeFormOpen(!isRecipeFormOpen)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Append Recipe</span>
                        {isRecipeFormOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Tags Pill Row & Global Expand Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500">Tags:</span>
                      {(activeBook.tags || []).map((t, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          #{t}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={toggleAllSections}
                      className="text-slate-400 hover:text-white transition-colors text-[10px] underline"
                    >
                      {expandedSections.size === (activeBook.sections?.length || 0)
                        ? 'Collapse All Sections'
                        : 'Expand All Sections'}
                    </button>
                  </div>
                </div>

                {/* Collapsible Inline Recipe Form */}
                {isRecipeFormOpen && (
                  <form
                    onSubmit={handleAppendRecipe}
                    className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 font-mono text-xs space-y-3 shadow-xl animate-fadeIn"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span>Append Operational Recipe Section</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsRecipeFormOpen(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Recipe / Pattern Heading</label>
                      <input
                        type="text"
                        value={recipeTitle}
                        onChange={(e) => setRecipeTitle(e.target.value)}
                        placeholder="e.g. Asynchronous Database Session Lifespan"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Operational Guidance & Context</label>
                      <textarea
                        value={recipeInsight}
                        onChange={(e) => setRecipeInsight(e.target.value)}
                        placeholder="Explain the architectural pattern, why it works, and pitfalls to avoid..."
                        rows={3}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Executable Code Snippet (Optional)</label>
                      <textarea
                        value={recipeSnippet}
                        onChange={(e) => setRecipeSnippet(e.target.value)}
                        placeholder="// paste verified syntax implementation..."
                        rows={3}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <input
                        type="text"
                        value={recipeTags}
                        onChange={(e) => setRecipeTags(e.target.value)}
                        placeholder="Tags: async, db, lifespan"
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 w-60"
                      />

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsRecipeFormOpen(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={addingRecipe}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all disabled:opacity-50"
                        >
                          {addingRecipe ? 'Appending...' : 'Append Recipe'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Collapsible Section Cards */}
                <div className="space-y-2.5 font-mono text-xs">
                  {(!activeBook.sections || activeBook.sections.length === 0) ? (
                    <div className="p-8 text-center text-slate-500 rounded-xl border border-slate-800 bg-slate-950/40">
                      No discrete markdown sections parsed in this book yet.
                    </div>
                  ) : (
                    activeBook.sections.map((section) => {
                      const isExpanded = expandedSections.has(section.section_id);

                      return (
                        <div
                          key={section.section_id}
                          className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden transition-all shadow-sm"
                        >
                          {/* Collapsed Header (4 Concise Items) */}
                          <div
                            onClick={() => toggleSection(section.section_id)}
                            className="flex items-center justify-between px-4 py-3 bg-slate-900/80 hover:bg-slate-900 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 truncate max-w-lg">
                              <span className="text-slate-500 text-[10px]">#{section.section_id}</span>
                              <span className="font-bold text-white text-xs truncate">
                                {section.heading}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {section.has_code && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
                                  <Code className="w-2.5 h-2.5" /> CODE
                                </span>
                              )}

                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-emerald-400 border border-slate-800">
                                {section.estimated_tokens} tok
                              </span>

                              <button className="text-slate-400 hover:text-white">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Content Drawer */}
                          {isExpanded && (
                            <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950">
                              {section.keywords && section.keywords.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-slate-500 text-[10px]">Keywords:</span>
                                  {section.keywords.map((kw, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 text-[10px] border border-slate-800/80"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 overflow-x-auto text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                                {section.content}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. TAB 2: RAW MARKDOWN EDITOR                                 */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'EDITOR' && (
        <div id="tab-editor-content" className="space-y-4 font-mono text-xs">
          {!activeBook ? (
            <div className="p-12 text-center text-slate-500 rounded-2xl border border-slate-800 bg-slate-950/40">
              Select a book in the Explorer tab before opening the raw editor.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-cyan-400" />
                    <span>Editing: {activeBook.category}/{activeBook.book_name}</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Direct markdown editing with atomic memory defragmentation on save.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteBook}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-800/60 text-xs transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Book</span>
                  </button>

                  <button
                    onClick={handleSaveBook}
                    disabled={savingBook}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingBook ? 'Saving...' : 'Save Book Changes'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Index Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={editorTags}
                  onChange={(e) => setEditorTags(e.target.value)}
                  placeholder="e.g. coding, fastapi, backend, routing"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Raw Markdown Content</label>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  rows={20}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-blue-500 shadow-inner"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. TAB 3: PRECISION CONTEXT SIMULATOR                         */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'SIMULATOR' && (
        <div id="tab-simulator-content" className="space-y-4 font-mono text-xs">
          {/* Simulator Control Strip */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-white text-xs">Target Model Engine & Injection Budget</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Target Model Selector */}
                <select
                  value={simModel}
                  onChange={(e) => setSimModel(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-purple-300 font-bold focus:outline-none text-xs"
                >
                  {PRESET_SIM_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-slate-200">
                      {m.label}
                    </option>
                  ))}
                </select>

                {/* Custom Token Budget Override */}
                <input
                  type="number"
                  value={simCustomBudget}
                  onChange={(e) => setSimCustomBudget(e.target.value)}
                  placeholder="Custom Budget (tok)"
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 w-36 text-xs focus:outline-none focus:border-purple-500"
                />

                {/* Run Simulation Button */}
                <button
                  onClick={handleRunSimulation}
                  disabled={simulating || !simPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${simulating ? 'animate-pulse' : ''}`} />
                  <span>{simulating ? 'Simulating...' : 'Run Simulation'}</span>
                </button>
              </div>
            </div>

            {/* Directive Prompt Input & Sample Prompt Chips */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 text-[11px]">Directive Prompt to Ground:</label>
              <textarea
                value={simPrompt}
                onChange={(e) => setSimPrompt(e.target.value)}
                rows={2}
                placeholder="Enter user prompt or sub-goal directive..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-purple-500"
              />

              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-slate-500 text-[10px]">Sample Prompts:</span>
                {SAMPLE_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSimPrompt(p)}
                    className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white text-[10px] transition-colors truncate max-w-xs"
                    title={p}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Simulation Output */}
          {simResult && (
            <div className="space-y-4 animate-fadeIn">
              {/* Optimization Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Target Budget</span>
                  <span className="text-base font-bold text-white">{simResult.token_budget} tok</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Injected Tokens</span>
                  <span className="text-base font-bold text-purple-300">{simResult.injected_tokens} tok</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Raw Catalog Tokens</span>
                  <span className="text-base font-bold text-slate-400">{simResult.full_books_tokens} tok</span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 shadow-glow-emerald">
                  <span className="text-emerald-400 block text-[10px] font-bold">Token Savings</span>
                  <span className="text-base font-bold text-emerald-300">
                    {Math.round((simResult.tokens_saved / Math.max(simResult.full_books_tokens, 1)) * 100)}% Saved
                  </span>
                </div>
              </div>

              {/* Matched Snippet Cards */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Matched Knowledge Snippets ({simResult.matched_snippets?.length || 0})</span>
                  <button
                    onClick={() => setShowFullPromptString(!showFullPromptString)}
                    className="text-purple-300 hover:text-white underline text-[11px]"
                  >
                    {showFullPromptString ? 'Hide Prompt String' : 'View Compiled Prompt String'}
                  </button>
                </div>

                {/* Collapsible Full Prompt String Drawer */}
                {showFullPromptString && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/40 space-y-2 shadow-inner">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-300 text-[11px]">Compiled Injection String</span>
                      <button
                        onClick={() => handleCopyContext(simResult.formatted_context)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                      >
                        {copiedContext ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedContext ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-900 rounded-lg text-slate-300 text-[11px] max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">
                      {simResult.formatted_context}
                    </pre>
                  </div>
                )}

                {/* Snippets List */}
                <div className="space-y-2">
                  {simResult.matched_snippets.map((snippet, idx) => {
                    const isExpanded = expandedSimSnippets.has(idx);

                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden"
                      >
                        <div
                          onClick={() => toggleSimSnippet(idx)}
                          className="flex items-center justify-between p-3 bg-slate-900/60 hover:bg-slate-900 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate max-w-lg">
                            <span className="text-slate-500 text-[10px]">#{idx + 1}</span>
                            <span className="text-purple-300 font-bold">{snippet.category}/{snippet.book_name}</span>
                            <span className="text-slate-400">&bull;</span>
                            <span className="text-white truncate">{snippet.heading}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                              Score: {snippet.score}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-emerald-400 border border-slate-800">
                              {snippet.estimated_tokens} tok
                            </span>
                            <button className="text-slate-400 hover:text-white">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-3 border-t border-slate-800 bg-slate-950 text-slate-300 text-[11px] whitespace-pre-wrap leading-relaxed">
                            {snippet.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. MODAL: CREATE NEW BOOK                                      */}
      {/* ------------------------------------------------------------- */}
      {showNewBookModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Create Knowledge Book</span>
              </h3>
              <button
                onClick={() => setShowNewBookModal(false)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBook} className="space-y-3">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Category</label>
                <select
                  value={newBookCategory}
                  onChange={(e) => setNewBookCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {Object.keys(CANONICAL_CATEGORIES_META)
                    .filter((k) => k !== 'all')
                    .map((catKey) => (
                      <option key={catKey} value={catKey} className="bg-slate-900 text-slate-200">
                        {CANONICAL_CATEGORIES_META[catKey]?.label || catKey}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Book Name (filename)</label>
                <input
                  type="text"
                  value={newBookName}
                  onChange={(e) => setNewBookName(e.target.value)}
                  placeholder="e.g. system_architecture.md"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Initial Markdown Content</label>
                <textarea
                  value={newBookContent}
                  onChange={(e) => setNewBookContent(e.target.value)}
                  rows={6}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={newBookTags}
                  onChange={(e) => setNewBookTags(e.target.value)}
                  placeholder="e.g. core, architecture, v6"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewBookModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBook}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all disabled:opacity-50"
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
