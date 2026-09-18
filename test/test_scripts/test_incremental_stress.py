import sys
import os
import concurrent.futures

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.agent import run_agent_pipeline, governor
from src.config import MODEL_REGISTRY
from src.logger import log_action

def dispatch_model_test_worker(model_id: str, phase_name: str) -> dict:
    prompt = f"project:test_stress_suite | Model endpoint verification test for {model_id}. Output 'STATUS_OK'."
    try:
        run_agent_pipeline(
            user_prompt=prompt,
            tier="HIGH" if "pro" in model_id else "FAST",
            mode_override="HYBRID_CLOUD",
            profile_override="BASIC",
            constraining_profile_override="PRO_PLAN" if "pro" in model_id else "HIGH_RPM_TPM",
            project_name="test_stress_suite",
            test_name="test_incremental_stress"
        )
        snippet = governor.render_live_telemetry_snippet(model_id)
        return {"model": model_id, "phase": phase_name, "status": "SUCCESS", "telemetry": snippet}
    except Exception as e:
        return {"model": model_id, "phase": phase_name, "status": f"FAILED: {str(e)[:60]}", "telemetry": "N/A"}

def test_incremental_multi_model_sweeps():
    print("\n==================================================================")
    print(" 🧪 TEST 6: INCREMENTAL MULTI-MODEL STRESS TEST (ALL ENDPOINTS)")
    print("==================================================================")
    
    test_context = {"project_name": "test_stress_suite", "test_script": "test_incremental_stress"}
    log_action("TEST_HARNESS", "TEST_INCREMENTAL_STRESS_START", test_context)

    cloud_models = [m for m in MODEL_REGISTRY.keys() if "qwen" not in m]
    sorted_models = sorted(cloud_models, key=lambda m: MODEL_REGISTRY[m]["rpm"], reverse=True)

    print("Model Execution Priority Queue (Sorted by RPM Ceiling):")
    for idx, m in enumerate(sorted_models, 1):
        print(f"  {idx}. {m:<24} ➜ {MODEL_REGISTRY[m]['rpm']} RPM | {MODEL_REGISTRY[m]['rpd']} RPD")
    print("─"*66)

    # Phase 1: High Concurrency Lite Models (4,000 RPM Pool)
    phase_1_models = [m for m in sorted_models if MODEL_REGISTRY[m]["rpm"] >= 4000]
    print(f"\n🚀 PHASE 1: Spawning Concurrent Thread Sweeps for 4K RPM Lite Models...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(phase_1_models)) as executor:
        futures = [executor.submit(dispatch_model_test_worker, m, "Phase 1") for m in phase_1_models]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            print(f"   • [{res['phase']}] {res['model']:<24} ➜ {res['status']} | {res['telemetry']}")

    # Phase 2: Mid-Range Flash Engines (1,000 RPM Pool)
    phase_2_models = [m for m in sorted_models if 1000 <= MODEL_REGISTRY[m]["rpm"] < 4000]
    print(f"\n⚡ PHASE 2: Spawning Concurrent Thread Sweeps for 1K RPM Flash Engines...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(phase_2_models)) as executor:
        futures = [executor.submit(dispatch_model_test_worker, m, "Phase 2") for m in phase_2_models]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            print(f"   • [{res['phase']}] {res['model']:<24} ➜ {res['status']} | {res['telemetry']}")

    # Phase 3: Restricted Pro Engines (25 - 150 RPM Pool)
    phase_3_models = [m for m in sorted_models if MODEL_REGISTRY[m]["rpm"] < 1000]
    print(f"\n🧠 PHASE 3: Executing Restricted Pro Model Sequential Sweeps...")
    for m in phase_3_models:
        res = dispatch_model_test_worker(m, "Phase 3")
        print(f"   • [{res['phase']}] {res['model']:<24} ➜ {res['status']} | {res['telemetry']}")

    log_action("TEST_HARNESS", "TEST_INCREMENTAL_STRESS_COMPLETE", test_context)
    print("==================================================================")
    print("✅ Incremental Multi-Model Stress Test Complete!\n")

if __name__ == "__main__":
    test_incremental_multi_model_sweeps()