import os
import json
import time
import uuid
import subprocess
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List

from src.logger import log_action
from src.config import (
    MODEL_REGISTRY,
    PRO_MODEL_PROJECT_CAPS,
    MODEL_CONSTRAINING_PROFILES,
    TOKEN_LEDGER_FILE,
    PROVIDER_QUOTAS_FILE,
    DEFAULT_PROVIDER_QUOTAS,
    MAX_SWARM_WORKERS,
    compute_working_limits,
    is_unlimited
)

# Indian Standard Time (IST: UTC + 5:30)
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now() -> datetime:
    """Returns current datetime explicitly in IST."""
    return datetime.now(IST)

def get_ist_date_str() -> str:
    """Returns YYYY-MM-DD date string in IST."""
    return get_ist_now().strftime("%Y-%m-%d")

# Alias for legacy compatibility
FREE_BUDGET_REGISTRY = MODEL_REGISTRY

def sync_wsl_time_from_internet():
    """Forces hardware clock sync in WSL environment silently."""
    try:
        subprocess.run(["sudo", "-n", "hwclock", "-s"], capture_output=True, text=True, timeout=5)
    except Exception:
        pass


class HierarchicalTokenGovernor:
    """
    Stage 14.1 Hierarchical Provider -> Tier -> Model Quota Engine
    and Atomic Pre/Post Lease Token Governor.
    """
    def __init__(self):
        sync_wsl_time_from_internet()
        self.lock = threading.RLock()
        
        # In-flight lease store: lease_id -> lease metadata
        self.in_flight_leases: Dict[str, Dict[str, Any]] = {}
        
        # Sliding 60-second in-memory windows keyed by bucket_key: "{provider}:{tier}:{key_id}:{model_name}"
        self.rolling_requests: Dict[str, List[float]] = {}
        self.rolling_tokens: Dict[str, List[tuple]] = {}  # List of (timestamp, tokens)
        self.bucket_rolling_window = self.rolling_requests
        self.bucket_rolling_tokens = self.rolling_tokens
        
        # Pacing tracker
        self._last_bucket_request_time: Dict[str, float] = {}
        
        with self.lock:
            self.quotas = self._load_quotas_internal()
            self.ledger = self._load_ledger_internal()
            self._check_and_reset_daily_caps_internal()

    # --------------------------------------------------------------------------
    # QUOTA CONFIGURATION PERSISTENCE (.agent_memory/provider_quotas.json)
    # --------------------------------------------------------------------------
    def _default_quotas_dict(self) -> Dict[str, Any]:
        return {
            "financial_shield": {
                "paid_tier_locked": False,
                "daily_paid_token_cap": 500000,
                "per_build_paid_token_cap": 150000,
                "enforce_working_limits": True,
                "safety_margin_percent": 85
            },
            "providers": DEFAULT_PROVIDER_QUOTAS
        }

    def _load_quotas_internal(self) -> Dict[str, Any]:
        if os.path.exists(PROVIDER_QUOTAS_FILE):
            try:
                with open(PROVIDER_QUOTAS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict) and "providers" in data and "financial_shield" in data:
                        return data
            except Exception as e:
                log_action("GOVERNOR", "QUOTA_FILE_LOAD_ERROR", {"error": str(e)})

        # Seed from defaults
        defaults = self._default_quotas_dict()
        os.makedirs(os.path.dirname(PROVIDER_QUOTAS_FILE), exist_ok=True)
        try:
            with open(PROVIDER_QUOTAS_FILE, "w", encoding="utf-8") as f:
                json.dump(defaults, f, indent=4)
        except Exception as e:
            log_action("GOVERNOR", "QUOTA_FILE_SEED_ERROR", {"error": str(e)})
        return defaults

    def _save_quotas_internal(self):
        os.makedirs(os.path.dirname(PROVIDER_QUOTAS_FILE), exist_ok=True)
        with open(PROVIDER_QUOTAS_FILE, "w", encoding="utf-8") as f:
            json.dump(self.quotas, f, indent=4)

    # --------------------------------------------------------------------------
    # USAGE LEDGER PERSISTENCE (.agent_memory/token_ledger.json)
    # --------------------------------------------------------------------------
    def _load_ledger_internal(self) -> Dict[str, Any]:
        if os.path.exists(TOKEN_LEDGER_FILE):
            try:
                with open(TOKEN_LEDGER_FILE, "r", encoding="utf-8") as f:
                    content = json.load(f)
                    if isinstance(content, dict):
                        # Ensure all essential root keys exist
                        content.setdefault("last_reset_date", get_ist_date_str())
                        content.setdefault("paid_tokens_today", 0)
                        content.setdefault("paid_tokens_current_build", 0)
                        content.setdefault("active_build_project", "default_project")
                        content.setdefault("bucket_usage", {})
                        content.setdefault("model_usage", {})
                        content.setdefault("project_usage", {})
                        content.setdefault("rolling_window", {})
                        content.setdefault("rolling_tokens", {})
                        return content
            except Exception as e:
                log_action("GOVERNOR", "LEDGER_LOAD_ERROR", {"error": str(e)})

        fresh_ledger = {
            "last_reset_date": get_ist_date_str(),
            "paid_tokens_today": 0,
            "bucket_usage": {},
            "model_usage": {},
            "project_usage": {},
            "rolling_window": {},
            "rolling_tokens": {}
        }
        return fresh_ledger

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
            log_action("GOVERNOR", "DAILY_130PM_RESET", {
                "previous_date": self.ledger.get("last_reset_date"),
                "new_date": current_date_str
            })
            self.ledger["last_reset_date"] = current_date_str
            self.ledger["paid_tokens_today"] = 0
            self.ledger["bucket_usage"] = {}
            self.ledger["model_usage"] = {}
            self.ledger["rolling_window"] = {}
            self.ledger["rolling_tokens"] = {}
            self.rolling_requests.clear()
            self.rolling_tokens.clear()
            self._save_ledger_internal()

    # --------------------------------------------------------------------------
    # HELPER & RESOLUTION METHODS
    # --------------------------------------------------------------------------
    def resolve_provider(self, model_name: str) -> str:
        """Determines the provider for a model based on hierarchy or known naming."""
        providers_dict = self.quotas.get("providers", {})
        for p_name, tiers in providers_dict.items():
            for t_name, models in tiers.items():
                if model_name in models:
                    return p_name
        # Fallback heuristics
        if model_name.startswith("gemini"):
            return "GOOGLE"
        elif model_name.startswith("llama") or "qwen-2.5-coder" in model_name:
            return "GROQ"
        elif "qwen2.5-coder" in model_name or ":" in model_name:
            return "OLLAMA"
        return "GOOGLE"

    def get_model_limits(self, provider: str, tier: str, model_name: str) -> Dict[str, Any]:
        """Looks up strict and working limits for a model under provider and tier."""
        p_data = self.quotas.get("providers", {}).get(provider, {})
        t_data = p_data.get(tier, {})
        m_data = t_data.get(model_name)
        
        if m_data and "strict_limits" in m_data and "working_limits" in m_data:
            return m_data
        
        # Generic safe fallbacks
        fallback_strict = {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192}
        fallback_working = {"rpm": 12, "tpm": 200000, "rpd": 425, "max_input_tokens": 8000, "max_output_tokens": 4096, "thinking_budget": 0}
        return {"strict_limits": fallback_strict, "working_limits": fallback_working}

    def _cleanup_expired_leases_and_windows(self, now_ts: float):
        """Purges orphaned leases (>180s) and prunes rolling 60s windows."""
        # 1. Expire leases older than 180 seconds
        expired_ids = [lid for lid, ldata in self.in_flight_leases.items() if (now_ts - ldata["timestamp"]) > 180.0]
        for lid in expired_ids:
            log_action("GOVERNOR", "EXPIRED_LEASE_REAPED", {"lease_id": lid})
            del self.in_flight_leases[lid]

        # 2. Prune in-memory sliding 60s windows
        for k in list(self.rolling_requests.keys()):
            self.rolling_requests[k] = [t for t in self.rolling_requests[k] if (now_ts - t) < 60.0]
        for k in list(self.rolling_tokens.keys()):
            self.rolling_tokens[k] = [p for p in self.rolling_tokens[k] if (now_ts - p[0]) < 60.0]

        # 3. Prune ledger rolling windows
        rw = self.ledger.get("rolling_window", {})
        for m in list(rw.keys()):
            rw[m] = [t for t in rw[m] if (now_ts - t) < 60.0]
        rt = self.ledger.get("rolling_tokens", {})
        for m in list(rt.keys()):
            rt[m] = [p for p in rt[m] if (now_ts - p[0]) < 60.0]

    # --------------------------------------------------------------------------
    # ATOMIC PRE-REQUEST LEASE ACQUISITION
    # --------------------------------------------------------------------------
    def acquire_lease(
        self,
        model_name: str,
        prompt_text: str = "",
        provider: Optional[str] = None,
        tier: str = "FREE",
        key_id: str = "default",
        requested_output_tokens: Optional[int] = None,
        requested_thinking_budget: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Pre-Request Atomic Token Lease Acquisition.
        Validates in-flight reservations, rolling RPM/TPM, daily RPD, and Paid Shield.
        """
        with self.lock:
            now_ts = time.time()
            self._cleanup_expired_leases_and_windows(now_ts)
            self._check_and_reset_daily_caps_internal()

            resolved_provider = provider or self.resolve_provider(model_name)
            tier_upper = tier.upper()
            shield = self.quotas.get("financial_shield", {})

            # 1. Financial Shield Check for Paid Tier
            if tier_upper == "PAID" and shield.get("paid_tier_locked", False):
                log_action("GOVERNOR", "PAID_TIER_LOCKED_BY_SHIELD", {
                    "model": model_name, "provider": resolved_provider, "tier": tier_upper
                })
                return {
                    "allowed": False,
                    "reason": "PAID_TIER_LOCKED_BY_SHIELD",
                    "retry_after_s": 0,
                    "provider": resolved_provider,
                    "tier": tier_upper,
                    "model_name": model_name
                }

            # 2. Retrieve Limits
            if key_id and key_id != "default":
                try:
                    from src.key_manager import key_manager
                    limits_bundle = key_manager.get_key_effective_limits(key_id, resolved_provider, tier_upper, model_name)
                except Exception:
                    limits_bundle = self.get_model_limits(resolved_provider, tier_upper, model_name)
            else:
                limits_bundle = self.get_model_limits(resolved_provider, tier_upper, model_name)
            enforce_working = shield.get("enforce_working_limits", True)
            active_limits = limits_bundle["working_limits"] if enforce_working else limits_bundle["strict_limits"]

            # 3. Estimate input tokens & check max_input_tokens ceiling
            est_input = max(1, int(len(prompt_text) / 3.5)) if prompt_text else 250
            max_input_limit = active_limits.get("max_input_tokens", 32768)
            input_truncated_needed = False
            if not is_unlimited(max_input_limit):
                try:
                    num_in_lim = int(max_input_limit)
                    if est_input > num_in_lim:
                        input_truncated_needed = True
                        est_input = num_in_lim
                except (ValueError, TypeError):
                    pass

            # 4. Determine max output tokens and thinking budget
            max_out_limit = active_limits.get("max_output_tokens", 4096)
            if is_unlimited(max_out_limit):
                max_out = requested_output_tokens or 4096
            else:
                try:
                    num_out_lim = int(max_out_limit)
                    max_out = min(requested_output_tokens or num_out_lim, num_out_lim)
                except (ValueError, TypeError):
                    max_out = requested_output_tokens or 4096
            
            allowed_thinking = active_limits.get("thinking_budget", 0)
            if is_unlimited(allowed_thinking):
                think_budget = requested_thinking_budget or 0
            else:
                try:
                    num_think = int(allowed_thinking)
                    if requested_thinking_budget is not None:
                        think_budget = min(requested_thinking_budget, num_think)
                    else:
                        think_budget = num_think
                except (ValueError, TypeError):
                    think_budget = 0

            reserved_total = est_input + max_out + think_budget
            bucket_key = f"{resolved_provider}:{tier_upper}:{key_id}:{model_name}"

            # 5. Sum current rolling usage + active in-flight leases for this bucket
            in_flight_for_bucket = [l for l in self.in_flight_leases.values() if l["bucket_key"] == bucket_key]
            in_flight_count = len(in_flight_for_bucket)
            in_flight_tokens = sum(l["reserved_total"] for l in in_flight_for_bucket)

            in_flight_paid_tokens = sum(
                l["reserved_total"] for l in self.in_flight_leases.values() if l["tier"] == "PAID"
            )

            rolling_req_count = len(self.rolling_requests.get(bucket_key, []))
            rolling_tok_count = sum(p[1] for p in self.rolling_tokens.get(bucket_key, []))

            b_usage = self.ledger.get("bucket_usage", {}).get(bucket_key, {})
            requests_today = b_usage.get("requests_today", 0)

            effective_rpm = rolling_req_count + in_flight_count
            effective_tpm = rolling_tok_count + in_flight_tokens
            effective_rpd = requests_today + in_flight_count

            # 6. Paid Tier Daily & Per-Build Token Cap Checks
            if tier_upper == "PAID":
                daily_paid_cap = shield.get("daily_paid_token_cap", 500000)
                per_build_cap = shield.get("per_build_paid_token_cap", 150000)
                paid_today = self.ledger.get("paid_tokens_today", 0)
                paid_build = self.ledger.get("paid_tokens_current_build", 0)

                if (paid_today + in_flight_paid_tokens + reserved_total) > daily_paid_cap:
                    log_action("GOVERNOR", "DAILY_PAID_TOKEN_CAP_REACHED", {
                        "paid_today": paid_today,
                        "in_flight": in_flight_paid_tokens,
                        "reserved_total": reserved_total,
                        "cap": daily_paid_cap
                    })
                    return {
                        "allowed": False,
                        "reason": "DAILY_PAID_TOKEN_CAP_REACHED",
                        "retry_after_s": 3600,
                        "limits": active_limits
                    }

                if (paid_build + in_flight_paid_tokens + reserved_total) > per_build_cap:
                    log_action("GOVERNOR", "PER_BUILD_PAID_TOKEN_CAP_REACHED", {
                        "paid_current_build": paid_build,
                        "in_flight": in_flight_paid_tokens,
                        "reserved_total": reserved_total,
                        "cap": per_build_cap
                    })
                    return {
                        "allowed": False,
                        "reason": "PER_BUILD_PAID_TOKEN_CAP_REACHED",
                        "retry_after_s": 60,
                        "limits": active_limits
                    }

            # 7. RPM Check (Using Working Limits or Strict Limits)
            limit_rpm = active_limits.get("rpm", 15)
            if not is_unlimited(limit_rpm):
                try:
                    num_rpm = int(limit_rpm)
                    if effective_rpm >= num_rpm:
                        base_interval = round(60.0 / max(1, num_rpm), 2)
                        log_action("GOVERNOR", "RPM_LIMIT_EXCEEDED", {
                            "bucket": bucket_key, "effective_rpm": effective_rpm, "limit": num_rpm
                        })
                        return {
                            "allowed": False,
                            "reason": "RPM_LIMIT_EXCEEDED",
                            "retry_after_s": base_interval,
                            "limits": active_limits
                        }
                except (ValueError, TypeError):
                    pass

            # 8. TPM Check
            limit_tpm = active_limits.get("tpm", 250000)
            if not is_unlimited(limit_tpm):
                try:
                    num_tpm = int(limit_tpm)
                    if (effective_tpm + reserved_total) > num_tpm:
                        log_action("GOVERNOR", "TPM_LIMIT_EXCEEDED", {
                            "bucket": bucket_key, "effective_tpm": effective_tpm, "reserved": reserved_total, "limit": num_tpm
                        })
                        return {
                            "allowed": False,
                            "reason": "TPM_LIMIT_EXCEEDED",
                            "retry_after_s": 15,
                            "limits": active_limits
                        }
                except (ValueError, TypeError):
                    pass

            # 9. RPD Check
            limit_rpd = active_limits.get("rpd", 500)
            if not is_unlimited(limit_rpd):
                try:
                    num_rpd = int(limit_rpd)
                    if effective_rpd >= num_rpd:
                        log_action("GOVERNOR", "RPD_LIMIT_EXCEEDED", {
                            "bucket": bucket_key, "effective_rpd": effective_rpd, "limit": num_rpd
                        })
                        return {
                            "allowed": False,
                            "reason": "RPD_LIMIT_EXCEEDED",
                            "retry_after_s": 86400,
                            "limits": active_limits
                        }
                except (ValueError, TypeError):
                    pass

            # 10. Calculate Staggered Pacing Delay
            if is_unlimited(limit_rpm):
                base_pacing = 0.0
            else:
                try:
                    num_rpm = max(1, int(limit_rpm))
                    base_pacing = round(60.0 / num_rpm, 2)
                except (ValueError, TypeError):
                    base_pacing = 0.0

            last_ts = self._last_bucket_request_time.get(bucket_key, 0)
            if base_pacing <= 0.0:
                pacing_delay_s = 0.0
            elif in_flight_count > 0:
                pacing_delay_s = round(base_pacing * in_flight_count, 2)
            elif (now_ts - last_ts) < base_pacing:
                pacing_delay_s = round(base_pacing - (now_ts - last_ts), 2)
            else:
                pacing_delay_s = 0.0

            self._last_bucket_request_time[bucket_key] = now_ts

            # 11. Register Atomic Lease
            lease_id = f"lease_{uuid.uuid4().hex[:12]}"
            lease_record = {
                "lease_id": lease_id,
                "bucket_key": bucket_key,
                "model_name": model_name,
                "provider": resolved_provider,
                "tier": tier_upper,
                "key_id": key_id,
                "reserved_input": est_input,
                "reserved_output": max_out,
                "reserved_thinking": think_budget,
                "reserved_total": reserved_total,
                "timestamp": now_ts
            }
            self.in_flight_leases[lease_id] = lease_record

            return {
                "allowed": True,
                "lease_id": lease_id,
                "provider": resolved_provider,
                "tier": tier_upper,
                "key_id": key_id,
                "model_name": model_name,
                "estimated_input_tokens": est_input,
                "enforced_max_input_tokens": max_input_limit,
                "enforced_max_output_tokens": max_out,
                "enforced_thinking_budget": think_budget,
                "reserved_total_tokens": reserved_total,
                "pacing_delay_s": pacing_delay_s,
                "input_truncated_needed": input_truncated_needed
            }

    # --------------------------------------------------------------------------
    # POST-REQUEST EXACT TOKEN RECONCILIATION
    # --------------------------------------------------------------------------
    def commit_lease(
        self,
        lease_id: Optional[str],
        model_name: str,
        actual_input_tokens: int,
        actual_output_tokens: int,
        actual_thinking_tokens: int = 0,
        provider: Optional[str] = None,
        tier: str = "FREE",
        key_id: str = "default",
        project_name: str = "default_project",
        success: bool = True
    ) -> Dict[str, Any]:
        """
        Reconciles in-flight pre-reservation with actual tokens consumed.
        Releases the lease and updates ledger counters.
        """
        with self.lock:
            # 1. Pop the lease if present
            lease_data = None
            if lease_id and lease_id in self.in_flight_leases:
                lease_data = self.in_flight_leases.pop(lease_id)

            resolved_provider = provider or (lease_data["provider"] if lease_data else self.resolve_provider(model_name))
            tier_upper = (lease_data["tier"] if lease_data else tier).upper()
            resolved_key_id = lease_data["key_id"] if lease_data else key_id
            bucket_key = f"{resolved_provider}:{tier_upper}:{resolved_key_id}:{model_name}"

            # 2. If unsuccessful execution, release lease without charging
            if not success:
                log_action("GOVERNOR", "LEASE_RELEASED_FAILED_EXEC", {"lease_id": lease_id, "bucket": bucket_key})
                return {"reconciled": True, "success": False, "tokens_charged": 0, "lease_id": lease_id}

            now_ts = time.time()
            total_actual = actual_input_tokens + actual_output_tokens + actual_thinking_tokens

            # 3. Record in rolling 60s windows
            if bucket_key not in self.rolling_requests:
                self.rolling_requests[bucket_key] = []
            if bucket_key not in self.rolling_tokens:
                self.rolling_tokens[bucket_key] = []
            self.rolling_requests[bucket_key].append(now_ts)
            self.rolling_tokens[bucket_key].append((now_ts, total_actual))

            # Maintain legacy model-level rolling windows
            if model_name not in self.ledger["rolling_window"]:
                self.ledger["rolling_window"][model_name] = []
            if model_name not in self.ledger["rolling_tokens"]:
                self.ledger["rolling_tokens"][model_name] = []
            self.ledger["rolling_window"][model_name].append(now_ts)
            self.ledger["rolling_tokens"][model_name].append((now_ts, total_actual))

            # 4. Update Bucket Usage
            if bucket_key not in self.ledger["bucket_usage"]:
                self.ledger["bucket_usage"][bucket_key] = {
                    "requests_today": 0,
                    "input_tokens_today": 0,
                    "output_tokens_today": 0,
                    "thinking_tokens_today": 0,
                    "total_tokens_today": 0
                }
            b_usage = self.ledger["bucket_usage"][bucket_key]
            b_usage["requests_today"] += 1
            b_usage["input_tokens_today"] += actual_input_tokens
            b_usage["output_tokens_today"] += actual_output_tokens
            b_usage["thinking_tokens_today"] += actual_thinking_tokens
            b_usage["total_tokens_today"] += total_actual

            # 5. Update Aggregated Model Usage
            if model_name not in self.ledger["model_usage"]:
                self.ledger["model_usage"][model_name] = {
                    "requests_today": 0,
                    "tokens_today": 0,
                    "input_tokens_today": 0,
                    "output_tokens_today": 0,
                    "thinking_tokens_today": 0,
                    "rpd": 0
                }
            m_usage = self.ledger["model_usage"][model_name]
            m_usage["requests_today"] = m_usage.get("requests_today", 0) + 1
            m_usage["rpd"] = m_usage.get("rpd", 0) + 1
            m_usage["input_tokens_today"] = m_usage.get("input_tokens_today", 0) + actual_input_tokens
            m_usage["output_tokens_today"] = m_usage.get("output_tokens_today", 0) + actual_output_tokens
            m_usage["thinking_tokens_today"] = m_usage.get("thinking_tokens_today", 0) + actual_thinking_tokens
            m_usage["tokens_today"] = m_usage.get("tokens_today", 0) + total_actual

            # 6. Update Project Usage
            if project_name:
                if project_name not in self.ledger["project_usage"]:
                    self.ledger["project_usage"][project_name] = {}
                p_dict = self.ledger["project_usage"][project_name]
                # If existing structure uses model_name keys
                if model_name not in p_dict:
                    p_dict[model_name] = 0
                p_dict[model_name] += 1
                
                # Also maintain aggregated project token metrics
                p_dict["total_requests"] = p_dict.get("total_requests", 0) + 1
                p_dict["total_tokens"] = p_dict.get("total_tokens", 0) + total_actual

            # 7. Paid Tier Daily & Per-Build Counter
            if tier_upper == "PAID":
                self.ledger["paid_tokens_today"] = self.ledger.get("paid_tokens_today", 0) + total_actual
                self.ledger["paid_tokens_current_build"] = self.ledger.get("paid_tokens_current_build", 0) + total_actual

            self._save_ledger_internal()

            return {
                "reconciled": True,
                "success": True,
                "tokens_charged": total_actual,
                "lease_id": lease_id,
                "bucket": bucket_key
            }

    @property
    def active_build_project(self) -> str:
        with self.lock:
            return self.ledger.get("active_build_project", "default_project")

    @property
    def paid_tokens_current_build(self) -> int:
        with self.lock:
            return self.ledger.get("paid_tokens_current_build", 0)

    @property
    def paid_tokens_today(self) -> int:
        with self.lock:
            return self.ledger.get("paid_tokens_today", 0)

    def reset_build_counter(self, project_name: str = "default_project") -> None:
        """
        Resets paid_tokens_current_build = 0 and sets active_build_project = project_name
        at the start of a new build cycle.
        """
        with self.lock:
            self.ledger["paid_tokens_current_build"] = 0
            self.ledger["active_build_project"] = project_name
            self._save_ledger_internal()
            log_action("GOVERNOR", "BUILD_COUNTER_RESET", {
                "project_name": project_name,
                "paid_tokens_current_build": 0
            })

    def reload_state(self) -> None:
        """Reloads quotas and ledger from disk and clears in-memory tracking structures."""
        with self.lock:
            self.in_flight_leases.clear()
            self.rolling_requests.clear()
            self.rolling_tokens.clear()
            self._last_bucket_request_time.clear()
            self.quotas = self._load_quotas_internal()
            self.ledger = self._load_ledger_internal()
            self._check_and_reset_daily_caps_internal()

    def release_lease(self, lease_id: str) -> bool:
        """Explicitly cancels an in-flight pre-reservation without charging tokens."""
        with self.lock:
            if lease_id in self.in_flight_leases:
                del self.in_flight_leases[lease_id]
                return True
            return False

    # --------------------------------------------------------------------------
    # MANAGEMENT & HIERARCHY CRUD METHODS
    # --------------------------------------------------------------------------
    def get_hierarchy_telemetry(self) -> Dict[str, Any]:
        """
        Returns the full Provider -> Tier -> Model hierarchy enriched with
        live rolling RPM/TPM, in-flight reservations, and ledger counters.
        """
        with self.lock:
            now_ts = time.time()
            self._cleanup_expired_leases_and_windows(now_ts)
            providers_out = {}

            for p_name, tiers in self.quotas.get("providers", {}).items():
                providers_out[p_name] = {}
                for t_name, models in tiers.items():
                    providers_out[p_name][t_name] = {}
                    for m_name, m_cfg in models.items():
                        bucket_key = f"{p_name}:{t_name}:default:{m_name}"
                        
                        # Live rolling values
                        rolling_req = len(self.rolling_requests.get(bucket_key, []))
                        rolling_tok = sum(p[1] for p in self.rolling_tokens.get(bucket_key, []))

                        # In-flight counts
                        in_flight = [l for l in self.in_flight_leases.values() if l["model_name"] == m_name and l["tier"] == t_name]
                        in_flight_count = len(in_flight)
                        in_flight_tokens = sum(l["reserved_total"] for l in in_flight)

                        # Ledger today values
                        b_usage = self.ledger.get("bucket_usage", {}).get(bucket_key, {})
                        
                        providers_out[p_name][t_name][m_name] = {
                            "strict_limits": m_cfg.get("strict_limits", {}),
                            "working_limits": m_cfg.get("working_limits", {}),
                            "rolling_rpm": rolling_req,
                            "rolling_tpm": rolling_tok,
                            "in_flight_requests": in_flight_count,
                            "in_flight_reserved_tokens": in_flight_tokens,
                            "requests_today": b_usage.get("requests_today", 0),
                            "input_tokens_today": b_usage.get("input_tokens_today", 0),
                            "output_tokens_today": b_usage.get("output_tokens_today", 0),
                            "thinking_tokens_today": b_usage.get("thinking_tokens_today", 0),
                            "total_tokens_today": b_usage.get("total_tokens_today", 0)
                        }

            shield = self.quotas.get("financial_shield", {})
            return {
                "financial_shield": shield,
                "paid_tokens_today": self.ledger.get("paid_tokens_today", 0),
                "paid_tokens_current_build": self.ledger.get("paid_tokens_current_build", 0),
                "per_build_paid_token_cap": shield.get("per_build_paid_token_cap", 150000),
                "active_build_project": self.ledger.get("active_build_project", "default_project"),
                "last_reset_date": self.ledger.get("last_reset_date", ""),
                "active_in_flight_leases": len(self.in_flight_leases),
                "providers": providers_out,
                "key_quotas": self.get_key_quota_telemetry()
            }


    def get_key_quota_telemetry(self, key_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns a complete per-key breakdown for registered keys (and default),
        showing key_id, label, provider, tier, safety_margin_percent (85%), and
        per-model strict_limits, working_limits, rolling_rpm, rolling_tpm, requests_today,
        input_tokens_today, output_tokens_today, thinking_tokens_today, in_flight_requests,
        and has_custom_override.
        """
        with self.lock:
            now_ts = time.time()
            self._cleanup_expired_leases_and_windows(now_ts)

            from src.key_manager import key_manager
            registered_keys = key_manager.get_masked_keys()

            def _build_key_telemetry(k_info: Dict[str, Any]) -> Dict[str, Any]:
                kid = k_info.get("id")
                k_prov = k_info.get("provider", "GOOGLE")
                k_tier = k_info.get("tier", "FREE")
                k_margin = k_info.get("safety_margin_percent", 85)
                k_custom = k_info.get("custom_model_limits", {})

                # Models applicable to this provider & tier
                tier_models = self.quotas.get("providers", {}).get(k_prov, {}).get(k_tier, {})
                all_model_names = set(tier_models.keys()).union(k_custom.keys())

                models_telemetry = {}
                for m_name in sorted(all_model_names):
                    bucket_key = f"{k_prov}:{k_tier}:{kid}:{m_name}"

                    eff_limits = key_manager.get_key_effective_limits(kid, k_prov, k_tier, m_name)
                    has_override = (m_name in k_custom)

                    rolling_req = len(self.rolling_requests.get(bucket_key, []))
                    rolling_tok = sum(p[1] for p in self.rolling_tokens.get(bucket_key, []))

                    in_flight = [l for l in self.in_flight_leases.values() if l.get("bucket_key") == bucket_key]
                    in_flight_count = len(in_flight)

                    b_usage = self.ledger.get("bucket_usage", {}).get(bucket_key, {})

                    models_telemetry[m_name] = {
                        "strict_limits": eff_limits.get("strict_limits", {}),
                        "working_limits": eff_limits.get("working_limits", {}),
                        "rolling_rpm": rolling_req,
                        "rolling_tpm": rolling_tok,
                        "requests_today": b_usage.get("requests_today", 0),
                        "input_tokens_today": b_usage.get("input_tokens_today", 0),
                        "output_tokens_today": b_usage.get("output_tokens_today", 0),
                        "thinking_tokens_today": b_usage.get("thinking_tokens_today", 0),
                        "total_tokens_today": b_usage.get("total_tokens_today", 0),
                        "in_flight_requests": in_flight_count,
                        "has_custom_override": has_override
                    }

                return {
                    "key_id": kid,
                    "label": k_info.get("label", kid),
                    "provider": k_prov,
                    "tier": k_tier,
                    "safety_margin_percent": k_margin,
                    "status": k_info.get("status", "ACTIVE"),
                    "models": models_telemetry
                }

            if key_id:
                target_key = next((k for k in registered_keys if k.get("id") == key_id), None)
                if not target_key and key_id == "default":
                    target_key = {
                        "id": "default",
                        "label": "Default System / Env Key",
                        "provider": "GOOGLE",
                        "tier": "FREE",
                        "safety_margin_percent": self.quotas.get("financial_shield", {}).get("safety_margin_percent", 85),
                        "custom_model_limits": {},
                        "status": "ACTIVE"
                    }
                if target_key:
                    return {
                        "status": "success",
                        "key_id": key_id,
                        "telemetry": _build_key_telemetry(target_key)
                    }
                return {
                    "status": "error",
                    "message": f"Key ID '{key_id}' not found",
                    "key_id": key_id
                }

            all_telemetry = {}
            for k in registered_keys:
                all_telemetry[k["id"]] = _build_key_telemetry(k)

            default_info = {
                "id": "default",
                "label": "Default System / Env Key",
                "provider": "GOOGLE",
                "tier": "FREE",
                "safety_margin_percent": self.quotas.get("financial_shield", {}).get("safety_margin_percent", 85),
                "custom_model_limits": {},
                "status": "ACTIVE"
            }
            all_telemetry["default"] = _build_key_telemetry(default_info)

            return {
                "status": "success",
                "total_keys": len(all_telemetry),
                "keys": all_telemetry
            }

    def recalculate_all_working_limits(self, margin_pct: int = 85) -> Dict[str, Any]:
        """
        Loops through every Provider -> Tier -> Model in .agent_memory/provider_quotas.json,
        updates financial_shield['safety_margin_percent'] = margin_pct,
        recalculates working_limits = compute_working_limits(strict_limits, margin_pct, existing_thinking_budget),
        and saves cleanly to .agent_memory/provider_quotas.json.
        """
        margin = max(10, min(100, int(margin_pct)))
        with self.lock:
            shield = self.quotas.setdefault("financial_shield", {})
            shield["safety_margin_percent"] = margin

            from src.config import compute_working_limits, is_unlimited
            providers = self.quotas.setdefault("providers", {})
            for p_name, tiers in providers.items():
                for t_name, models in tiers.items():
                    for m_name, m_cfg in models.items():
                        strict_limits = m_cfg.get("strict_limits", {})
                        if not strict_limits:
                            strict_limits = m_cfg.get("working_limits", {}).copy()
                            m_cfg["strict_limits"] = strict_limits

                        existing_working = m_cfg.get("working_limits", {})
                        thinking_budget = existing_working.get("thinking_budget", 0)

                        m_cfg["working_limits"] = compute_working_limits(
                            strict_limits=strict_limits,
                            margin_pct=margin,
                            thinking_budget=thinking_budget
                        )

            self._save_quotas_internal()
            return self.get_hierarchy_telemetry()

    def sync_live_and_offline_models(self) -> Dict[str, Any]:
        """
        Syncs models from:
        1. Offline Benchmark Database (/mnt/d/Project_Files/Ollama_Models_Testing)
        2. Live Google AI Studio API (GET https://generativelanguage.googleapis.com/v1beta/models)
        3. Live Groq API (GET https://api.groq.com/openai/v1/models)
        4. Live Local Ollama Daemon (GET http://127.0.0.1:11434/api/tags)
        and applies exact 85% working limits.
        """
        with self.lock:
            from src.config import compute_working_limits, is_unlimited, DEFAULT_PROVIDER_QUOTAS
            margin_pct = self.quotas.get("financial_shield", {}).get("safety_margin_percent", 85)

            providers = self.quotas.setdefault("providers", {})
            google_tiers = providers.setdefault("GOOGLE", {})
            google_free = google_tiers.setdefault("FREE", {})
            google_paid = google_tiers.setdefault("PAID", {})

            groq_tiers = providers.setdefault("GROQ", {})
            groq_free = groq_tiers.setdefault("FREE", {})
            groq_paid = groq_tiers.setdefault("PAID", {})

            ollama_tiers = providers.setdefault("OLLAMA", {})
            ollama_local = ollama_tiers.setdefault("LOCAL", {})

            # Seed base models from DEFAULT_PROVIDER_QUOTAS if missing
            for p_key in ["GOOGLE", "GROQ", "OLLAMA"]:
                for t_key in DEFAULT_PROVIDER_QUOTAS.get(p_key, {}):
                    for m_key, m_val in DEFAULT_PROVIDER_QUOTAS[p_key][t_key].items():
                        if m_key not in providers[p_key].setdefault(t_key, {}):
                            providers[p_key][t_key][m_key] = {
                                "strict_limits": m_val["strict_limits"].copy(),
                                "working_limits": m_val["working_limits"].copy()
                            }

            # ------------------------------------------------------------------
            # Source 1: Offline Benchmark Database
            # ------------------------------------------------------------------
            bench_base = "/mnt/d/Project_Files/Ollama_Models_Testing"
            tier1_matrix_path = os.path.join(bench_base, "config", "gemini_tier1_matrix.json")
            if os.path.exists(tier1_matrix_path):
                try:
                    with open(tier1_matrix_path, "r", encoding="utf-8") as f:
                        t1_data = json.load(f)
                        t1_models = t1_data.get("models", {})
                        if isinstance(t1_models, dict):
                            for mid, minfo in t1_models.items():
                                if isinstance(minfo, dict):
                                    rpm = minfo.get("rpm", 1000)
                                    tpm = minfo.get("tpm", 1000000)
                                    rpd = minfo.get("rpd", 10000)
                                    ctx = min(minfo.get("context_window", 128000), 128000)
                                    out = 8192
                                    think = 2048 if "pro" in mid.lower() else (512 if "flash" in mid.lower() else 0)
                                    strict = {"rpm": rpm, "tpm": tpm, "rpd": rpd, "max_input_tokens": ctx, "max_output_tokens": out}
                                    if mid not in google_paid:
                                        google_paid[mid] = {
                                            "strict_limits": strict,
                                            "working_limits": compute_working_limits(strict, margin_pct, think)
                                        }
                except Exception as e:
                    log_action("GOVERNOR", "TIER1_MATRIX_SYNC_ERROR", {"error": str(e)})

            cloud_quotas_path = os.path.join(bench_base, "config", "cloud_quotas.json")
            if os.path.exists(cloud_quotas_path):
                try:
                    with open(cloud_quotas_path, "r", encoding="utf-8") as f:
                        cq_data = json.load(f)
                        cq_free = cq_data.get("quotas", {}).get("FREE_TIER", {})
                        if isinstance(cq_free, dict):
                            for mname, mlimits in cq_free.items():
                                if mname.startswith("gemini-") or mname.startswith("gemma-"):
                                    if mlimits.get("available", True) and mname not in google_free:
                                        rpm = mlimits.get("rpm", 15)
                                        tpm = mlimits.get("tpm", 250000)
                                        rpd = mlimits.get("rpd", 500)
                                        ctx = 32768
                                        out = 8192
                                        think = 2048 if "pro" in mname.lower() else (512 if "flash" in mname.lower() else 0)
                                        strict = {"rpm": rpm, "tpm": tpm, "rpd": rpd, "max_input_tokens": ctx, "max_output_tokens": out}
                                        google_free[mname] = {
                                            "strict_limits": strict,
                                            "working_limits": compute_working_limits(strict, margin_pct, think)
                                        }
                except Exception as e:
                    log_action("GOVERNOR", "CLOUD_QUOTAS_SYNC_ERROR", {"error": str(e)})

            # ------------------------------------------------------------------
            # Source 2: Live Google AI Studio API
            # ------------------------------------------------------------------
            try:
                from src.key_manager import key_manager
                raw_google_key = None
                env_k = os.getenv("GEMINI_API_KEY")
                if env_k and env_k.strip():
                    raw_google_key = env_k.strip()
                else:
                    for k in key_manager._load_raw().get("keys", []):
                        if k.get("provider", "GOOGLE") == "GOOGLE" and k.get("key"):
                            raw_google_key = k["key"].strip()
                            break

                if raw_google_key:
                    import urllib.request
                    import urllib.error
                    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={raw_google_key}"
                    req = urllib.request.Request(url, headers={"User-Agent": "AdvanceAssistant-OS/6.0"})
                    try:
                        with urllib.request.urlopen(req, timeout=5) as resp:
                            if resp.status == 200:
                                g_data = json.loads(resp.read().decode("utf-8"))
                                for gm in g_data.get("models", []):
                                    if "generateContent" in gm.get("supportedGenerationMethods", []):
                                        g_name = gm.get("name", "").replace("models/", "")
                                        in_tokens = gm.get("inputTokenLimit", 32768)
                                        out_tokens = gm.get("outputTokenLimit", 8192)
                                        think = 2048 if "pro" in g_name.lower() else (512 if "flash" in g_name.lower() else 0)

                                        # Update existing model records without overwriting custom rate ceilings
                                        if g_name in google_paid:
                                            google_paid[g_name]["strict_limits"]["max_input_tokens"] = in_tokens
                                            google_paid[g_name]["strict_limits"]["max_output_tokens"] = min(out_tokens, 8192)
                                            google_paid[g_name]["working_limits"] = compute_working_limits(google_paid[g_name]["strict_limits"], margin_pct, think)
                                        else:
                                            strict_p = {"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": min(in_tokens, 128000), "max_output_tokens": min(out_tokens, 8192)}
                                            google_paid[g_name] = {
                                                "strict_limits": strict_p,
                                                "working_limits": compute_working_limits(strict_p, margin_pct, think)
                                            }

                                        if ("flash" in g_name.lower() or "pro" in g_name.lower() or "gemma" in g_name.lower()):
                                            if g_name in google_free:
                                                google_free[g_name]["strict_limits"]["max_input_tokens"] = in_tokens
                                                google_free[g_name]["strict_limits"]["max_output_tokens"] = min(out_tokens, 8192)
                                                google_free[g_name]["working_limits"] = compute_working_limits(google_free[g_name]["strict_limits"], margin_pct, think)
                                            else:
                                                strict_f = {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": min(in_tokens, 32768), "max_output_tokens": min(out_tokens, 8192)}
                                                google_free[g_name] = {
                                                    "strict_limits": strict_f,
                                                    "working_limits": compute_working_limits(strict_f, margin_pct, think)
                                                }
                    except urllib.error.HTTPError as he:
                        # Cleanly handle HTTP 400 or other errors when keys are mock/invalid
                        log_action("GOVERNOR", "GOOGLE_LIVE_SYNC_HTTP_SKIP", {"code": he.code, "msg": str(he)})
                    except Exception as he_err:
                        log_action("GOVERNOR", "GOOGLE_LIVE_SYNC_SKIP", {"reason": str(he_err)})
            except Exception as e:
                log_action("GOVERNOR", "GOOGLE_LIVE_SYNC_SKIP", {"reason": str(e)})

            # ------------------------------------------------------------------
            # Source 3: Live Groq API
            # ------------------------------------------------------------------
            try:
                from src.key_manager import key_manager
                raw_groq_key = None
                env_gr = os.getenv("GROQ_API_KEY")
                if env_gr and env_gr.strip():
                    raw_groq_key = env_gr.strip()
                else:
                    for k in key_manager._load_raw().get("keys", []):
                        if k.get("provider") == "GROQ" and k.get("key"):
                            raw_groq_key = k["key"].strip()
                            break

                if raw_groq_key:
                    import urllib.request
                    url = "https://api.groq.com/openai/v1/models"
                    req = urllib.request.Request(url, headers={
                        "Authorization": f"Bearer {raw_groq_key}",
                        "User-Agent": "AdvanceAssistant-OS/6.0"
                    })
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        if resp.status == 200:
                            gr_data = json.loads(resp.read().decode("utf-8"))
                            for grm in gr_data.get("data", []):
                                gid = grm.get("id", "")
                                if gid and (gid.startswith("llama") or "qwen" in gid or "deepseek" in gid or "mixtral" in gid):
                                    if gid not in groq_free:
                                        strict_gf = {"rpm": 30, "tpm": 15000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096}
                                        groq_free[gid] = {
                                            "strict_limits": strict_gf,
                                            "working_limits": compute_working_limits(strict_gf, margin_pct, 0)
                                        }
                                    if gid not in groq_paid:
                                        strict_gp = {"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192}
                                        groq_paid[gid] = {
                                            "strict_limits": strict_gp,
                                            "working_limits": compute_working_limits(strict_gp, margin_pct, 0)
                                        }
            except Exception as e:
                log_action("GOVERNOR", "GROQ_LIVE_SYNC_SKIP", {"reason": str(e)})

            # ------------------------------------------------------------------
            # Source 4: Live Local Ollama Daemon
            # ------------------------------------------------------------------
            try:
                import urllib.request
                with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=3) as resp:
                    if resp.status == 200:
                        ol_data = json.loads(resp.read().decode("utf-8"))
                        for om in ol_data.get("models", []):
                            oname = om.get("name", "")
                            if oname and oname not in ollama_local:
                                strict_ol = {"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}
                                ollama_local[oname] = {
                                    "strict_limits": strict_ol,
                                    "working_limits": compute_working_limits(strict_ol, margin_pct, 0)
                                }
            except Exception as e:
                log_action("GOVERNOR", "OLLAMA_LIVE_SYNC_SKIP", {"reason": str(e)})

            # Finalize and recalculate all working limits at exact margin_pct
            self.recalculate_all_working_limits(margin_pct)

            return {
                "status": "success",
                "google_free_count": len(google_free),
                "google_paid_count": len(google_paid),
                "groq_count": len(groq_free),
                "ollama_count": len(ollama_local),
                "margin_applied_pct": margin_pct,
                "synced_at": get_ist_now().strftime("%Y-%m-%d %H:%M:%S IST")
            }

    def update_model_limits(
        self,
        provider: str,
        tier: str,
        model_name: str,
        working_limits: Dict[str, int],
        strict_limits: Optional[Dict[str, int]] = None
    ) -> Dict[str, Any]:
        """Updates working and/or strict limits for an existing model."""
        with self.lock:
            p_upper = provider.upper()
            t_upper = tier.upper()
            providers = self.quotas.setdefault("providers", {})
            p_dict = providers.setdefault(p_upper, {})
            t_dict = p_dict.setdefault(t_upper, {})
            
            if model_name not in t_dict:
                t_dict[model_name] = {}
            
            if strict_limits:
                t_dict[model_name]["strict_limits"] = strict_limits
            elif "strict_limits" not in t_dict[model_name]:
                t_dict[model_name]["strict_limits"] = working_limits.copy()
                
            t_dict[model_name]["working_limits"] = working_limits
            self._save_quotas_internal()
            return {"updated": True, "model": model_name, "limits": t_dict[model_name]}

    def add_or_update_provider_model(
        self,
        provider: str,
        tier: str,
        model_name: str,
        strict_limits: Dict[str, int],
        working_limits: Dict[str, int]
    ) -> Dict[str, Any]:
        """Dynamically registers or updates a model under provider and tier."""
        with self.lock:
            p_upper = provider.upper()
            t_upper = tier.upper()
            providers = self.quotas.setdefault("providers", {})
            p_dict = providers.setdefault(p_upper, {})
            t_dict = p_dict.setdefault(t_upper, {})
            
            t_dict[model_name] = {
                "strict_limits": strict_limits,
                "working_limits": working_limits
            }
            self._save_quotas_internal()
            return {"registered": True, "provider": p_upper, "tier": t_upper, "model": model_name}

    def update_financial_shield(
        self,
        paid_tier_locked: Optional[bool] = None,
        daily_paid_token_cap: Optional[int] = None,
        per_build_paid_token_cap: Optional[int] = None,
        enforce_working_limits: Optional[bool] = None,
        safety_margin_percent: Optional[int] = None
    ) -> Dict[str, Any]:
        """Modifies Financial Shield properties and persists to provider_quotas.json."""
        with self.lock:
            shield = self.quotas.setdefault("financial_shield", {})
            if paid_tier_locked is not None:
                shield["paid_tier_locked"] = paid_tier_locked
            if daily_paid_token_cap is not None:
                shield["daily_paid_token_cap"] = daily_paid_token_cap
            if per_build_paid_token_cap is not None:
                shield["per_build_paid_token_cap"] = per_build_paid_token_cap
            if enforce_working_limits is not None:
                shield["enforce_working_limits"] = enforce_working_limits
            if safety_margin_percent is not None:
                shield["safety_margin_percent"] = safety_margin_percent
                
            self._save_quotas_internal()
            return {"updated": True, "financial_shield": shield}

    def calculate_safe_concurrency(
        self,
        provider: str,
        tier: str,
        model_name: str,
        active_keys_count: int = 1
    ) -> int:
        """
        Calculates safe swarm worker concurrency given model working RPM and active key pool.
        """
        with self.lock:
            limits = self.get_model_limits(provider, tier, model_name)
            working_rpm = limits["working_limits"].get("rpm", 15)
            # Safe concurrency scales with keys and rpm, bounded by [1, MAX_SWARM_WORKERS]
            concurrency = max(1, min(MAX_SWARM_WORKERS, int(working_rpm * max(1, active_keys_count) / 2.0)))
            return concurrency

    # --------------------------------------------------------------------------
    # BACKWARD COMPATIBILITY WRAPPERS
    # --------------------------------------------------------------------------
    def is_model_allowed_by_profile(self, model_name: str, profile_name: str = "HIGH_RPM_TPM") -> bool:
        """Checks if a model is permitted under the active Model Constraining Profile."""
        if profile_name in MODEL_CONSTRAINING_PROFILES:
            allowed = MODEL_CONSTRAINING_PROFILES[profile_name]["allowed_models"]
            return model_name in allowed
        return True

    def reset_if_new_day(self):
        """Forces verification and flush of daily caps if new day in IST."""
        with self.lock:
            self._check_and_reset_daily_caps_internal()

    def can_execute(
        self,
        model_name: str,
        estimated_tokens: int = 0,
        tier: str = "FREE",
        key_id: str = "default"
    ) -> bool:
        """Probe method to check if a request can be executed."""
        res = self.acquire_lease(
            model_name=model_name,
            prompt_text="a" * int(estimated_tokens * 3.5) if estimated_tokens else "",
            tier=tier,
            key_id=key_id
        )
        if res.get("allowed"):
            self.release_lease(res["lease_id"])
            return True
        return False

    def record_execution(
        self,
        model_name: str,
        tokens_used: int,
        project_name: str = "default_project",
        input_tokens: int = 0,
        output_tokens: int = 0,
        thinking_tokens: int = 0,
        tier: str = "FREE",
        key_id: str = "default"
    ) -> Dict[str, Any]:
        """Legacy direct post-execution recording."""
        inp = input_tokens if input_tokens > 0 else int(tokens_used * 0.75)
        out = output_tokens if output_tokens > 0 else max(1, tokens_used - inp)
        return self.commit_lease(
            lease_id=None,
            model_name=model_name,
            actual_input_tokens=inp,
            actual_output_tokens=out,
            actual_thinking_tokens=thinking_tokens,
            tier=tier,
            key_id=key_id,
            project_name=project_name,
            success=True
        )

    def get_telemetry_string(self, model_name: Optional[str] = None) -> str:
        """Legacy telemetry string generator."""
        if model_name:
            return self.render_live_telemetry_snippet(model_name)
        # Summary across registered models
        with self.lock:
            items = []
            for m in list(MODEL_REGISTRY.keys())[:3]:
                items.append(self.render_live_telemetry_snippet(m))
            return " | ".join(items)

    def get_model_selection_context(self) -> Dict[str, Any]:
        """Provides runtime context for model routing arbitration."""
        with self.lock:
            context = {}
            for m_name in MODEL_REGISTRY:
                context[m_name] = {
                    "can_execute": self.can_execute(m_name),
                    "telemetry": self.render_live_telemetry_snippet(m_name)
                }
            return context

    def inspect_and_cool_allocation(
        self,
        model_name: str,
        estimated_tokens: int = 4000,
        requires_search: bool = False,
        project_name: str = None,
        constraining_profile: str = "HIGH_RPM_TPM"
    ) -> bool:
        """
        Backward-compatible v6.0 quota interceptor with model profile filtering,
        project pro caps, burst pacing, and 85% TPM safety caps.
        """
        # 0. Profile Filter Check
        if not self.is_model_allowed_by_profile(model_name, constraining_profile):
            return False

        if model_name not in FREE_BUDGET_REGISTRY:
            return False

        limits = FREE_BUDGET_REGISTRY[model_name]

        with self.lock:
            now_ts = time.time()
            self._cleanup_expired_leases_and_windows(now_ts)
            self._check_and_reset_daily_caps_internal()

            # Pacing spacing
            min_spacing = 1.5 if "pro" in model_name else 0.3
            last_ts = self._last_bucket_request_time.get(model_name, 0)
            if (now_ts - last_ts) < min_spacing:
                time.sleep(min_spacing - (now_ts - last_ts))
                now_ts = time.time()
            self._last_bucket_request_time[model_name] = now_ts

            # Pro project cap check
            if project_name and model_name in PRO_MODEL_PROJECT_CAPS:
                if project_name not in self.ledger["project_usage"]:
                    self.ledger["project_usage"][project_name] = {}
                p_usage = self.ledger["project_usage"][project_name].get(model_name, 0)
                max_p_reqs = PRO_MODEL_PROJECT_CAPS[model_name]["max_project_requests"]
                if p_usage >= max_p_reqs:
                    log_action("GOVERNOR", "PRO_MODEL_PROJECT_CAP_EXCEEDED", {
                        "model": model_name, "project": project_name, "count": p_usage, "cap": max_p_reqs
                    })
                    return False

            # Daily RPD check
            m_usage = self.ledger["model_usage"].setdefault(model_name, {"rpd": 0})
            if not is_unlimited(limits.get("rpd")):
                try:
                    if m_usage.get("rpd", 0) >= int(limits["rpd"]):
                        log_action("GOVERNOR", "HARD_RPD_LIMIT_HIT", {"model": model_name, "rpd": m_usage["rpd"]})
                        return False
                except (ValueError, TypeError):
                    pass

            # Rolling window calculations
            rw = self.ledger["rolling_window"].setdefault(model_name, [])
            rt = self.ledger["rolling_tokens"].setdefault(model_name, [])
            current_rpm = len(rw)
            current_tpm = sum(pair[1] for pair in rt)

            # RPM Cooling Check
            if not is_unlimited(limits.get("rpm")):
                try:
                    num_rpm = int(limits["rpm"])
                    if current_rpm >= (num_rpm - 1) and num_rpm > 5:
                        time.sleep(2)
                        now_ts = time.time()
                except (ValueError, TypeError):
                    pass

            # Financial Shield: 85% TPM Cap
            if not is_unlimited(limits.get("tpm")):
                try:
                    if (current_tpm + estimated_tokens) >= (float(limits["tpm"]) * 0.85):
                        log_action("GOVERNOR", "TPM_FINANCIAL_SHIELD_CAP", {"model": model_name, "current_tpm": current_tpm})
                        return False
                except (ValueError, TypeError):
                    pass

            # Record in legacy windows & ledger
            rw.append(now_ts)
            rt.append((now_ts, estimated_tokens))
            m_usage["rpd"] = m_usage.get("rpd", 0) + 1
            m_usage["requests_today"] = m_usage.get("requests_today", 0) + 1
            m_usage["tokens_today"] = m_usage.get("tokens_today", 0) + estimated_tokens

            # Also update bucket_usage
            provider = self.resolve_provider(model_name)
            bucket_key = f"{provider}:FREE:default:{model_name}"
            b_usage = self.ledger["bucket_usage"].setdefault(bucket_key, {
                "requests_today": 0, "input_tokens_today": 0, "output_tokens_today": 0,
                "thinking_tokens_today": 0, "total_tokens_today": 0
            })
            b_usage["requests_today"] += 1
            b_usage["total_tokens_today"] += estimated_tokens

            if bucket_key not in self.rolling_requests:
                self.rolling_requests[bucket_key] = []
            if bucket_key not in self.rolling_tokens:
                self.rolling_tokens[bucket_key] = []
            self.rolling_requests[bucket_key].append(now_ts)
            self.rolling_tokens[bucket_key].append((now_ts, estimated_tokens))

            if project_name and model_name in PRO_MODEL_PROJECT_CAPS:
                self.ledger["project_usage"][project_name][model_name] = \
                    self.ledger["project_usage"][project_name].get(model_name, 0) + 1

            self._save_ledger_internal()
            return True

    def render_live_telemetry_snippet(self, model_name: str) -> str:
        """Renders live rolling RPM/TPM/RPD telemetry for dashboard displays."""
        with self.lock:
            now_ts = time.time()
            self._cleanup_expired_leases_and_windows(now_ts)
            
            if model_name not in FREE_BUDGET_REGISTRY:
                return "[RPM: 0/0 | TPM: 0K/0K | RPD: 0/0]"
            limits = FREE_BUDGET_REGISTRY[model_name]
            usage = self.ledger.get("model_usage", {}).get(model_name, {"rpd": 0})
            
            rw = self.ledger.get("rolling_window", {}).get(model_name, [])
            rt = self.ledger.get("rolling_tokens", {}).get(model_name, [])
            current_rpm = len(rw)
            current_tpm = sum(pair[1] for pair in rt)

            tpm_formatted = f"{round(current_tpm / 1000, 1)}K"
            tpm_val = limits.get('tpm')
            if is_unlimited(tpm_val):
                max_tpm_formatted = "Unlimited"
            else:
                try:
                    max_tpm_formatted = f"{int(float(tpm_val) / 1000)}K"
                except (ValueError, TypeError):
                    max_tpm_formatted = "Unlimited"

            rpd_val = limits.get('rpd')
            max_rpd_formatted = "Unlimited" if is_unlimited(rpd_val) else str(rpd_val)
            rpm_val = limits.get('rpm')
            max_rpm_formatted = "Unlimited" if is_unlimited(rpm_val) else str(rpm_val)

            return f"[RPM: {current_rpm}/{max_rpm_formatted} | TPM: {tpm_formatted}/{max_tpm_formatted} | RPD: {usage.get('rpd', 0)}/{max_rpd_formatted}]"


    def get_cost_and_savings_estimate(self) -> Dict[str, Any]:
        """
        Calculates actual spend on PAID cloud models and estimated financial savings
        from FREE tier and LOCAL Ollama models using reference cloud API rates.
        """
        with self.lock:
            USD_TO_INR = 84.0
            actual_paid_spend_usd = 0.0
            estimated_savings_usd = 0.0
            free_local_tokens = 0
            provider_cost_map: Dict[str, float] = {}

            bucket_usage = self.ledger.get("bucket_usage", {})
            for b_key, b_data in bucket_usage.items():
                parts = b_key.split(":")
                if len(parts) >= 4:
                    prov = parts[0]
                    tier = parts[1]
                    key_id = parts[2]
                    model = ":".join(parts[3:])
                else:
                    prov = "UNKNOWN"
                    tier = "FREE"
                    model = b_key

                in_tok = b_data.get("input_tokens_today", 0)
                out_tok = b_data.get("output_tokens_today", 0)
                think_tok = b_data.get("thinking_tokens_today", 0)
                tot_tok = b_data.get("total_tokens_today", in_tok + out_tok + think_tok)

                # Pricing calculation per 1M tokens
                m_lower = model.lower()
                if "pro" in m_lower:
                    rate_in = 1.25
                    rate_out = 5.00
                elif "flash-lite" in m_lower:
                    rate_in = 0.075
                    rate_out = 0.30
                elif "flash" in m_lower:
                    rate_in = 0.15
                    rate_out = 0.60
                elif prov == "GROQ" or "llama" in m_lower or "qwen-2.5-coder-32b" in m_lower:
                    rate_in = 0.59
                    rate_out = 0.79
                elif prov == "OLLAMA" or "qwen2.5-coder" in m_lower:
                    # Benchmark rate against saved cloud tokens
                    rate_in = 0.25
                    rate_out = 1.00
                else:
                    rate_in = 0.15
                    rate_out = 0.60

                if tier == "PAID":
                    spend = (in_tok * rate_in + (out_tok + think_tok) * rate_out) / 1_000_000.0
                    actual_paid_spend_usd += spend
                    provider_cost_map[prov] = provider_cost_map.get(prov, 0.0) + spend
                else:
                    free_local_tokens += tot_tok
                    savings = (in_tok * rate_in + (out_tok + think_tok) * rate_out) / 1_000_000.0
                    estimated_savings_usd += savings
                    if prov not in provider_cost_map:
                        provider_cost_map[prov] = 0.0

            return {
                "actual_paid_spend_usd": round(actual_paid_spend_usd, 4),
                "actual_paid_spend_inr": round(actual_paid_spend_usd * USD_TO_INR, 2),
                "estimated_savings_usd": round(estimated_savings_usd, 4),
                "estimated_savings_inr": round(estimated_savings_usd * USD_TO_INR, 2),
                "paid_tokens_today": self.paid_tokens_today,
                "paid_tokens_current_build": self.paid_tokens_current_build,
                "free_and_local_tokens_today": free_local_tokens,
                "breakdown_by_provider": {p: round(v, 4) for p, v in provider_cost_map.items()}
            }


# Aliases for 100% backward compatibility
TokenGovernor = HierarchicalTokenGovernor
token_governor = HierarchicalTokenGovernor()
