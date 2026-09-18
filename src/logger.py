import os
import json
import time
import threading
from datetime import datetime, timezone, timedelta

# ==============================================================================
# ADVANCE ASSISTANT OS v6.0 - MULTI-STREAM PROJECT-SCOPED LOGGER
# ==============================================================================

# Define Indian Standard Time (IST: UTC + 5:30)
IST = timezone(timedelta(hours=5, minutes=30))

LOG_DIR = os.path.abspath("./logs")
DAILY_LOG_DIR = os.path.join(LOG_DIR, "daily")
CAT_LOG_DIR = os.path.join(LOG_DIR, "categories")
PROJECT_LOG_DIR = os.path.join(LOG_DIR, "projects")
TEST_LOG_DIR = os.path.abspath("./test/test_logs")

# Ensure required directory structures exist
for d in [LOG_DIR, DAILY_LOG_DIR, CAT_LOG_DIR, PROJECT_LOG_DIR, TEST_LOG_DIR]:
    os.makedirs(d, exist_ok=True)

# Thread safety lock for concurrent multi-agent log writing
_LOCK = threading.Lock()

# Sliding-window rate limit state storage for backwards compatibility
RATE_LIMIT_DATA = {}


def get_ist_now() -> datetime:
    """Returns datetime explicitly anchored to Indian Standard Time (IST)."""
    return datetime.now(IST)


def enforce_budget_limits(
    model_name: str,
    max_rpm: int = 1000,
    max_tpm: int = 2000000,
    estimated_tokens: int = 4000
) -> bool:
    """
    Enforces strict sliding window rate budgets.
    Hooks directly into TokenGovernor to coordinate unbilled limits,
    cooldown windows, and model-shifting failovers.
    """
    with _LOCK:
        now = time.time()
        if model_name not in RATE_LIMIT_DATA:
            RATE_LIMIT_DATA[model_name] = {"requests": [], "tokens": []}

        # Purge entries older than 60 seconds (1-minute sliding window)
        RATE_LIMIT_DATA[model_name]["requests"] = [
            t for t in RATE_LIMIT_DATA[model_name]["requests"] if now - t < 60
        ]
        RATE_LIMIT_DATA[model_name]["tokens"] = [
            pair for pair in RATE_LIMIT_DATA[model_name]["tokens"] if now - pair[0] < 60
        ]

        current_rpm = len(RATE_LIMIT_DATA[model_name]["requests"])
        current_tpm = sum(pair[1] for pair in RATE_LIMIT_DATA[model_name]["tokens"])

        # Reject if exceeding hard budget ceilings
        if current_rpm >= max_rpm or (current_tpm + estimated_tokens) >= max_tpm:
            return False

        # Record usage parameters locally
        RATE_LIMIT_DATA[model_name]["requests"].append(now)
        RATE_LIMIT_DATA[model_name]["tokens"].append((now, estimated_tokens))
        return True


def check_rate_limits(model_name: str, max_rpm: int = 1000) -> bool:
    """Backward-compatible helper for legacy rate limit checks."""
    return enforce_budget_limits(model_name, max_rpm=max_rpm, max_tpm=2000000)


def log_action(
    category_or_model: str,
    action_type: str,
    details: dict,
    model_name: str = None,
    env_context: str = "LOCAL"
):
    """
    Multi-Stream Thread-Safe Logger v6.0:
    Writes a formatted log entry simultaneously across targets:
      1. logs/master_timeline.log               (Single global trace)
      2. logs/daily/YYYY-MM-DD.log             (Daily IST operational log)
      3. logs/categories/<category>/<type>.log (Categorical logs: models, tools, envs, tasks)
      4. logs/categories/models/<model>.log    (Model specific execution stream)
      5. logs/projects/<project_name>/trace.log(Project-isolated trace if project context present)
      6. test/test_logs/<test_script>.log      (Test-isolated trace if test context present)
    """
    with _LOCK:
        now = get_ist_now()
        timestamp = now.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        date_str = now.strftime("%Y-%m-%d")

        # Handle backward compatibility for legacy signature
        if model_name is None:
            active_model = category_or_model
            category = "GENERAL"
        else:
            active_model = model_name
            category = category_or_model

        # Extract project identifier if present in details
        project_id = details.get("project_name") or details.get("project_id")
        test_script = details.get("test_name") or details.get("test_script")

        # Customized Header Prefix Format Block
        formatted_entry = (
            f"[{timestamp} IST] [MODEL:{active_model.upper()}] [CAT:{category.upper()}] "
            f"[{action_type}] [ENV:{env_context}] {json.dumps(details)}\n"
        )

        try:
            # Stream 1: Master Timeline Log
            master_log_path = os.path.join(LOG_DIR, "master_timeline.log")
            with open(master_log_path, "a", encoding="utf-8") as f:
                f.write(formatted_entry)

            # Stream 2: Daily Log
            daily_log_path = os.path.join(DAILY_LOG_DIR, f"{date_str}.log")
            with open(daily_log_path, "a", encoding="utf-8") as f:
                f.write(formatted_entry)

            # Stream 3: Categorical Log
            target_cat_dir = os.path.join(CAT_LOG_DIR, category.lower())
            os.makedirs(target_cat_dir, exist_ok=True)
            cat_file_path = os.path.join(target_cat_dir, f"{action_type.lower()}.log")
            with open(cat_file_path, "a", encoding="utf-8") as f:
                f.write(formatted_entry)

            # Stream 4: Model-Specific Activity Log
            if active_model and active_model != "SYSTEM":
                model_cat_dir = os.path.join(CAT_LOG_DIR, "models")
                os.makedirs(model_cat_dir, exist_ok=True)
                clean_model_name = active_model.lower().replace(" ", "_").replace(":", "_")
                model_log_file = os.path.join(model_cat_dir, f"{clean_model_name}.log")
                with open(model_log_file, "a", encoding="utf-8") as f:
                    f.write(formatted_entry)

            # Stream 5: Project-Scoped Isolated Workspace Log
            if project_id:
                clean_project_name = re.sub(r'[\W_]+', '_', str(project_id)).strip('_').lower()
                p_dir = os.path.join(PROJECT_LOG_DIR, clean_project_name)
                os.makedirs(p_dir, exist_ok=True)
                p_log_file = os.path.join(p_dir, "execution_trace.log")
                with open(p_log_file, "a", encoding="utf-8") as f:
                    f.write(formatted_entry)

            # Stream 6: Test-Script Isolated Mirror Stream
            if test_script:
                clean_test_name = str(test_script).replace(".py", "").lower()
                t_log_file = os.path.join(TEST_LOG_DIR, f"{clean_test_name}.log")
                with open(t_log_file, "a", encoding="utf-8") as f:
                    f.write(formatted_entry)

        except Exception:
            pass  # Fail-silent guardrail to prevent logger faults from stopping code loops