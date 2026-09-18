import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.memory_manager import defragment_and_consolidate_books, BOOKS_DIR, get_knowledge_base_telemetry
from src.logger import log_action

def test_book_defragmentation():
    print("\n--- 🧪 TEST 2: KNOWLEDGE BASE BOOK DEFRAGMENTATION ---")
    dummy_fragment = os.path.join(BOOKS_DIR, "coding", "domain_task_test99.txt.md")
    
    with open(dummy_fragment, "w", encoding="utf-8") as f:
        f.write("# Dummy Test Note\nFastAPI route integration with SQLAlchemy async session setup.")
    print(f"Created temporary fragment file: {os.path.basename(dummy_fragment)}")
    
    defragment_and_consolidate_books()
    
    success = not os.path.exists(dummy_fragment)
    print(f"Result: {'✅ Micro-fragment note successfully merged and purged!' if success else '❌ Fragment still exists.'}")
    print(f"Updated KB Telemetry: {get_knowledge_base_telemetry()}")
    
    log_action("TEST_HARNESS", "DEFRAG_TEST_COMPLETE", {
        "fragment_purged": success,
        "test_script": "test_defrag"
    })

if __name__ == "__main__":
    test_book_defragmentation()