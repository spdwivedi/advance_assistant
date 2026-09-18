import os
import json
import time
import subprocess
import threading
from datetime import datetime, timezone, timedelta
from src.logger import log_action
from src.config import (
    MODEL_REGISTRY, PRO_MODEL_PROJECT_CAPS, 
    MODEL_CONSTRAINING_PROFILES, TOKEN_LEDGER_FILE
)

# Define Indian Standard Time (IST: UTC + 5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now() -> datetime:
    """Returns current datetime explicitly in IST."""
    return datetime.now(IST)

def get_ist_date_str() -> str:
    """Returns YYYY-MM-DD date string in IST."""
    return get_ist_now().strftime("%Y-%m-%d")

_GOVERNOR_LOCK = threading.Lock()
_LAST_REQUEST_TIME = {}  # Per-model thread pacing map to prevent burst billing

# Alias MODEL_REGISTRY for backward compatibility
FREE_BUDGET_REGISTRY = MODEL_REGISTRY

def sync_wsl_time_from_internet():
    """Forces hardware clock sync in WSL environment silently."""
    try:
        subprocess.run(["sudo", "-n", "hwclock", "-s"], capture_output=True, text=True, timeout=5)
    except Exception:
        pass


class TokenGovernor:
    def __init__(self):
        sync_wsl_time_from_internet()
        with _GOVERNOR_LOCK:
            self.ledger = self._load_ledger_internal()
            self._check_and_reset_daily_caps_internal()

    def _load_ledger_internal(self) -> dict:
        if os.path.exists(TOKEN_LEDGER_FILE):
            try:
                with open(TOKEN_LEDGER_FILE, "r", encoding="utf-8") as f:
                    content = json.load(f)
                    if isinstance(content, dict) and "rolling_tokens" in content:
                        return content
            except Exception:
                pass
        return {
            "last_reset_date": get_ist_date_str(), 
            "model_usage": {}, 
            "project_usage": {},
            "rolling_window": {}, 
            "rolling_tokens": {}
        }

    def _save_ledger_internal(self):
        os.makedirs(os.path.dirname(TOKEN_LEDGER_FILE), exist_ok=True)
        with open(TOKEN_LEDGER_FILE, "w", encoding="utf-8") as f:
            json.dump(self.ledger, f, indent=4)

    def _check_and_reset_daily_caps_internal(self):
        """Flushes daily counters at 1:30 PM IST (Midnight PT boundary)."""
        now_ist = get_ist_now()
        current_date_str = now_ist.strftime("%Y-%m-%d")
        current_hour = now_ist.hour
        current_minute = now_ist.minute
        
        is_past_reset_time = (current_hour > 13) or (current_hour == 13 and current_minute >= 30)
        
        if self.ledger.get("last_reset_date") != current_date_str and is_past_reset_time:
            self.ledger["last_reset_date"] = current_date_str
            self.ledger["model_usage"] = {}
            self.ledger["rolling_window"] = {}
            self.ledger["rolling_tokens"] = {}
            self._save_ledger_internal()

    def is_model_allowed_by_profile(self, model_name: str, profile_name: str = "HIGH_RPM_TPM") -> bool:
        """Checks if a model is permitted under the active Model Constraining Profile."""
        if profile_name in MODEL_CONSTRAINING_PROFILES:
            allowed = MODEL_CONSTRAINING_PROFILES[profile_name]["allowed_models"]
            return model_name in allowed
        return True

    def inspect_and_cool_allocation(
        self, 
        model_name: str, 
        estimated_tokens: int = 4000, 
        requires_search: bool = False,
        project_name: str = None,
        constraining_profile: str = "HIGH_RPM_TPM"
    ) -> bool:
        """
        Thread-safe v6.0 quota interceptor with model profile filtering,
        project pro caps, burst pacing, and 85% TPM safety caps.
        """
        # 0. Profile Filter Check
        if not self.is_model_allowed_by_profile(model_name, constraining_profile):
            return False

        if model_name not in FREE_BUDGET_REGISTRY:
            return False

        limits = FREE_BUDGET_REGISTRY[model_name]

        # 1. Pacing Guard: Enforce micro-delay spacing per model to prevent multi-thread burst spikes
        with _GOVERNOR_LOCK:
            now_ts = time.time()
            last_ts = _LAST_REQUEST_TIME.get(model_name, 0)
            
            min_spacing = 1.5 if "pro" in model_name else 0.3
            if (now_ts - last_ts) < min_spacing:
                time.sleep(min_spacing - (now_ts - last_ts))
                now_ts = time.time()
            
            _LAST_REQUEST_TIME[model_name] = now_ts

            self.ledger = self._load_ledger_internal()
            self._check_and_reset_daily_caps_internal()

            # Ensure usage containers exist
            if "model_usage" not in self.ledger:
                self.ledger["model_usage"] = {}
            if "project_usage" not in self.ledger:
                self.ledger["project_usage"] = {}
            if "rolling_window" not in self.ledger:
                self.ledger["rolling_window"] = {}
            if "rolling_tokens" not in self.ledger:
                self.ledger["rolling_tokens"] = {}

            if model_name not in self.ledger["model_usage"]:
                self.ledger["model_usage"][model_name] = {"rpd": 0}
            if model_name not in self.ledger["rolling_window"]:
                self.ledger["rolling_window"][model_name] = []
            if model_name not in self.ledger["rolling_tokens"]:
                self.ledger["rolling_tokens"][model_name] = []

            # 2. PRO MODEL HARD PROJECT-LEVEL CAP CHECK
            if project_name and model_name in PRO_MODEL_PROJECT_CAPS:
                if project_name not in self.ledger["project_usage"]:
                    self.ledger["project_usage"][project_name] = {}
                
                p_usage = self.ledger["project_usage"][project_name].get(model_name, 0)
                max_p_reqs = PRO_MODEL_PROJECT_CAPS[model_name]["max_project_requests"]
                
                if p_usage >= max_p_reqs:
                    log_action("GOVERNOR", "PRO_MODEL_PROJECT_CAP_EXCEEDED", {
                        "model": model_name, 
                        "project": project_name, 
                        "count": p_usage, 
                        "cap": max_p_reqs
                    })
                    return False

            usage = self.ledger["model_usage"][model_name]
            
            # 3. HARD CEILING CHECK: Daily Requests Limit (RPD)
            if usage["rpd"] >= limits["rpd"]:
                log_action("GOVERNOR", "HARD_RPD_LIMIT_HIT", {"model": model_name, "rpd": usage["rpd"]})
                return False

            # Prune old entries from rolling windows (older than 60 seconds)
            self.ledger["rolling_window"][model_name] = [t for t in self.ledger["rolling_window"][model_name] if now_ts - t < 60]
            self.ledger["rolling_tokens"][model_name] = [pair for pair in self.ledger["rolling_tokens"][model_name] if now_ts - pair[0] < 60]

            current_rpm = len(self.ledger["rolling_window"][model_name])
            current_tpm = sum(pair[1] for pair in self.ledger["rolling_tokens"][model_name])

            # 4. RPM Cooling Check
            if current_rpm >= (limits["rpm"] - 1) and limits["rpm"] > 5:
                time.sleep(10)
                now_ts = time.time()

            # 5. Financial Shield: If approaching 85% TPM, return False to trigger cascading cloud/local fallback
            if (current_tpm + estimated_tokens) >= (limits["tpm"] * 0.85):
                log_action("GOVERNOR", "TPM_FINANCIAL_SHIELD_CAP", {"model": model_name, "current_tpm": current_tpm})
                return False

            # Record usage parameters
            self.ledger["rolling_window"][model_name].append(now_ts)
            self.ledger["rolling_tokens"][model_name].append((now_ts, estimated_tokens))
            usage["rpd"] += 1

            if project_name and model_name in PRO_MODEL_PROJECT_CAPS:
                self.ledger["project_usage"][project_name][model_name] = \
                    self.ledger["project_usage"][project_name].get(model_name, 0) + 1

            self._save_ledger_internal()
            return True

    def render_live_telemetry_snippet(self, model_name: str) -> str:
        """Renders live rolling RPM/TPM/RPD telemetry for dashboard displays."""
        with _GOVERNOR_LOCK:
            self.ledger = self._load_ledger_internal()
            if model_name not in FREE_BUDGET_REGISTRY:
                return "[RPM: 0/0 | TPM: 0K/0K | RPD: 0/0]"
            limits = FREE_BUDGET_REGISTRY[model_name]
            usage = self.ledger.get("model_usage", {}).get(model_name, {"rpd": 0})
            current_rpm = len(self.ledger.get("rolling_window", {}).get(model_name, []))
            current_tpm = sum(pair[1] for pair in self.ledger.get("rolling_tokens", {}).get(model_name, []))
            
            tpm_formatted = f"{round(current_tpm/1000, 1)}K"
            max_tpm_formatted = f"{int(limits['tpm']/1000)}K"
            return f"[RPM: {current_rpm}/{limits['rpm']} | TPM: {tpm_formatted}/{max_tpm_formatted} | RPD: {usage['rpd']}/{limits['rpd']}]"