import sys
import os

# Add parent directory to system path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.tools import search_web_documentation
from src.memory_manager import process_delta_learning_sync, get_knowledge_base_telemetry
from src.logger import log_action

def test_search_and_deduplicated_grounding():
    print("\n==================================================================")
    print(" 🧪 TEST 4: LIVE SEARCH GROUNDING & SEMANTIC DEDUPLICATION")
    print("==================================================================")
    
    # Anchor target stream to Stream 6 isolated logger file outputs
    test_context = {"project_name": "test_search_suite", "test_script": "test_search_grounding"}
    log_action("TEST_HARNESS", "TEST_SEARCH_GROUNDING_START", test_context)

    query = "FastAPI async background tasks pydantic v2 implementation"
    print(f"1. Initiating resource-bounded search lookup for: '{query}'...")
    
    search_results = search_web_documentation(
        query=query, 
        profile_level="MEDIUM", 
        project_name="test_search_suite",
        test_name="test_search_grounding"
    )
    
    print("\n[Scraper Result Snippet]:")
    print(search_results[:300] + "...\n")
    
    print("2. Running Qwen 32B Context-Distinctness Delta Learning Pass...")
    print("   (Tokens streaming live to stdout below - check RAM paging efficiency)...")
    print("─"*66)
    
    kb_before = get_knowledge_base_telemetry()
    process_delta_learning_sync()
    kb_after = get_knowledge_base_telemetry()
    
    print("─"*66)
    print(f"   • KB Telemetry Before Evaluation: {kb_before}")
    print(f"   • KB Telemetry After Evaluation:  {kb_after}")
    
    log_action("TEST_HARNESS", "TEST_SEARCH_GROUNDING_COMPLETE", test_context)
    print("==================================================================")
    print("✅ Search Grounding & Deduplication Test Complete!\n")

if __name__ == "__main__":
    test_search_and_deduplicated_grounding()