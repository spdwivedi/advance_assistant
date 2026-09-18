import urllib.parse
import os
import json
import time
import requests
from bs4 import BeautifulSoup
from src.logger import log_action, get_ist_now
from src.config import (
    SEARCH_DATA_DIR, RESEARCH_PROFILES,
    MAX_DUCKDUCKGO_SEARCHES_PER_PASS,
    MAX_CLOUD_PROMPTS_PER_MODEL_PER_PASS,
    MAX_SEARCH_GROUNDING_REQS_PER_PASS
)

# ==============================================================================
# ADVANCE ASSISTANT OS v6.0 - RESOURCE-BOUNDED RESEARCH & AGGREGATOR
# ==============================================================================

def trigger_n8n_workflow(
    webhook_url: str, 
    payload: dict, 
    project_name: str = None, 
    test_name: str = None
) -> dict:
    """
    Dispatches task telemetry over to a local Windows n8n workflow node.
    Supports project and test-scoped log routing.
    """
    log_action(
        category_or_model="TOOLS",
        action_type="N8N_WORKFLOW_TRIGGERED",
        details={
            "url": webhook_url, 
            "payload_keys": list(payload.keys()),
            "project_name": project_name,
            "test_name": test_name
        }
    )
    try:
        response = requests.post(webhook_url, json=payload, timeout=10)
        result = {
            "status_code": response.status_code, 
            "response": response.text[:500]
        }
        log_action(
            category_or_model="TOOLS",
            action_type="N8N_RESPONSE_RECEIVED",
            details={**result, "project_name": project_name, "test_name": test_name}
        )
        return result
    except Exception as e:
        log_action(
            category_or_model="TOOLS",
            action_type="N8N_TRIGGER_FAILED",
            details={"error": str(e), "project_name": project_name, "test_name": test_name}
        )
        return {"error": str(e)}


def save_to_search_cache(
    clean_query: str, 
    payload_data: dict, 
    project_name: str = None, 
    test_name: str = None
):
    """
    Saves raw web scraper outputs and technical parameters into the 
    temporary staging data area (.search_data/) for delta learning context evaluation.
    """
    safe_filename = "".join([c if c.isalnum() else "_" for c in clean_query[:50]]).lower() + ".json"
    cache_path = os.path.join(SEARCH_DATA_DIR, safe_filename)
    
    try:
        now_str = get_ist_now().strftime("%Y-%m-%d %H:%M:%S IST")
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({
                "query": clean_query,
                "timestamp": now_str,
                "project_name": project_name,
                "payload": payload_data
            }, f, indent=4)
        log_action(
            "RESEARCH_TOOL", 
            "CACHE_WRITE_SUCCESS", 
            {"path": cache_path, "project_name": project_name, "test_name": test_name}
        )
    except Exception as e:
        log_action(
            "RESEARCH_TOOL", 
            "CACHE_WRITE_FAILED", 
            {"error": str(e), "project_name": project_name, "test_name": test_name}
        )


def search_web_documentation(
    query: str, 
    max_results: int = 5, 
    profile_level: str = "MEDIUM", 
    client_ref=None,
    project_name: str = None,
    test_name: str = None,
    search_counters: dict = None
) -> str:
    """
    Resource-Bounded Dual-Engine Research Scraper v6.0:
    Queries DuckDuckGo HTML endpoints and maps Gemini 3.5 Flash Search Grounding
    tool pipelines while enforcing hard research bounds (Max 20 DDG searches,
    max 5 Grounding queries per research pass).
    """
    profile = RESEARCH_PROFILES.get(profile_level, RESEARCH_PROFILES["MEDIUM"])
    if not profile["web_search_enabled"]:
        return "--- WEB RESEARCH SKIPPED ---\nReason: Profile level set to BASIC (Local Only)."

    # Initialize per-pass counters if not provided
    if search_counters is None:
        search_counters = {"ddg_count": 0, "grounding_count": 0}

    log_action(
        category_or_model="RESEARCH_TOOL", 
        action_type="WEB_SEARCH_INITIATED", 
        details={
            "query": query[:120], 
            "profile_level": profile_level,
            "project_name": project_name,
            "test_name": test_name,
            "current_ddg_count": search_counters["ddg_count"],
            "current_grounding_count": search_counters["grounding_count"]
        }
    )
    
    # Strip macro operational scaffolding strings cleanly
    clean_query = query.replace("Implement milestone:", "").replace("build:", "").replace("Decompose this goal into discrete tasks mapped to independent specific filenames.", "").strip()
    if not clean_query:
        return "--- WEB RESEARCH DEFERRED ---\nReason: Query evaluates to blank instruction markers."

    # --------------------------------------------------------------------------
    # ENGINE 1: GEMINI 3.5 SEARCH GROUNDING MATRIX (Capped per pass)
    # --------------------------------------------------------------------------
    if client_ref and profile_level in ["HIGH", "MAX"]:
        if search_counters["grounding_count"] < MAX_SEARCH_GROUNDING_REQS_PER_PASS:
            try:
                search_counters["grounding_count"] += 1
                log_action(
                    "RESEARCH_TOOL", 
                    "GEMINI_GROUNDING_ATTEMPT", 
                    {"query": clean_query[:80], "count": search_counters["grounding_count"], "project_name": project_name, "test_name": test_name}
                )
                response = client_ref.models.generate_content(
                    model="gemini-3.5-flash",
                    contents=f"Provide technical API reference parameters and code architecture details for: {clean_query}",
                    config={"tools": [{"google_search": {}}]}
                )
                if response.text:
                    grounded_text = response.text
                    if profile["cache_raw_data"]:
                        save_to_search_cache(
                            clean_query, 
                            {"source": "gemini_grounding", "content": grounded_text},
                            project_name=project_name,
                            test_name=test_name
                        )
                    return f"=== LIVE TECH GROUNDING ({clean_query.upper()}) ===\n{grounded_text}\n======================="
            except Exception as e:
                log_action(
                    "RESEARCH_TOOL", 
                    "GEMINI_GROUNDING_FAILED", 
                    {"error": str(e), "project_name": project_name, "test_name": test_name}
                )
        else:
            log_action(
                "RESEARCH_TOOL", 
                "GROUNDING_CAP_REACHED", 
                {"cap": MAX_SEARCH_GROUNDING_REQS_PER_PASS, "project_name": project_name, "test_name": test_name}
            )

    # --------------------------------------------------------------------------
    # ENGINE 2: FREE LOCAL DUCKDUCKGO HTML SCRAPER PASS (Capped per pass)
    # --------------------------------------------------------------------------
    if search_counters["ddg_count"] >= MAX_DUCKDUCKGO_SEARCHES_PER_PASS:
        log_action(
            "RESEARCH_TOOL", 
            "DDG_SEARCH_CAP_REACHED", 
            {"cap": MAX_DUCKDUCKGO_SEARCHES_PER_PASS, "project_name": project_name, "test_name": test_name}
        )
        return f"--- WEB RESEARCH BOUND REACHED ---\nReason: Passed maximum DuckDuckGo searches cap ({MAX_DUCKDUCKGO_SEARCHES_PER_PASS}). Using offline knowledge books."

    search_counters["ddg_count"] += 1
    encoded_query = urllib.parse.quote(clean_query)
    url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            fallback_url = "https://lite.duckduckgo.com/lite/"
            response = requests.post(fallback_url, data={"q": clean_query}, headers=headers, timeout=15)
            
        if response.status_code != 200:
            return f"--- WEB RESEARCH DEFERRED ---\nReason: Live search indices returned status code {response.status_code}"
            
        soup = BeautifulSoup(response.text, "html.parser")
        scraped_entries = []
        
        snippets = soup.find_all("a", class_="result__snippet")
        if snippets:
            for item in snippets[:max_results]:
                scraped_entries.append(item.get_text(strip=True))
        else:
            td_elements = soup.find_all("td", class_="result-snippet")
            for item in td_elements[:max_results]:
                scraped_entries.append(item.get_text(strip=True))

        if not scraped_entries:
            return f"--- NO LIVE COMPONENT SNIPPETS DISCOVERED FOR: '{clean_query}' ---"

        if profile["cache_raw_data"]:
            save_to_search_cache(
                clean_query, 
                {"source": "duckduckgo_scraper", "snippets": scraped_entries},
                project_name=project_name,
                test_name=test_name
            )

        now_str = get_ist_now().strftime('%Y-%m-%d %H:%M:%S IST')
        output_payload = [
            f"=== UP-TO-DATE SCRAPED KNOWLEDGE FOR: {clean_query.upper()} ===",
            f"Timestamp: {now_str} | Profile: {profile_level}",
            "--- Technical Documentation Snippets ---"
        ]
        for idx, entry in enumerate(scraped_entries, 1):
            output_payload.append(f"[{idx}] {entry}")
        output_payload.append("==================================================================")
        
        return "\n".join(output_payload)
        
    except requests.Timeout:
        return "--- WEB RESEARCH TIMEOUT ---\nNetwork verification window exceeded 15 seconds."
    except Exception as e:
        return f"--- WEB RESEARCH EXCEPTION ---\nScraper parsing layer exception: {str(e)}"