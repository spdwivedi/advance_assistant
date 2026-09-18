import sys
import os
import time
import ollama

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from src.config import LOCAL_ORCHESTRATOR_MODEL, LOCAL_WORKER_MODEL

def measure_local_model_performance(model_name: str, test_prompt: str):
    print(f"\n──────────────────────────────────────────────────────────────────")
    print(f"🧪 Testing Model: [{model_name}]")
    print(f"──────────────────────────────────────────────────────────────────")
    
    start_time = time.time()
    token_count = 0
    first_token_time = None
    
    try:
        print(f"⏳ Loading layers & generating response stream: ", end="", flush=True)
        stream = ollama.chat(
            model=model_name,
            messages=[{"role": "user", "content": test_prompt}],
            options={"temperature": 0.1, "num_ctx": 2048},
            keep_alive=0,  # Unload immediately after test
            stream=True
        )
        
        for chunk in stream:
            if first_token_time is None:
                first_token_time = time.time() - start_time
            token = chunk["message"]["content"]
            token_count += 1
            print(token, end="", flush=True)
            
        print()
        total_time = time.time() - start_time
        gen_time = total_time - (first_token_time or 0)
        tokens_per_sec = token_count / gen_time if gen_time > 0 else 0
        
        print(f"\n📊 [{model_name} Metrics]:")
        print(f"   • Time to First Token (TTFT): {round(first_token_time or 0, 2)}s")
        print(f"   • Generation Time:           {round(gen_time, 2)}s")
        print(f"   • Total Tokens Generated:     {token_count}")
        print(f"   • Tokens Per Second (TPS):    {round(tokens_per_sec, 2)} tok/s")
        return True
        
    except Exception as e:
        print(f"\n❌ Error testing {model_name}: {e}")
        return False

def run_local_benchmark():
    print("==================================================================")
    print("       LOCAL OLLAMA INFERENCE & HARDWARE SWAP BENCHMARK          ")
    print("==================================================================")
    
    prompt = "Respond strictly in JSON: {\"status\": \"ok\", \"task\": \"inference_check\"}"
    
    # Test 1: Worker Model (7B)
    print("\n1. Testing Worker Bee (Fast Code Writer)...")
    measure_local_model_performance(LOCAL_WORKER_MODEL, prompt)
    
    # Test 2: Orchestrator Model (32B)
    print("\n2. Testing Orchestrator (Deep Reasoning & Delta Evaluator)...")
    measure_local_model_performance(LOCAL_ORCHESTRATOR_MODEL, prompt)

    print("\n==================================================================")
    print("🎉 BENCHMARK COMPLETE!")
    print("==================================================================\n")

if __name__ == "__main__":
    run_local_benchmark()