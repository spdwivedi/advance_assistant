import os
import json
import glob
import time
import re
import ollama
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from src.logger import log_action
from src.config import SEARCH_DATA_DIR, LOCAL_ORCHESTRATOR_MODEL, LOCAL_WORKER_MODEL

# Define Indian Standard Time (IST: UTC + 5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Returns formatted time string explicitly anchored to Indian Standard Time (IST)."""
    return datetime.now(IST).strftime(fmt)

def _get_file_mtime_ist(filepath: str) -> str:
    """Returns file last modified time in IST format."""
    try:
        mtime = os.path.getmtime(filepath)
        dt = datetime.fromtimestamp(mtime, tz=IST)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return get_ist_now_str()

# Base path definitions for persistent memory
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MEMORY_DIR = os.path.join(PROJECT_ROOT, ".agent_memory") if os.path.exists(os.path.join(PROJECT_ROOT, ".agent_memory")) else os.path.abspath("./.agent_memory")
BOOKS_DIR = os.path.join(MEMORY_DIR, "books")

CATALOG_INDEX_FILE = os.path.join(MEMORY_DIR, "catalog_index.json")
TOOL_CATALOG_FILE = os.path.join(MEMORY_DIR, "tool_catalog.json")
ENV_HISTORY_FILE = os.path.join(MEMORY_DIR, "env_history.json")
PROFILES_FILE = os.path.join(MEMORY_DIR, "execution_profiles.json")

# Canonical Categories (9 Canonical Domains + Legacy Categories)
CANONICAL_CATEGORIES = [
    "coding", "frameworks", "cloud", "devops", "ai_ml",
    "security", "databases", "architecture", "general",
    "tools", "tech_stack", "environment", "history",
    "cs_fundamentals", "design_patterns"
]

# Canonical Master Topic Books Mapping
CANONICAL_TOPIC_MAP = {
    "coding": ["fastapi.md", "react_typescript.md", "sqlalchemy.md", "python_async.md", "general_coding.md"],
    "frameworks": ["web_frameworks.md", "testing_automation.md"],
    "tools": ["developer_tools.md", "automation_bridges.md"],
    "cloud": ["cloud_deployment.md", "containerization.md"],
    "devops": ["ci_cd_pipelines.md", "docker_k8s.md"],
    "ai_ml": ["ollama_models.md", "prompt_engineering.md"],
    "security": ["auth_standards.md", "vulnerability_prevention.md"],
    "databases": ["relational_sql.md", "caching_redis.md"],
    "architecture": ["system_architecture.md", "microservices.md"],
    "general": ["system_overview.md"],
    "tech_stack": ["system_architecture.md"],
    "environment": ["environment_configuration.md"],
    "history": ["execution_history.md"],
    "cs_fundamentals": ["operating_systems.md", "data_structures_algorithms.md", "computer_networks.md"],
    "design_patterns": ["low_level_design.md", "high_level_design.md"]
}

# Ensure all category directory structures exist
os.makedirs(BOOKS_DIR, exist_ok=True)
for category in CANONICAL_CATEGORIES:
    os.makedirs(os.path.join(BOOKS_DIR, category), exist_ok=True)


# Common stop words to exclude during keyword extraction
STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "will", "can", "has", "have", "had", "not", "but", "what", "which", "when",
    "where", "who", "whom", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "than", "too", "very", "about", "above",
    "after", "again", "against", "between", "into", "through", "during", "before",
    "under", "below", "down", "out", "off", "over", "then", "once",
    "here", "there", "why", "now", "our", "their", "your", "its", "you", "they",
    "using", "used", "uses", "use", "make", "made", "makes", "does", "done", "doing",
    "could", "would", "should", "also", "into", "onto", "upon"
}


def extract_keywords(text: str) -> List[str]:
    """Extracts unique lowercase keywords filtering out stop words and short tokens."""
    if not text:
        return []
    words = re.findall(r'[a-zA-Z0-9_\-\.]+', text.lower())
    seen = set()
    keywords = []
    for w in words:
        clean = w.strip(".-_")
        if len(clean) >= 3 and clean not in STOPWORDS and clean not in seen and not clean.isdigit():
            seen.add(clean)
            keywords.append(clean)
    return keywords


def _resolve_book_path(category: str, book_name: str) -> str:
    """
    Strict path helper that sanitizes category and book_name, ensures the .md extension,
    and blocks path traversal outside .agent_memory/books/.
    """
    if not category or not category.strip():
        category = "general"
    category = category.strip().lower()

    if not book_name or not book_name.strip():
        raise ValueError("Book name cannot be empty")

    book_name = book_name.strip()
    if not book_name.endswith(".md"):
        book_name += ".md"

    # Block path traversal attempts
    if ".." in category or "/" in category or "\\" in category:
        raise ValueError("Path traversal attempt in category")
    if ".." in book_name or "/" in book_name or "\\" in book_name:
        raise ValueError("Path traversal attempt in book name")

    base_name = book_name[:-3].strip()
    if not base_name:
        raise ValueError("Book name cannot be empty")

    books_dir_abs = os.path.abspath(BOOKS_DIR)
    target_path = os.path.abspath(os.path.join(BOOKS_DIR, category, book_name))

    if not target_path.startswith(books_dir_abs):
        raise ValueError(f"Path traversal detected: {target_path} is outside {books_dir_abs}")

    return target_path


def parse_book_sections(category: str, book_name: str) -> List[Dict[str, Any]]:
    """
    Splits a book's Markdown content by ## and ### headings into discrete,
    self-contained knowledge blocks with heading, content, code flag,
    estimated tokens, and extracted keywords.
    """
    try:
        book_path = _resolve_book_path(category, book_name)
    except Exception:
        return []

    if not os.path.exists(book_path):
        return []

    try:
        with open(book_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return []

    if not content or not content.strip():
        return []

    lines = content.splitlines(keepends=True)
    raw_sections = []
    current_heading = "Overview"
    current_lines = []

    for line in lines:
        heading_match = re.match(r'^(#{2,3})\s+(.+)$', line.strip())
        if heading_match:
            if current_lines:
                sec_text = "".join(current_lines).strip()
                if sec_text:
                    raw_sections.append((current_heading, sec_text))
            current_heading = heading_match.group(2).strip()
            current_lines = [line]
        else:
            if not current_lines and line.strip().startswith("# "):
                current_heading = line.strip()[2:].strip()
            current_lines.append(line)

    if current_lines:
        sec_text = "".join(current_lines).strip()
        if sec_text:
            raw_sections.append((current_heading, sec_text))

    sections = []
    for idx, (heading, sec_content) in enumerate(raw_sections):
        sections.append({
            "section_id": idx,
            "heading": heading,
            "content": sec_content,
            "has_code": "```" in sec_content,
            "estimated_tokens": max(1, len(sec_content) // 4),
            "keywords": extract_keywords(sec_content)
        })

    return sections


def get_model_token_budget(model_name: str) -> int:
    """
    Determines optimal token budget based on target model scale:
    - Small Local Models (0.5b - 4b): 600 tokens max.
    - Standard Local Models (7b - 16b): 1200 tokens max.
    - Heavy Local Models (20b - 70b): 2000 tokens max.
    - Cloud Gemini Models: 3500 tokens max.
    - Default fallback: 1200 tokens.
    """
    m_lower = (model_name or "").lower()
    if "gemini" in m_lower:
        return 3500
    if any(size in m_lower for size in [":0.5b", ":1.5b", ":2b", ":3b", ":4b", "-0.5b", "-1.5b", "-2b", "-3b", "-4b"]):
        return 600
    if any(size in m_lower for size in [":20b", ":22b", ":32b", ":34b", ":70b", "-20b", "-22b", "-32b", "-34b", "-70b"]):
        return 2000
    if any(size in m_lower for size in [":7b", ":8b", ":9b", ":11b", ":12b", ":14b", ":16b", "-7b", "-8b", "-9b", "-11b", "-12b", "-14b", "-16b"]):
        return 1200
    return 1200


def get_precision_context(
    prompt: str,
    model_name: str = "qwen2.5-coder:7b",
    max_tokens: Optional[int] = None
) -> Dict[str, Any]:
    """
    Model-aware precision snippet retriever:
    - Calculates optimal token budget according to target model scale.
    - Scans all books across .agent_memory/books/, parses markdown sections.
    - Scores each section using weighted keyword overlaps (heading 3x, category/book 2.5x, body 1x, code bonus +1.5).
    - Top sections are compiled within the budget limit.
    - Computes full_books_tokens and tokens_saved.
    """
    budget = max_tokens if (max_tokens is not None and max_tokens > 0) else get_model_token_budget(model_name)
    query_keywords = extract_keywords(prompt)
    prompt_lower = (prompt or "").lower()

    coding_intent_keywords = {
        "code", "implement", "implementation", "function", "class", "script",
        "syntax", "python", "fastapi", "react", "sql", "bug", "error", "async",
        "api", "test", "component", "ts", "tsx", "database", "orm", "service"
    }
    has_coding_intent = any(k in prompt_lower for k in coding_intent_keywords)

    candidates = []
    books_full_tokens_map = {}

    cat_dirs = glob.glob(f"{BOOKS_DIR}/*")
    for cat_dir in cat_dirs:
        if not os.path.isdir(cat_dir):
            continue
        cat_name = os.path.basename(cat_dir)
        book_files = glob.glob(f"{cat_dir}/*.md")

        for bf in book_files:
            b_name = os.path.basename(bf)
            if b_name.startswith(".") or len(b_name) <= 3:
                continue

            try:
                full_size = os.path.getsize(bf)
                books_full_tokens_map[(cat_name, b_name)] = max(1, full_size // 4)
            except Exception:
                books_full_tokens_map[(cat_name, b_name)] = 100

            sections = parse_book_sections(cat_name, b_name)
            cat_book_text = f"{cat_name} {b_name.replace('_', ' ').replace('.md', '')}".lower()

            for sec in sections:
                score = 0.0
                heading_kws = set(extract_keywords(sec["heading"]))
                sec_kws = set(sec.get("keywords", []))

                # Heading keyword overlap (3x weight)
                heading_matches = sum(
                    1 for qk in query_keywords
                    if qk in heading_kws or any(qk in hk or hk in qk for hk in heading_kws)
                )
                score += heading_matches * 3.0

                # Category / book name keyword overlap (2.5x weight)
                cat_matches = sum(1 for qk in query_keywords if qk in cat_book_text)
                score += cat_matches * 2.5

                # Section body keyword overlap (1.0x weight)
                body_matches = sum(1 for qk in query_keywords if qk in sec_kws)
                score += body_matches * 1.0

                # Code block bonus (+1.5) if coding intent is present
                if sec.get("has_code") and has_coding_intent and score > 0:
                    score += 1.5

                if score > 0:
                    candidates.append({
                        "category": cat_name,
                        "book_name": b_name,
                        "heading": sec["heading"],
                        "score": round(score, 2),
                        "estimated_tokens": sec["estimated_tokens"],
                        "has_code": sec["has_code"],
                        "preview": sec["content"][:400],
                        "content": sec["content"]
                    })

    # Sort candidates by score descending
    candidates.sort(key=lambda x: x["score"], reverse=True)

    matched_snippets = []
    total_injected_tokens = 0
    matched_books = set()

    for cand in candidates:
        tokens = cand["estimated_tokens"]
        if total_injected_tokens + tokens <= budget or not matched_snippets:
            matched_snippets.append(cand)
            total_injected_tokens += tokens
            matched_books.add((cand["category"], cand["book_name"]))
            if total_injected_tokens >= budget:
                break

    full_books_tokens = sum(books_full_tokens_map.get(b, 0) for b in matched_books)
    tokens_saved = max(0, full_books_tokens - total_injected_tokens)

    snippet_blocks = []
    for s in matched_snippets:
        snippet_blocks.append(
            f"### Context Snippet: [{s['category'].upper()}/{s['book_name']} > {s['heading']}] (Relevance: {s['score']})\n{s['content']}"
        )
    compiled_markdown = "\n\n".join(snippet_blocks)

    return {
        "formatted_context": compiled_markdown,
        "model_name": model_name,
        "token_budget": budget,
        "injected_tokens": total_injected_tokens,
        "full_books_tokens": full_books_tokens,
        "tokens_saved": tokens_saved,
        "matched_snippets": matched_snippets
    }


def _load_json(filepath: str, default_data: dict) -> dict:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default_data
    return default_data


def _save_json(filepath: str, data: dict):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def rebuild_catalog_index() -> dict:
    existing = _load_json(CATALOG_INDEX_FILE, {})
    tags_index = existing.get("tags_index", {})

    catalog = {
        "last_updated": get_ist_now_str(),
        "root_docs": [],
        "categories": {},
        "tags_index": tags_index
    }
    for root_file in glob.glob(f"{MEMORY_DIR}/*.md"):
        filename = os.path.basename(root_file)
        catalog["root_docs"].append({
            "filename": filename,
            "path": root_file,
            "size_bytes": os.path.getsize(root_file)
        })
    for cat_dir in glob.glob(f"{BOOKS_DIR}/*"):
        if os.path.isdir(cat_dir):
            category_name = os.path.basename(cat_dir)
            catalog["categories"][category_name] = []
            for book_file in glob.glob(f"{cat_dir}/*.md"):
                b_name = os.path.basename(book_file)
                if b_name.startswith(".") or len(b_name) <= 3:
                    continue
                size_b = os.path.getsize(book_file)
                catalog["categories"][category_name].append({
                    "title": b_name.replace(".md", "").replace("_", " ").title(),
                    "filename": b_name,
                    "path": book_file,
                    "size_bytes": size_b,
                    "estimated_tokens": max(1, size_b // 4),
                    "last_modified": _get_file_mtime_ist(book_file),
                    "tags": tags_index.get(f"{category_name}/{b_name}", [category_name])
                })
    _save_json(CATALOG_INDEX_FILE, catalog)
    return catalog


def get_catalog_index() -> dict:
    if not os.path.exists(CATALOG_INDEX_FILE):
        return rebuild_catalog_index()
    return _load_json(CATALOG_INDEX_FILE, {})


def get_knowledge_base_telemetry() -> str:
    catalog = get_catalog_index()
    categories = catalog.get("categories", {})
    total_books = sum(len(books) for books in categories.values())
    total_categories = len(categories)
    return f"{total_books} Unified Topic Books | {total_categories} Categories Indexed"


def _load_raw_memory_books(user_prompt: str) -> str:
    """Legacy full-book loader kept as safe fallback."""
    catalog = get_catalog_index()
    loaded_context = []
    prompt_lower = user_prompt.lower()
    selected_categories = set()

    if any(kw in prompt_lower for kw in ["code", "python", "fastapi", "react", "vite", "bug", "fix", "syntax", "task", "note"]):
        selected_categories.add("coding")
        selected_categories.add("frameworks")
        selected_categories.add("tech_stack")
    if any(kw in prompt_lower for kw in ["tool", "aider", "n8n", "roocode", "antigravity", "mcp", "vision"]):
        selected_categories.add("tools")
    if any(kw in prompt_lower for kw in ["cloud", "gemini", "deploy", "docker", "oci", "tunnel"]):
        selected_categories.add("cloud")
    if any(kw in prompt_lower for kw in ["history", "previous", "last run", "build", "log"]):
        selected_categories.add("history")
    if any(kw in prompt_lower for kw in ["os", "kernel", "dsa", "algorithm", "tree", "graph", "network", "sql", "db"]):
        selected_categories.add("cs_fundamentals")
    if any(kw in prompt_lower for kw in ["lld", "hld", "architecture", "pattern", "singleton", "solid", "design"]):
        selected_categories.add("design_patterns")

    selected_categories.add("environment")

    arch_path = os.path.join(MEMORY_DIR, "ARCHITECTURE.md")
    if os.path.exists(arch_path):
        with open(arch_path, "r", encoding="utf-8") as f:
            loaded_context.append(f"--- SYSTEM ARCHITECTURE ---\n{f.read().strip()}")

    categories_data = catalog.get("categories", {})
    for cat in selected_categories:
        books = categories_data.get(cat, [])
        for book in books:
            b_path = book.get("path")
            if b_path and os.path.exists(b_path):
                try:
                    with open(b_path, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                        if content:
                            loaded_context.append(f"--- BOOK [{cat.upper()}/{book['filename']}] ---\n{content}")
                except Exception:
                    pass

    return "\n\n".join(loaded_context) if loaded_context else "No prior specific memory books matched."


def get_contextual_memory(
    prompt: str,
    model_name: Optional[str] = None,
    max_tokens: Optional[int] = None
) -> str:
    """
    Returns precision high-signal contextual memory snippets for the prompt,
    falling back gracefully to legacy book loading if no precision snippets match.
    """
    try:
        model = model_name or LOCAL_ORCHESTRATOR_MODEL
        ctx = get_precision_context(prompt, model_name=model, max_tokens=max_tokens)
        if ctx.get("matched_snippets") and ctx.get("formatted_context"):
            return ctx["formatted_context"]
    except Exception as e:
        log_action("MEMORY_MANAGER", "PRECISION_CONTEXT_FALLBACK", {"error": str(e)})

    return _load_raw_memory_books(prompt)


def load_relevant_memory_books(
    user_prompt: str,
    model_name: Optional[str] = None,
    max_tokens: Optional[int] = None
) -> str:
    """
    Unified knowledge retrieval interface. Attempts precision snippet retrieval first;
    falls back to full book loading if no snippet match is found. Preserves 100% backward
    compatibility for existing 1-argument callers in src/agent.py and src/main.py.
    """
    return get_contextual_memory(user_prompt, model_name=model_name, max_tokens=max_tokens)


def list_all_books_detailed() -> Dict[str, Any]:
    """
    Scans all categories and .md files in .agent_memory/books/,
    returning category summaries, book list with category, book_name, size_bytes,
    estimated_tokens, section_count, last_modified, tags, and summary preview.
    """
    catalog = get_catalog_index()
    tags_index = catalog.get("tags_index", {})

    all_books = []
    category_map = {}

    for cat in CANONICAL_CATEGORIES:
        category_map[cat] = {"book_count": 0, "total_tokens": 0, "total_bytes": 0}

    for cat_dir in sorted(glob.glob(f"{BOOKS_DIR}/*")):
        if not os.path.isdir(cat_dir):
            continue
        cat_name = os.path.basename(cat_dir)
        if cat_name not in category_map:
            category_map[cat_name] = {"book_count": 0, "total_tokens": 0, "total_bytes": 0}

        for bf in sorted(glob.glob(f"{cat_dir}/*.md")):
            b_name = os.path.basename(bf)
            if b_name.startswith(".") or len(b_name) <= 3:
                continue

            try:
                size_bytes = os.path.getsize(bf)
                est_tokens = max(1, size_bytes // 4)
                mtime_str = _get_file_mtime_ist(bf)

                sections = parse_book_sections(cat_name, b_name)
                section_count = len(sections)
                summary = ""
                if sections:
                    summary = sections[0]["content"][:250].strip()
                else:
                    try:
                        with open(bf, "r", encoding="utf-8") as f:
                            summary = f.read(250).strip()
                    except Exception:
                        summary = ""

                book_key = f"{cat_name}/{b_name}"
                book_tags = tags_index.get(book_key, [cat_name])

                book_entry = {
                    "category": cat_name,
                    "book_name": b_name,
                    "title": b_name.replace(".md", "").replace("_", " ").title(),
                    "size_bytes": size_bytes,
                    "estimated_tokens": est_tokens,
                    "section_count": section_count,
                    "last_modified": mtime_str,
                    "tags": book_tags,
                    "summary": summary
                }
                all_books.append(book_entry)

                category_map[cat_name]["book_count"] += 1
                category_map[cat_name]["total_tokens"] += est_tokens
                category_map[cat_name]["total_bytes"] += size_bytes
            except Exception:
                continue

    total_books = len(all_books)
    total_tokens = sum(b["estimated_tokens"] for b in all_books)

    return {
        "categories": category_map,
        "books": all_books,
        "total_books": total_books,
        "total_tokens": total_tokens
    }


def read_book_content(category: str, book_name: str) -> Dict[str, Any]:
    """
    Reads and returns the full raw Markdown string, parsed sections,
    size_bytes, estimated_tokens, last_modified, and tags.
    """
    book_path = _resolve_book_path(category, book_name)
    if not os.path.exists(book_path):
        raise FileNotFoundError(f"Book '{category}/{book_name}' not found")

    with open(book_path, "r", encoding="utf-8") as f:
        content = f.read()

    size_bytes = os.path.getsize(book_path)
    estimated_tokens = max(1, len(content) // 4)
    last_modified = _get_file_mtime_ist(book_path)
    sections = parse_book_sections(category, book_name)

    catalog = get_catalog_index()
    tags_index = catalog.get("tags_index", {})
    clean_name = os.path.basename(book_path)
    book_tags = tags_index.get(f"{category}/{clean_name}", [category])

    return {
        "category": category,
        "book_name": clean_name,
        "title": clean_name.replace(".md", "").replace("_", " ").title(),
        "content": content,
        "sections": sections,
        "size_bytes": size_bytes,
        "estimated_tokens": estimated_tokens,
        "last_modified": last_modified,
        "tags": book_tags
    }


def save_book_content(
    category: str,
    book_name: str,
    content: str,
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Creates category folder if needed, writes content to target book file,
    updates catalog_index.json with tags and metadata, and returns updated book details.
    """
    book_path = _resolve_book_path(category, book_name)
    os.makedirs(os.path.dirname(book_path), exist_ok=True)

    with open(book_path, "w", encoding="utf-8") as f:
        f.write(content)

    clean_name = os.path.basename(book_path)
    catalog = get_catalog_index()
    if "tags_index" not in catalog:
        catalog["tags_index"] = {}
    catalog["tags_index"][f"{category}/{clean_name}"] = tags or [category]
    _save_json(CATALOG_INDEX_FILE, catalog)

    rebuild_catalog_index()
    log_action("MEMORY_MANAGER", "BOOK_SAVED", {"category": category, "book_name": clean_name})
    return read_book_content(category, clean_name)


def append_book_recipe(
    category: str,
    book_name: str,
    title: str,
    insight: str,
    code_snippet: str = "",
    tags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Appends a clean, structured Markdown operational recipe section to the target book,
    creating the book if it does not yet exist.
    """
    book_path = _resolve_book_path(category, book_name)
    os.makedirs(os.path.dirname(book_path), exist_ok=True)

    clean_name = os.path.basename(book_path)
    book_title = clean_name.replace(".md", "").replace("_", " ").title()

    initial_content = ""
    if not os.path.exists(book_path) or os.path.getsize(book_path) == 0:
        initial_content = f"# {book_title}\nKnowledge Base Book for {category}/{clean_name}.\n"

    tags_list = tags or [category, "operational_recipe"]
    tags_str = ", ".join(tags_list)

    recipe_lines = [
        f"\n\n## Operation Insight: {title}",
        f"- **Recorded:** {get_ist_now_str()}",
        f"- **Tags:** {tags_str}",
        "",
        insight.strip()
    ]

    if code_snippet and code_snippet.strip():
        recipe_lines.append("")
        recipe_lines.append("```")
        recipe_lines.append(code_snippet.strip())
        recipe_lines.append("```")

    recipe_block = "\n".join(recipe_lines) + "\n"

    with open(book_path, "a", encoding="utf-8") as f:
        if initial_content:
            f.write(initial_content)
        f.write(recipe_block)

    catalog = get_catalog_index()
    if "tags_index" not in catalog:
        catalog["tags_index"] = {}
    existing_tags = catalog["tags_index"].get(f"{category}/{clean_name}", [])
    merged_tags = list(set(existing_tags + tags_list))
    catalog["tags_index"][f"{category}/{clean_name}"] = merged_tags
    _save_json(CATALOG_INDEX_FILE, catalog)

    rebuild_catalog_index()
    log_action("MEMORY_MANAGER", "RECIPE_APPENDED", {"category": category, "book_name": clean_name, "title": title})
    return read_book_content(category, clean_name)


def delete_book(category: str, book_name: str) -> Dict[str, Any]:
    """
    Deletes the specified book file and removes its tags from catalog_index.json.
    """
    book_path = _resolve_book_path(category, book_name)
    if not os.path.exists(book_path):
        raise FileNotFoundError(f"Book '{category}/{book_name}' not found")

    clean_name = os.path.basename(book_path)
    os.remove(book_path)

    catalog = get_catalog_index()
    if "tags_index" in catalog:
        catalog["tags_index"].pop(f"{category}/{clean_name}", None)
        _save_json(CATALOG_INDEX_FILE, catalog)

    rebuild_catalog_index()
    log_action("MEMORY_MANAGER", "BOOK_DELETED", {"category": category, "book_name": clean_name})
    return {"status": "deleted", "category": category, "book_name": clean_name}


def defragment_and_consolidate_books():
    print("📚 Defragmenting and consolidating knowledge base topic books...")
    log_action("MEMORY_MANAGER", "DEFRAG_START", {"timestamp": get_ist_now_str()})

    for cat_dir in glob.glob(f"{BOOKS_DIR}/*"):
        if not os.path.isdir(cat_dir):
            continue

        category_name = os.path.basename(cat_dir)
        book_files = glob.glob(f"{cat_dir}/*.md")

        fragment_files = []
        for bf in book_files:
            filename = os.path.basename(bf)
            is_fragment = (
                filename.startswith("domain_task_") or
                filename.startswith("temp_") or
                filename.endswith("_insight.md") or
                filename.endswith("_code_insight.md") or
                filename.endswith("_template.md") or
                re.match(r'^[a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+\.md$', filename) or
                os.path.getsize(bf) < 800
            )

            is_canonical = any(filename == canonical for canonical in CANONICAL_TOPIC_MAP.get(category_name, []))
            if is_fragment and not is_canonical:
                fragment_files.append(bf)

        if not fragment_files:
            continue

        for fragment_path in fragment_files:
            try:
                with open(fragment_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()

                if not content:
                    os.remove(fragment_path)
                    continue

                target_filename = "general_coding.md" if category_name == "coding" else f"{category_name}_summary.md"
                content_lower = content.lower()

                if "fastapi" in content_lower:
                    target_filename = "fastapi.md"
                elif "react" in content_lower or "jsx" in content_lower or "tsx" in content_lower:
                    target_filename = "react_typescript.md"
                elif "sqlalchemy" in content_lower or "database" in content_lower or "sql" in content_lower:
                    target_filename = "sqlalchemy.md"
                elif "async" in content_lower or "python" in content_lower:
                    target_filename = "python_async.md"
                elif any(kw in content_lower for kw in ["operating system", "kernel", "process", "thread"]):
                    target_filename = "operating_systems.md"
                elif any(kw in content_lower for kw in ["dsa", "tree", "graph", "sorting", "algorithm"]):
                    target_filename = "data_structures_algorithms.md"

                master_book_path = os.path.join(cat_dir, target_filename)
                clean_entry = f"\n\n### Consolidated Entry [{get_ist_now_str()}] (From: {os.path.basename(fragment_path)})\n" + content

                with open(master_book_path, "a", encoding="utf-8") as mf:
                    mf.write(clean_entry)

                os.remove(fragment_path)
                log_action("MEMORY_MANAGER", "FRAGMENT_CONSOLIDATED", {"from": os.path.basename(fragment_path), "into": target_filename})

            except Exception as e:
                log_action("MEMORY_MANAGER", "DEFRAG_EXCEPTION", {"file": fragment_path, "error": str(e)})

    rebuild_catalog_index()
    print(f"✅ Knowledge base defragmentation complete. {get_knowledge_base_telemetry()}")


# Backward compatibility aliases (placed after function definitions)
record_learning = append_book_recipe
defragment_books = defragment_and_consolidate_books
get_knowledge_telemetry = get_knowledge_base_telemetry


def process_delta_learning_sync():
    """
    Asynchronous Low-Priority Learning Pass v6.0:
    Scans temporary cached research data logs inside .search_data/, performs a strict
    context distinctness verification check using the 32B Orchestrator model against current books,
    and streams tokens directly to prevent interface visual lockouts.
    """
    search_logs = glob.glob(os.path.join(SEARCH_DATA_DIR, "*.json"))
    if not search_logs:
        return

    print(f"🧠 Starting background context-distinctness check via {LOCAL_ORCHESTRATOR_MODEL}...")
    log_action("MEMORY_MANAGER", "DELTA_SYNC_START", {"staged_files": len(search_logs)})

    for log_file in search_logs:
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_query = data.get("query", "unknown")
            payload = data.get("payload", {})
            raw_content = str(payload.get("content") or payload.get("snippets") or "")
            project_name = data.get("project_name")

            existing_books_context = load_relevant_memory_books(raw_query)

            analysis_prompt = f"""You are the Delta Knowledge Evaluator.
Compare this incoming web scrape information with our current offline memory book layers.

Incoming Search Query: {raw_query}
New Scraped Content Data:
{raw_content[:2000]}

--- CURRENT OFFLINE BOOK RECORDS ---
{existing_books_context[:2000]}

CRITICAL STRICT INSTRUCTION:
Verify if the scraped data contains a framework feature update, unique syntax resolution, or technical parameter NOT present in our existing book records.
If it is duplicate, redundant, or already covered, you must return has_unique_delta: false.

Respond strictly in JSON format:
{{
    "has_unique_delta": true or false,
    "category": "coding" | "frameworks" | "tools" | "cloud" | "tech_stack" | "cs_fundamentals" | "design_patterns",
    "target_book": "filename.md",
    "new_insight": "Markdown formatted bullet summary of the unique technical parameter learned"
}}
"""
            print("⏳ [Evaluating Knowledge Delta Stream]: ", end="", flush=True)

            stream = ollama.chat(
                model=LOCAL_ORCHESTRATOR_MODEL,
                messages=[{"role": "user", "content": analysis_prompt}],
                options={"temperature": 0.1},
                keep_alive=0,
                stream=True
            )

            reply_chunks = []
            for chunk in stream:
                token = chunk["message"]["content"]
                reply_chunks.append(token)
                print(token, end="", flush=True)
            print()

            reply = "".join(reply_chunks).strip()
            start = reply.find("{")
            end = reply.rfind("}") + 1
            if start != -1 and end != -1:
                verdict = json.loads(reply[start:end])
                if verdict.get("has_unique_delta") and verdict.get("category") and verdict.get("target_book"):
                    cat = verdict["category"].lower()
                    filename = verdict["target_book"].lower()
                    if not filename.endswith(".md"):
                        filename += ".md"

                    book_path = os.path.join(BOOKS_DIR, cat, filename)
                    entry = f"\n\n## Verified Insight Delta [{get_ist_now_str()}]\n" + verdict["new_insight"].strip()

                    with open(book_path, "a", encoding="utf-8") as bf:
                        bf.write(entry)

                    log_action("MEMORY_MANAGER", "DELTA_BOOK_MUTATED", {"path": book_path, "project_name": project_name})
                else:
                    log_action("MEMORY_MANAGER", "DELTA_DISCARDED_DUPLICATE", {"query": raw_query, "project_name": project_name})

            os.remove(log_file)

        except Exception as e:
            print(f"\n❌ [Delta Synthesis Exception Intercepted]: {e}")
            log_action("MEMORY_MANAGER", "DELTA_SYNC_EXCEPTION", {"file": log_file, "error": str(e)})

    defragment_and_consolidate_books()


def synthesize_and_update_memory(action_summary: str, execution_output: str, project_name: str = None):
    synthesis_prompt = f"""You are the Memory Synthesis Unit.
Analyze this technical implementation trace output.
Task: {action_summary}
Trace Output: {execution_output[:2500]}

Extract any specific implementation syntax parameters or bug resolutions that are net-new.
Respond in PURE JSON format. If unique insights are extracted:
{{
    "has_new_learning": true,
    "category": "coding" | "frameworks" | "tools" | "cloud" | "history" | "environment" | "cs_fundamentals" | "design_patterns",
    "book_filename": "filename.md",
    "insight_entry": "Markdown formatted code insight block"
}}
Otherwise return: {{"has_new_learning": false}}
"""
    try:
        print(f"🧠 Synthesizing trace memory maps using {LOCAL_WORKER_MODEL}... ", end="", flush=True)
        stream = ollama.chat(
            model=LOCAL_WORKER_MODEL,
            messages=[{"role": "user", "content": synthesis_prompt}],
            options={"num_ctx": 2048},
            keep_alive="2m",
            stream=True
        )

        reply_chunks = []
        for chunk in stream:
            reply_chunks.append(chunk["message"]["content"])
        print("✅ Done.")

        reply = "".join(reply_chunks).strip()
        start = reply.find("{")
        end = reply.rfind("}") + 1
        if start != -1 and end != -1:
            data = json.loads(reply[start:end])
            if data.get("has_new_learning"):
                cat = data["category"].lower()
                filename = data["book_filename"].lower()
                if not filename.endswith(".md"):
                    filename += ".md"

                book_path = os.path.join(BOOKS_DIR, cat, filename)
                entry_text = f"\n\n## Operation Insight [{get_ist_now_str()}]\n" + data["insight_entry"].strip()

                with open(book_path, "a", encoding="utf-8") as f:
                    f.write(entry_text)

                log_action("MEMORY_MANAGER", "SYNTHESIS_BOOK_MUTATED", {"path": book_path, "project_name": project_name})
                rebuild_catalog_index()
    except Exception as e:
        log_action("MEMORY_MANAGER", "SYNTHESIS_SKIPPED_OR_EXCEPT", {"error": str(e)[:120], "project_name": project_name})


def record_env_location(location_path: str):
    data = _load_json(ENV_HISTORY_FILE, {"history": [], "last_location": ""})
    clean_path = location_path.replace("\\", "/")
    if clean_path in data["history"]:
        data["history"].remove(clean_path)
    data["history"].insert(0, clean_path)
    data["history"] = data["history"][:10]
    data["last_location"] = clean_path
    _save_json(ENV_HISTORY_FILE, data)


def get_last_env_location() -> str:
    data = _load_json(ENV_HISTORY_FILE, {"history": [], "last_location": os.getcwd()})
    return data.get("last_location", os.getcwd())


def get_tool_catalog() -> dict:
    default_tools = {
        "web_research": {"status": "active", "type": "offline_supported", "description": "DuckDuckGo HTML live web scraper for documentation"},
        "n8n_workflows": {"status": "active", "type": "windows_automation", "description": "Local Windows n8n webhook automation bridge"},
        "aider": {"status": "available", "type": "agentic_ide", "description": "Windows batch CLI AI coding agent"},
        "roocode": {"status": "available", "type": "agentic_ide", "description": "VSCode extension agent tool bridge"},
        "antigravity": {"status": "available", "type": "agentic_sandbox", "description": "Autonomous Linux sandbox agent"},
        "vision_engine": {"status": "active", "type": "multimodal", "description": "Playwright + Gemini vision screenshot analyst"},
        "voice_engine": {"status": "active", "type": "audio", "description": "Faster-Whisper STT and speech synthesis engine"}
    }
    return _load_json(TOOL_CATALOG_FILE, default_tools)


def record_execution_profile(profile_name: str, details: dict):
    profiles = _load_json(PROFILES_FILE, {})
    profiles[profile_name] = {
        "timestamp": get_ist_now_str(),
        "details": details
    }
    _save_json(PROFILES_FILE, profiles)
