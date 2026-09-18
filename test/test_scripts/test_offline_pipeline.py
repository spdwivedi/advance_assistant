import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.agent import run_agent_pipeline
from src.config import TEST_DATA_DIR
from src.logger import log_action

def test_offline_code_generation():
    print("\n--- 🧪 TEST 3: OFFLINE LOCAL PIPELINE & QA VERIFICATION ---")
    test_workspace = os.path.join(TEST_DATA_DIR, "test_project")
    os.makedirs(test_workspace, exist_ok=True)
    
    prompt = "Write a basic FastAPI health check endpoint in main.py"
    print(f"Executing offline pipeline prompt: '{prompt}'")
    
    response = run_agent_pipeline(
        user_prompt=prompt,
        tier="FAST",
        target_workspace=test_workspace,
        mode_override="OFFLINE_ONLY",
        profile_override="BASIC",
        test_name="test_offline_pipeline"
    )
    
    print("\n[Pipeline Output Snippet]:")
    print(response[:300] + "...\n")
    
    written_file = os.path.join(test_workspace, "main.py")
    success = os.path.exists(written_file)
    print(f"Result: {'✅ Verified file written to disk!' if success else '❌ File write failed.'}")
    
    log_action("TEST_HARNESS", "OFFLINE_PIPELINE_TEST_COMPLETE", {
        "workspace": test_workspace,
        "test_script": "test_offline_pipeline"
    })

if __name__ == "__main__":
    test_offline_code_generation()