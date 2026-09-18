import os
import json
import glob
import time
import re
import ollama
from datetime import datetime, timezone, timedelta
from src.logger import log_action
from src.config import SEARCH_DATA_DIR, LOCAL_ORCHESTRATOR_MODEL, LOCAL_WORKER_MODEL

# Define Indian Standard Time (IST: UTC + 5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Returns formatted time string explicitly anchored to Indian Standard Time (IST)."""
    return datetime.now(IST).strftime(fmt)

# Base path definitions for persistent memory
MEMORY_DIR = os.path.abspath("./.agent_memory")
BOOKS_DIR = os.path.join(MEMORY_DIR, "books")

CATALOG_INDEX_FILE = os.path.join(MEMORY_DIR, "catalog_index.json")
TOOL_CATALOG_FILE = os.path.join(MEMORY_DIR, "tool_catalog.json")
ENV_HISTORY_FILE = os.path.join(MEMORY_DIR, "env_history.json")
PROFILES_FILE = os.path.join(MEMORY_DIR, "execution_profiles.json")

# Canonical Master Topic Books Mapping
CANONICAL_TOPIC_MAP = {
    "coding": ["fastapi.md", "react_typescript.md", "sqlalchemy.md", "python_async.md", "general_coding.md"],
    "frameworks": ["web_frameworks.md", "testing_automation.md"],
    "tools": ["developer_tools.md", "automation_bridges.md"],
    "cloud": ["cloud_deployment.md", "containerization.md"],
    "tech_stack": ["system_architecture.md"],
    "environment": ["environment_configuration.md"],
    "history": ["execution_history.md"],
    "cs_fundamentals": ["operating_systems.md", "data_structures_algorithms.md", "computer_networks.md"],
    "design_patterns": ["low_level_design.md", "high_level_design.md"]
}

# Ensure all category directory structures exist
os.makedirs(BOOKS_DIR, exist_ok=True)
for category in CANONICAL_TOPIC_MAP.keys():
    os.makedirs(os.path.join(BOOKS_DIR, category), exist_ok=True)


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
    catalog = {
        "last_updated": get_ist_now_str(),
        "root_docs": [],
        "categories": {}
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
                catalog["categories"][category_name].append({
                    "title": os.path.basename(book_file).replace(".md", "").replace("_", " ").title(),
                    "filename": os.path.basename(book_file),
                    "path": book_file,
                    "size_bytes": os.path.getsize(book_file)
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


def load_relevant_memory_books(user_prompt: str) -> str:
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
            
            # v6.0 Upgrade: Force chunk streaming with timeout protections to avoid blind hangs
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
            print() # Print empty line to break out stream safely

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