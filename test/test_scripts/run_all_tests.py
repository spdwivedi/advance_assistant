import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from test_governor import test_governor_limits
from test_defrag import test_book_defragmentation
from test_offline_pipeline import test_offline_code_generation
from test_search_grounding import test_search_and_deduplicated_grounding
from test_gemini_single import test_gemini_single_and_cross_platform_execution
from test_incremental_stress import test_incremental_multi_model_sweeps

def run_master_test_suite_v6():
    print("==================================================================")
    print("       ADVANCE ASSISTANT OS v6.0 - MASTER SYSTEM TEST HARNESS     ")
    print("==================================================================")
    
    test_governor_limits()
    test_book_defragmentation()
    test_offline_code_generation()
    test_search_and_deduplicated_grounding()
    test_gemini_single_and_cross_platform_execution()
    test_incremental_multi_model_sweeps()
    
    print("==================================================================")
    print("🎉 ALL ADVANCE ASSISTANT OS v6.0 SUBSYSTEM TESTS COMPLETED!")
    print("==================================================================\n")

if __name__ == "__main__":
    run_master_test_suite_v6()