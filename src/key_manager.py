import os
import json
import time
import uuid
import threading
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone, timedelta

# Define Indian Standard Time (IST: UTC + 5:30) for consistent logging timestamps
IST = timezone(timedelta(hours=5, minutes=30))

try:
    from google import genai
except ImportError:
    genai = None

# Thread safety lock for concurrent file access and client rotations
_KEY_LOCK = threading.Lock()

KEY_STORE_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".agent_memory", "api_keys.json")
)


def get_ist_now_str() -> str:
    """Returns formatted current timestamp in Indian Standard Time (IST)."""
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")


def mask_key(key_str: str) -> str:
    """Masks secret API key for UI and logs (e.g., 'AIzaSy...4xQ1')."""
    if not key_str or not isinstance(key_str, str):
        return "***"
    clean = key_str.strip()
    if len(clean) <= 10:
        return clean[:3] + "..." + clean[-2:]
    return clean[:6] + "..." + clean[-4:]


class KeyManager:
    """
    Multi-API Key Pool Manager & Model-Aware Dispatcher v6.0:
    Manages dynamic Google Gemini API key pooling, granular key selection,
    model-aware intelligent routing policies (GLOBAL_HYBRID, FREE_POOL, PAID_POOL, SINGLE_PINNED),
    automatic 429 quota exhaustion cooldowns, round-robin load distribution,
    and seamless fallback to os.getenv("GEMINI_API_KEY") and local Ollama.
    """

    def __init__(self, key_store_path: str = KEY_STORE_FILE):
        self.key_store_path = key_store_path
        self._rotation_index = 0
        self._client_cache: Dict[str, Any] = {}
        self._ensure_store_initialized()

    def _ensure_store_initialized(self):
        """Ensures .agent_memory/api_keys.json exists; seeds from GEMINI_API_KEY if present."""
        with _KEY_LOCK:
            store_dir = os.path.dirname(self.key_store_path)
            os.makedirs(store_dir, exist_ok=True)

            if not os.path.exists(self.key_store_path):
                initial_keys = []
                env_key = os.getenv("GEMINI_API_KEY")
                if env_key and env_key.strip():
                    initial_keys.append({
                        "id": "key_default",
                        "key": env_key.strip(),
                        "tier": "FREE",
                        "label": "Primary Free Key (from env)",
                        "is_selected": True,
                        "status": "ACTIVE",
                        "last_used": None,
                        "error_count": 0,
                        "cooldown_until": 0
                    })
                
                data = {
                    "keys": initial_keys,
                    "routing_policy": "GLOBAL_HYBRID",
                    "pinned_key_id": None
                }
                self._save_raw(data)

    def _load_raw(self) -> Dict[str, Any]:
        """Loads raw JSON payload from disk with schema migration and default validation."""
        default_payload = {
            "keys": [],
            "routing_policy": "GLOBAL_HYBRID",
            "pinned_key_id": None
        }
        if not os.path.exists(self.key_store_path):
            return default_payload
        try:
            with open(self.key_store_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    return default_payload
                if "keys" not in data or not isinstance(data["keys"], list):
                    data["keys"] = []

                # Seamless backward-compatibility migration for active_tier_mode -> routing_policy
                if "routing_policy" not in data:
                    old_mode = data.get("active_tier_mode", "AUTO")
                    if old_mode == "FREE_ONLY":
                        data["routing_policy"] = "FREE_POOL"
                    elif old_mode == "PAID_ONLY":
                        data["routing_policy"] = "PAID_POOL"
                    else:
                        data["routing_policy"] = "GLOBAL_HYBRID"

                if "pinned_key_id" not in data:
                    data["pinned_key_id"] = None

                # Ensure every key has all required v6.0 schema attributes
                for k in data["keys"]:
                    if "is_selected" not in k:
                        k["is_selected"] = True
                    if "status" not in k:
                        k["status"] = "ACTIVE"
                    if "cooldown_until" not in k or k["cooldown_until"] is None:
                        k["cooldown_until"] = 0
                    if "error_count" not in k:
                        k["error_count"] = 0

                return data
        except Exception:
            return default_payload

    def _save_raw(self, data: Dict[str, Any]):
        """Persists raw JSON payload to disk atomically."""
        try:
            tmp_path = self.key_store_path + f".tmp.{os.getpid()}"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            os.replace(tmp_path, self.key_store_path)
        except Exception:
            # Fallback to direct write if atomic replace fails
            with open(self.key_store_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)

    def _get_or_create_client(self, api_key: str):
        """Creates or retrieves a cached Google GenAI Client instance."""
        if not genai:
            return None
        if api_key not in self._client_cache:
            try:
                self._client_cache[api_key] = genai.Client(api_key=api_key)
            except Exception:
                return None
        return self._client_cache[api_key]

    def get_client_for_request(
        self,
        model_name: Optional[str] = None,
        tier_preference: str = "AUTO"
    ) -> Tuple[Optional[Any], Optional[str]]:
        """
        Model-Aware Client Resolution:
        Resolves an active (genai.Client, key_id) according to current routing policy:
        a. SINGLE_PINNED: Uses pinned_key_id if active and not cooling down.
        b. FREE_POOL: Cycles round-robin only among keys where tier == 'FREE', is_selected == True, status == 'ACTIVE'.
        c. PAID_POOL: Cycles round-robin only among keys where tier == 'PAID', is_selected == True, status == 'ACTIVE'.
        d. GLOBAL_HYBRID:
           - If model_name contains 'pro' (e.g. gemini-3.1-pro-preview, gemini-2.5-pro):
             Prioritizes selected PAID keys to avoid free rate-limits. If none available or exhausted, falls back to selected FREE keys.
           - If model_name is Flash or Lite (e.g. gemini-3.6-flash, gemini-3.5-flash-lite):
             Prioritizes selected FREE keys to conserve paid tokens. If all free exhausted, falls back to selected PAID keys.
           - Otherwise or if model_name is omitted: adheres to tier_preference or cycles among all selected active keys.
        e. If all selected cloud keys are exhausted or in cooldown: returns (None, None) so agent.py falls back to Ollama.
        - Backward Compatibility: If no keys are registered in the store, falls back to os.getenv("GEMINI_API_KEY").
        """
        with _KEY_LOCK:
            data = self._load_raw()
            keys = data.get("keys", [])
            routing_policy = data.get("routing_policy", "GLOBAL_HYBRID")
            pinned_key_id = data.get("pinned_key_id")
            now = time.time()

            # 1. Revive cooled-down exhausted keys
            dirty = False
            for k in keys:
                if k.get("status") == "EXHAUSTED":
                    cooldown = k.get("cooldown_until") or 0
                    if cooldown and now >= cooldown:
                        k["status"] = "ACTIVE"
                        k["cooldown_until"] = 0
                        dirty = True

            if dirty:
                self._save_raw(data)

            # 2. Backward compatibility fallback to os.getenv if no keys are registered at all
            if len(keys) == 0:
                env_key = os.getenv("GEMINI_API_KEY")
                if env_key and env_key.strip():
                    client = self._get_or_create_client(env_key.strip())
                    return client, "env_fallback"
                return None, None

            # 3. Filter candidates based on selection, status, and cooldown
            selected_active = [
                k for k in keys
                if bool(k.get("is_selected", True))
                and k.get("status") == "ACTIVE"
                and (not k.get("cooldown_until") or now >= (k.get("cooldown_until") or 0))
            ]

            candidates: List[Dict[str, Any]] = []

            # 4. Resolve candidate pool based on policy
            if routing_policy == "SINGLE_PINNED":
                if pinned_key_id:
                    pinned = next((k for k in selected_active if k.get("id") == pinned_key_id), None)
                    if pinned:
                        client = self._get_or_create_client(pinned["key"])
                        return client, pinned.get("id")
                # Pinned key is either missing, unselected, or in cooldown
                return None, None

            elif routing_policy == "FREE_POOL":
                candidates = [k for k in selected_active if k.get("tier", "FREE").upper() == "FREE"]

            elif routing_policy == "PAID_POOL":
                candidates = [k for k in selected_active if k.get("tier", "FREE").upper() == "PAID"]

            elif routing_policy == "GLOBAL_HYBRID":
                model_str = (model_name or "").lower()
                is_pro = "pro" in model_str
                is_flash_or_lite = ("flash" in model_str) or ("lite" in model_str)

                paid_candidates = [k for k in selected_active if k.get("tier", "FREE").upper() == "PAID"]
                free_candidates = [k for k in selected_active if k.get("tier", "FREE").upper() == "FREE"]

                if is_pro or tier_preference.upper() == "PAID":
                    # Prioritize PAID keys; fall back to FREE if none available
                    candidates = paid_candidates if paid_candidates else free_candidates
                elif is_flash_or_lite or tier_preference.upper() == "FREE":
                    # Prioritize FREE keys; fall back to PAID if all free exhausted
                    candidates = free_candidates if free_candidates else paid_candidates
                else:
                    candidates = selected_active
            else:
                candidates = selected_active

            # 5. Round-robin cycle through qualified candidates
            if candidates:
                self._rotation_index = (self._rotation_index + 1) % len(candidates)
                selected = candidates[self._rotation_index]
                client = self._get_or_create_client(selected["key"])
                return client, selected.get("id")

            # 6. All selected cloud keys exhausted or in cooldown -> fallback smoothly to Ollama
            return None, None

    def toggle_key_selection(self, key_id: str, is_selected: bool) -> Dict[str, Any]:
        """Toggles whether a specific key is included in the active routing pool."""
        if not key_id:
            raise ValueError("Key ID cannot be blank.")

        with _KEY_LOCK:
            data = self._load_raw()
            target = None
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    k["is_selected"] = bool(is_selected)
                    target = k
                    break

            if not target:
                raise ValueError(f"Key with ID '{key_id}' not found in registry.")

            self._save_raw(data)
            return {
                "id": target["id"],
                "key": mask_key(target.get("key", "")),
                "tier": target.get("tier", "FREE"),
                "label": target.get("label", ""),
                "is_selected": target["is_selected"],
                "status": target.get("status", "ACTIVE")
            }

    def set_routing_policy(self, policy: str, pinned_key_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Sets active routing policy ('GLOBAL_HYBRID', 'FREE_POOL', 'PAID_POOL', 'SINGLE_PINNED')
        and optional pinned key ID.
        """
        clean_policy = (policy or "").upper().strip()
        valid_policies = ["GLOBAL_HYBRID", "FREE_POOL", "PAID_POOL", "SINGLE_PINNED"]
        if clean_policy not in valid_policies:
            raise ValueError(f"Invalid routing policy '{policy}'. Must be one of {valid_policies}")

        with _KEY_LOCK:
            data = self._load_raw()
            if clean_policy == "SINGLE_PINNED" and pinned_key_id:
                exists = any(k.get("id") == pinned_key_id for k in data.get("keys", []))
                if not exists:
                    raise ValueError(f"Pinned key ID '{pinned_key_id}' not found in key registry.")
                data["pinned_key_id"] = pinned_key_id
            elif clean_policy != "SINGLE_PINNED":
                if pinned_key_id is not None:
                    data["pinned_key_id"] = pinned_key_id
            else:
                data["pinned_key_id"] = pinned_key_id

            data["routing_policy"] = clean_policy
            self._save_raw(data)
            return self.get_routing_status()

    def get_routing_status(self) -> Dict[str, Any]:
        """Returns current policy, pinned key ID, total count, selected count, and breakdown by tier."""
        with _KEY_LOCK:
            data = self._load_raw()
            keys = data.get("keys", [])
            now = time.time()

            total_keys = len(keys)
            selected_keys = 0
            free_keys = 0
            paid_keys = 0
            selected_free_keys = 0
            selected_paid_keys = 0
            active_keys = 0
            exhausted_keys = 0

            for k in keys:
                tier = k.get("tier", "FREE").upper()
                is_sel = bool(k.get("is_selected", True))
                cooldown = k.get("cooldown_until") or 0
                is_exhausted = (k.get("status") == "EXHAUSTED" and cooldown and cooldown > now)

                if is_sel:
                    selected_keys += 1

                if tier == "PAID":
                    paid_keys += 1
                    if is_sel:
                        selected_paid_keys += 1
                else:
                    free_keys += 1
                    if is_sel:
                        selected_free_keys += 1

                if is_exhausted:
                    exhausted_keys += 1
                elif k.get("status") == "ACTIVE":
                    active_keys += 1

            return {
                "routing_policy": data.get("routing_policy", "GLOBAL_HYBRID"),
                "pinned_key_id": data.get("pinned_key_id"),
                "total_keys": total_keys,
                "selected_keys": selected_keys,
                "free_keys": free_keys,
                "paid_keys": paid_keys,
                "selected_free_keys": selected_free_keys,
                "selected_paid_keys": selected_paid_keys,
                "active_keys": active_keys,
                "exhausted_keys": exhausted_keys
            }

    def mark_exhausted(self, key_id: str, cooldown_seconds: int = 60):
        """Marks a key as EXHAUSTED with a cooldown timer upon receiving HTTP 429 Quota limit."""
        if not key_id or key_id == "env_fallback":
            return

        with _KEY_LOCK:
            data = self._load_raw()
            dirty = False
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    k["status"] = "EXHAUSTED"
                    k["error_count"] = k.get("error_count", 0) + 1
                    k["cooldown_until"] = time.time() + cooldown_seconds
                    dirty = True
                    break

            if dirty:
                self._save_raw(data)

    def mark_success(self, key_id: str):
        """Updates last_used timestamp on successful API request."""
        if not key_id or key_id == "env_fallback":
            return

        with _KEY_LOCK:
            data = self._load_raw()
            dirty = False
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    k["last_used"] = get_ist_now_str()
                    k["error_count"] = 0
                    dirty = True
                    break

            if dirty:
                self._save_raw(data)

    def add_key(self, key_str: str, tier: str = "FREE", label: str = "", is_selected: bool = True) -> Dict[str, Any]:
        """Registers a new API key into the persistent pool."""
        clean_key = (key_str or "").strip()
        if not clean_key:
            raise ValueError("API key string cannot be empty.")

        clean_tier = tier.upper().strip()
        if clean_tier not in ["FREE", "PAID"]:
            clean_tier = "FREE"

        with _KEY_LOCK:
            data = self._load_raw()
            keys = data.get("keys", [])

            # Check if key string already registered
            for existing in keys:
                if existing.get("key") == clean_key:
                    existing["tier"] = clean_tier
                    if label:
                        existing["label"] = label
                    existing["status"] = "ACTIVE"
                    existing["cooldown_until"] = 0
                    existing["is_selected"] = bool(is_selected)
                    self._save_raw(data)
                    return {
                        "id": existing["id"],
                        "key": mask_key(existing["key"]),
                        "tier": existing["tier"],
                        "label": existing["label"],
                        "is_selected": existing["is_selected"],
                        "status": existing["status"],
                        "last_used": existing.get("last_used"),
                        "error_count": existing.get("error_count", 0)
                    }

            new_id = f"key_{uuid.uuid4().hex[:8]}"
            new_entry = {
                "id": new_id,
                "key": clean_key,
                "tier": clean_tier,
                "label": label or f"Key {len(keys) + 1} ({clean_tier})",
                "is_selected": bool(is_selected),
                "status": "ACTIVE",
                "last_used": None,
                "error_count": 0,
                "cooldown_until": 0
            }
            keys.append(new_entry)
            data["keys"] = keys
            self._save_raw(data)

            return {
                "id": new_entry["id"],
                "key": mask_key(new_entry["key"]),
                "tier": new_entry["tier"],
                "label": new_entry["label"],
                "is_selected": new_entry["is_selected"],
                "status": new_entry["status"],
                "last_used": None,
                "error_count": 0
            }

    def remove_key(self, key_id: str) -> bool:
        """Removes a key from the registry by its unique ID."""
        with _KEY_LOCK:
            data = self._load_raw()
            keys = data.get("keys", [])
            initial_len = len(keys)
            keys = [k for k in keys if k.get("id") != key_id]

            if len(keys) != initial_len:
                data["keys"] = keys
                if data.get("pinned_key_id") == key_id:
                    data["pinned_key_id"] = None
                self._save_raw(data)
                return True
            return False

    def get_masked_keys(self) -> List[Dict[str, Any]]:
        """Returns safe, masked metadata for all registered keys including selection state."""
        with _KEY_LOCK:
            data = self._load_raw()
            now = time.time()
            res = []
            for k in data.get("keys", []):
                cooldown_remaining = 0
                cooldown_until = k.get("cooldown_until") or 0
                if cooldown_until and cooldown_until > now:
                    cooldown_remaining = int(cooldown_until - now)

                res.append({
                    "id": k.get("id"),
                    "key": mask_key(k.get("key", "")),
                    "tier": k.get("tier", "FREE"),
                    "label": k.get("label", "Key"),
                    "is_selected": bool(k.get("is_selected", True)),
                    "status": "EXHAUSTED" if cooldown_remaining > 0 else k.get("status", "ACTIVE"),
                    "last_used": k.get("last_used"),
                    "error_count": k.get("error_count", 0),
                    "cooldown_remaining_sec": cooldown_remaining
                })
            return res

    def get_tier_mode(self) -> str:
        """Returns current routing policy or legacy tier mode."""
        with _KEY_LOCK:
            data = self._load_raw()
            return data.get("routing_policy", "GLOBAL_HYBRID")

    def set_tier_mode(self, mode: str) -> str:
        """Updates active tier routing mode / policy for backward compatibility."""
        clean = (mode or "AUTO").upper().strip()
        mapping = {
            "AUTO": "GLOBAL_HYBRID",
            "FREE_ONLY": "FREE_POOL",
            "PAID_ONLY": "PAID_POOL",
            "GLOBAL_HYBRID": "GLOBAL_HYBRID",
            "FREE_POOL": "FREE_POOL",
            "PAID_POOL": "PAID_POOL",
            "SINGLE_PINNED": "SINGLE_PINNED"
        }
        target_policy = mapping.get(clean, "GLOBAL_HYBRID")
        self.set_routing_policy(target_policy)
        return target_policy

    def get_pool_status(self) -> Dict[str, Any]:
        """Returns high-level statistics about the key pool (backward-compatible)."""
        status = self.get_routing_status()
        status["active_tier_mode"] = status["routing_policy"]
        return status

    def test_key(self, key_str: str) -> Dict[str, Any]:
        """Validates whether a provided API key can authenticate against Google GenAI."""
        clean_key = (key_str or "").strip()
        if not clean_key:
            return {"valid": False, "error": "API key string cannot be blank."}

        if not genai:
            return {"valid": False, "error": "Google GenAI library (google-genai) is not installed."}

        try:
            test_client = genai.Client(api_key=clean_key)
            # Lightweight verification ping using flash model
            response = test_client.models.generate_content(
                model="gemini-2.5-flash",
                contents="Reply with 'OK'"
            )
            if response and response.text:
                return {
                    "valid": True,
                    "message": "Key validated successfully with Google GenAI.",
                    "response_snippet": response.text.strip()[:20]
                }
            return {"valid": True, "message": "Key validated successfully."}
        except Exception as e:
            err_msg = str(e)
            if "API_KEY_INVALID" in err_msg or "400" in err_msg:
                return {"valid": False, "error": "Invalid API key. Please check your credentials."}
            elif "429" in err_msg or "quota" in err_msg.lower():
                return {"valid": False, "error": "Key is valid but currently rate-limited (HTTP 429 Quota Exhausted)."}
            return {"valid": False, "error": f"Validation failed: {err_msg[:200]}"}

    def test_key_by_id(self, key_id: str) -> Dict[str, Any]:
        """Tests an existing registered key by its ID."""
        with _KEY_LOCK:
            data = self._load_raw()
            target_key = None
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    target_key = k.get("key")
                    break

        if not target_key:
            return {"valid": False, "error": f"Key ID '{key_id}' not found in registry."}

        return self.test_key(target_key)


# Global singleton key manager instance
key_manager = KeyManager()
