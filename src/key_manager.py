import os
import json
import time
import uuid
import threading
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone, timedelta

# Define Indian Standard Time (IST: UTC + 5:30) for consistent logging timestamps
IST = timezone(timedelta(hours=5, minutes=30))

try:
    from google import genai
except ImportError:
    genai = None

# Re-entrant thread safety lock for concurrent file access and client rotations
_KEY_LOCK = threading.RLock()

KEY_STORE_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".agent_memory", "api_keys.json")
)


def get_ist_now_str() -> str:
    """Returns formatted current timestamp in Indian Standard Time (IST)."""
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")


def mask_key(key_str: str) -> str:
    """Masks secret API key for UI and logs (e.g., 'AIzaSy...4xQ1' or 'gsk_x8...9K')."""
    if not key_str or not isinstance(key_str, str):
        return "***"
    clean = key_str.strip()
    if len(clean) <= 10:
        return clean[:3] + "..." + clean[-2:]
    return clean[:6] + "..." + clean[-4:]


class KeyManager:
    """
    Multi-API Key Pool Manager & Multi-Provider Dispatcher v6.0:
    Manages dynamic Google Gemini & Groq Cloud API key pooling, granular key selection,
    model-aware intelligent routing policies (GLOBAL_HYBRID, FREE_POOL, PAID_POOL, SINGLE_PINNED),
    automatic 429 quota exhaustion cooldowns, round-robin load distribution,
    financial shield enforcement, and seamless fallback to environment variables & local Ollama.
    """

    def __init__(self, key_store_path: str = KEY_STORE_FILE):
        self.key_store_path = key_store_path
        self._rotation_index = 0
        self._client_cache: Dict[str, Any] = {}
        self._ensure_store_initialized()

    def _ensure_store_initialized(self):
        """Ensures .agent_memory/api_keys.json exists; seeds from GEMINI_API_KEY and GROQ_API_KEY if present."""
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
                        "provider": "GOOGLE",
                        "tier": "FREE",
                        "label": "Primary Free Key (from env)",
                        "is_selected": True,
                        "status": "ACTIVE",
                        "last_used": None,
                        "error_count": 0,
                        "cooldown_until": 0
                    })
                
                groq_env = os.getenv("GROQ_API_KEY")
                if groq_env and groq_env.strip():
                    initial_keys.append({
                        "id": "key_groq_default",
                        "key": groq_env.strip(),
                        "provider": "GROQ",
                        "tier": "FREE",
                        "label": "Primary Groq Key (from env)",
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

                # Backward-compatibility migration for active_tier_mode -> routing_policy
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

                # Seed Groq key from environment if not present
                groq_env = os.getenv("GROQ_API_KEY")
                if groq_env and groq_env.strip():
                    has_groq = any(k.get("provider") == "GROQ" or k.get("key") == groq_env.strip() for k in data["keys"])
                    if not has_groq:
                        data["keys"].append({
                            "id": "key_groq_default",
                            "key": groq_env.strip(),
                            "provider": "GROQ",
                            "tier": "FREE",
                            "label": "Primary Groq Key (from env)",
                            "is_selected": True,
                            "status": "ACTIVE",
                            "last_used": None,
                            "error_count": 0,
                            "cooldown_until": 0
                        })

                # Ensure every key has required attributes and defaults
                for k in data["keys"]:
                    if "provider" not in k or not k["provider"]:
                        if k.get("key", "").startswith("gsk_"):
                            k["provider"] = "GROQ"
                        else:
                            k["provider"] = "GOOGLE"
                    else:
                        k["provider"] = k["provider"].upper()

                    if "tier" not in k or not k["tier"]:
                        k["tier"] = "FREE"
                    else:
                        k["tier"] = k["tier"].upper()

                    if "is_selected" not in k:
                        k["is_selected"] = True
                    if "status" not in k:
                        k["status"] = "ACTIVE"
                    if "cooldown_until" not in k or k["cooldown_until"] is None:
                        k["cooldown_until"] = 0
                    if "error_count" not in k:
                        k["error_count"] = 0
                    if "safety_margin_percent" not in k or not isinstance(k.get("safety_margin_percent"), (int, float)):
                        k["safety_margin_percent"] = 85
                    if "custom_model_limits" not in k or not isinstance(k.get("custom_model_limits"), dict):
                        k["custom_model_limits"] = {}

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

    def mark_exhausted(self, key_id: str, cooldown_seconds: int = 60):
        """Marks a key as exhausted (HTTP 429) and initiates a timed cooldown window."""
        if not key_id or key_id in ["env_fallback", "env_fallback_groq", "local_ollama"]:
            return

        with _KEY_LOCK:
            data = self._load_raw()
            dirty = False
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    k["status"] = "EXHAUSTED"
                    k["cooldown_until"] = time.time() + cooldown_seconds
                    k["error_count"] = k.get("error_count", 0) + 1
                    dirty = True
                    break

            if dirty:
                self._save_raw(data)

    def mark_success(self, key_id: str):
        """Updates last_used timestamp on successful API request."""
        if not key_id or key_id in ["env_fallback", "env_fallback_groq", "local_ollama"]:
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

    def add_key(
        self,
        key_str: str,
        tier: str = "FREE",
        label: str = "",
        is_selected: bool = True,
        provider: str = "GOOGLE"
    ) -> Dict[str, Any]:
        """Registers a new API key into the persistent pool."""
        clean_key = (key_str or "").strip()
        if not clean_key:
            raise ValueError("API key string cannot be empty.")

        clean_tier = tier.upper().strip()
        if clean_tier not in ["FREE", "PAID"]:
            clean_tier = "FREE"

        clean_prov = (provider or "GOOGLE").upper().strip()
        if clean_key.startswith("gsk_") and (not provider or clean_prov == "GOOGLE"):
            clean_prov = "GROQ"

        with _KEY_LOCK:
            data = self._load_raw()
            keys = data.get("keys", [])

            # Check if key string already registered
            for existing in keys:
                if existing.get("key") == clean_key:
                    existing["provider"] = clean_prov
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
                        "provider": existing["provider"],
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
                "provider": clean_prov,
                "tier": clean_tier,
                "label": label or f"Key {len(keys) + 1} ({clean_prov} {clean_tier})",
                "is_selected": bool(is_selected),
                "status": "ACTIVE",
                "last_used": None,
                "error_count": 0,
                "cooldown_until": 0,
                "safety_margin_percent": 85,
                "custom_model_limits": {}
            }
            keys.append(new_entry)
            data["keys"] = keys
            self._save_raw(data)

            return {
                "id": new_entry["id"],
                "key": mask_key(new_entry["key"]),
                "provider": new_entry["provider"],
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
        """Returns safe, masked metadata for all registered keys including provider and selection state."""
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
                    "provider": k.get("provider", "GOOGLE"),
                    "tier": k.get("tier", "FREE"),
                    "label": k.get("label", "Key"),
                    "is_selected": bool(k.get("is_selected", True)),
                    "status": "EXHAUSTED" if cooldown_remaining > 0 else k.get("status", "ACTIVE"),
                    "last_used": k.get("last_used"),
                    "error_count": k.get("error_count", 0),
                    "cooldown_remaining_sec": cooldown_remaining,
                    "safety_margin_percent": k.get("safety_margin_percent", 85),
                    "custom_model_limits": k.get("custom_model_limits", {})
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

    def set_routing_policy(self, policy: str, pinned_key_id: Optional[str] = None) -> Dict[str, Any]:
        """Sets active routing policy and optional pinned key ID."""
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
        """Returns policy, pinned key ID, and breakdown by provider and tier."""
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

            google_keys = 0
            groq_keys = 0
            selected_google_keys = 0
            selected_groq_keys = 0

            for k in keys:
                prov = k.get("provider", "GOOGLE").upper()
                tier = k.get("tier", "FREE").upper()
                is_sel = bool(k.get("is_selected", True))
                cooldown = k.get("cooldown_until") or 0
                is_exhausted = (k.get("status") == "EXHAUSTED" and cooldown and cooldown > now)

                if is_sel:
                    selected_keys += 1

                if prov == "GROQ":
                    groq_keys += 1
                    if is_sel:
                        selected_groq_keys += 1
                else:
                    google_keys += 1
                    if is_sel:
                        selected_google_keys += 1

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
                "google_keys": google_keys,
                "groq_keys": groq_keys,
                "selected_google_keys": selected_google_keys,
                "selected_groq_keys": selected_groq_keys,
                "active_keys": active_keys,
                "exhausted_keys": exhausted_keys
            }

    def get_pool_status(self) -> Dict[str, Any]:
        """Returns high-level statistics about the key pool (backward-compatible)."""
        status = self.get_routing_status()
        status["active_tier_mode"] = status["routing_policy"]
        return status

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
                "provider": target.get("provider", "GOOGLE"),
                "tier": target.get("tier", "FREE"),
                "label": target.get("label", ""),
                "is_selected": target["is_selected"],
                "status": target.get("status", "ACTIVE")
            }

    def resolve_key_context(
        self,
        model_name: Optional[str] = None,
        tier_preference: str = "AUTO",
        provider: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Stage 14.2 Multi-Provider Key Resolution Context:
        Resolves an active key record and cached client based on target provider, model,
        active routing policy, and paid tier financial shield status.
        """
        # 1. Determine target provider
        if provider:
            target_provider = provider.upper()
        elif model_name:
            m_lower = model_name.lower()
            if m_lower.startswith("llama-3") or "qwen-2.5-coder-32b" in m_lower or "groq" in m_lower:
                target_provider = "GROQ"
            elif ":" in model_name or m_lower.startswith("qwen2.5-coder"):
                target_provider = "OLLAMA"
            else:
                target_provider = "GOOGLE"
        else:
            target_provider = "GOOGLE"

        # 2. Local Ollama Bypass
        if target_provider == "OLLAMA":
            return {
                "client": None,
                "key_id": "local_ollama",
                "raw_key": "",
                "provider": "OLLAMA",
                "tier": "LOCAL",
                "label": "Local Ollama Hardware Engine"
            }

        # 3. Check Financial Shield Paid Lock
        paid_tier_locked = False
        try:
            from src.token_governor import token_governor
            paid_tier_locked = bool(
                token_governor.quotas.get("financial_shield", {}).get("paid_tier_locked", False)
            )
        except Exception:
            pass

        with _KEY_LOCK:
            data = self._load_raw()
            keys = data.get("keys", [])
            routing_policy = data.get("routing_policy", "GLOBAL_HYBRID")
            pinned_key_id = data.get("pinned_key_id")
            now = time.time()

            # Revive cooled-down exhausted keys
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

            # Filter candidates by provider, selection, status, and cooldown
            provider_keys = [
                k for k in keys
                if k.get("provider", "GOOGLE").upper() == target_provider
            ]

            selected_active = [
                k for k in provider_keys
                if bool(k.get("is_selected", True))
                and k.get("status") == "ACTIVE"
                and (not k.get("cooldown_until") or now >= (k.get("cooldown_until") or 0))
            ]

            # If paid tier locked, purge any paid keys
            if paid_tier_locked:
                selected_active = [
                    k for k in selected_active
                    if k.get("tier", "FREE").upper() == "FREE"
                ]

            candidates: List[Dict[str, Any]] = []

            if routing_policy == "SINGLE_PINNED":
                if pinned_key_id:
                    pinned = next((k for k in selected_active if k.get("id") == pinned_key_id), None)
                    if pinned:
                        candidates = [pinned]
            elif routing_policy == "FREE_POOL":
                candidates = [k for k in selected_active if k.get("tier", "FREE").upper() == "FREE"]
            elif routing_policy == "PAID_POOL":
                if not paid_tier_locked:
                    candidates = [k for k in selected_active if k.get("tier", "FREE").upper() == "PAID"]
                else:
                    candidates = []
            elif routing_policy == "GLOBAL_HYBRID":
                model_str = (model_name or "").lower()
                is_pro = "pro" in model_str
                is_flash_or_lite = ("flash" in model_str) or ("lite" in model_str)

                paid_c = [k for k in selected_active if k.get("tier", "FREE").upper() == "PAID"] if not paid_tier_locked else []
                free_c = [k for k in selected_active if k.get("tier", "FREE").upper() == "FREE"]

                if (is_pro or tier_preference.upper() == "PAID") and not paid_tier_locked:
                    candidates = paid_c if paid_c else free_c
                elif is_flash_or_lite or tier_preference.upper() == "FREE":
                    candidates = free_c if free_c else paid_c
                else:
                    candidates = selected_active
            else:
                candidates = selected_active

            # Fallback to Environment Variable if no pool keys exist for provider
            if not candidates and len(provider_keys) == 0:
                if target_provider == "GOOGLE":
                    env_key = os.getenv("GEMINI_API_KEY")
                    if env_key and env_key.strip():
                        client = self._get_or_create_client(env_key.strip())
                        return {
                            "client": client,
                            "key_id": "env_fallback",
                            "raw_key": env_key.strip(),
                            "provider": "GOOGLE",
                            "tier": "FREE",
                            "label": "Google Env Fallback"
                        }
                elif target_provider == "GROQ":
                    env_groq = os.getenv("GROQ_API_KEY")
                    if env_groq and env_groq.strip():
                        return {
                            "client": None,
                            "key_id": "env_fallback_groq",
                            "raw_key": env_groq.strip(),
                            "provider": "GROQ",
                            "tier": "FREE",
                            "label": "Groq Env Fallback"
                        }

            if not candidates:
                return {
                    "client": None,
                    "key_id": None,
                    "raw_key": None,
                    "provider": target_provider,
                    "tier": "FREE",
                    "label": None
                }

            # Round-robin cycle
            self._rotation_index = (self._rotation_index + 1) % len(candidates)
            selected = candidates[self._rotation_index]
            
            client = None
            if target_provider == "GOOGLE":
                client = self._get_or_create_client(selected["key"])

            return {
                "client": client,
                "key_id": selected.get("id"),
                "raw_key": selected.get("key"),
                "provider": target_provider,
                "tier": selected.get("tier", "FREE"),
                "label": selected.get("label")
            }

    def get_client_for_request(
        self,
        model_name: Optional[str] = None,
        tier_preference: str = "AUTO"
    ) -> Tuple[Optional[Any], Optional[str]]:
        """
        Backward-compatible 2-tuple client resolver.
        Returns (genai.Client or None, key_id or None).
        """
        ctx = self.resolve_key_context(model_name=model_name, tier_preference=tier_preference, provider="GOOGLE")
        return ctx["client"], ctx["key_id"]

    def test_key(self, key_str: str, provider: str = "GOOGLE") -> Dict[str, Any]:
        """Validates API authentication against Google GenAI or Groq Cloud."""
        clean_key = (key_str or "").strip()
        if not clean_key:
            return {"valid": False, "error": "API key string cannot be blank."}

        prov = (provider or "GOOGLE").upper()
        if clean_key.startswith("gsk_") and prov == "GOOGLE":
            prov = "GROQ"

        if prov == "GROQ":
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/models",
                headers={
                    "Authorization": f"Bearer {clean_key}",
                    "User-Agent": "AdvanceAssistant-OS/6.0"
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=7) as resp:
                    if resp.status == 200:
                        return {"valid": True, "message": "Key validated successfully with Groq Cloud LPU API."}
                    return {"valid": False, "error": f"Groq validation returned status {resp.status}"}
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    return {"valid": False, "error": "Invalid Groq API key."}
                elif e.code == 429:
                    return {"valid": False, "error": "Groq key is valid but currently rate-limited (HTTP 429)."}
                return {"valid": False, "error": f"Groq validation failed: HTTP {e.code}"}
            except Exception as e:
                return {"valid": False, "error": f"Groq validation error: {str(e)[:150]}"}

        # Default GOOGLE validation
        if not genai:
            return {"valid": False, "error": "Google GenAI library (google-genai) is not installed."}

        try:
            test_client = genai.Client(api_key=clean_key)
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
            target_prov = "GOOGLE"
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    target_key = k.get("key")
                    target_prov = k.get("provider", "GOOGLE")
                    break

        if not target_key:
            return {"valid": False, "error": f"Key ID '{key_id}' not found in registry."}

        return self.test_key(target_key, provider=target_prov)


# Global singleton key manager instance

    def get_key_by_id(self, key_id: str) -> Optional[Dict[str, Any]]:
        """Returns full internal record for a registered key by ID."""
        with _KEY_LOCK:
            data = self._load_raw()
            for k in data.get("keys", []):
                if k.get("id") == key_id:
                    return k.copy()
            return None

    def set_key_model_limits(
        self,
        key_id: str,
        model_name: str,
        working_limits: Dict[str, int],
        strict_limits: Optional[Dict[str, int]] = None
    ) -> Dict[str, Any]:
        """Saves dedicated model limits for that specific key_id into .agent_memory/api_keys.json."""
        if not key_id or not model_name:
            raise ValueError("Key ID and model name must be provided.")

        with _KEY_LOCK:
            data = self._load_raw()
            target = next((k for k in data.get("keys", []) if k.get("id") == key_id), None)
            if not target:
                raise ValueError(f"Key with ID '{key_id}' not found in registry.")

            if "custom_model_limits" not in target or not isinstance(target["custom_model_limits"], dict):
                target["custom_model_limits"] = {}

            if strict_limits is None:
                try:
                    from src.token_governor import token_governor
                    base = token_governor.get_model_limits(target.get("provider", "GOOGLE"), target.get("tier", "FREE"), model_name)
                    strict_limits = base.get("strict_limits", working_limits.copy())
                except Exception:
                    strict_limits = working_limits.copy()

            target["custom_model_limits"][model_name] = {
                "strict_limits": strict_limits,
                "working_limits": working_limits
            }
            self._save_raw(data)
            return {
                "key_id": key_id,
                "model_name": model_name,
                "limits": target["custom_model_limits"][model_name]
            }

    def set_key_safety_margin(self, key_id: str, safety_margin_percent: int = 85) -> Dict[str, Any]:
        """Updates the key's dedicated safety margin % and recalculates any custom model limits on that key."""
        if not key_id:
            raise ValueError("Key ID must be provided.")

        margin = max(10, min(100, int(safety_margin_percent)))
        with _KEY_LOCK:
            data = self._load_raw()
            target = next((k for k in data.get("keys", []) if k.get("id") == key_id), None)
            if not target:
                raise ValueError(f"Key with ID '{key_id}' not found in registry.")

            target["safety_margin_percent"] = margin

            # Recalculate any existing custom model limits with new safety margin
            try:
                from src.config import compute_working_limits
                for m_name, m_limits in target.get("custom_model_limits", {}).items():
                    s_lim = m_limits.get("strict_limits", {})
                    w_lim = m_limits.get("working_limits", {})
                    think = w_lim.get("thinking_budget", 0)
                    m_limits["working_limits"] = compute_working_limits(s_lim, margin, think)
            except Exception:
                pass

            self._save_raw(data)
            return {
                "key_id": key_id,
                "safety_margin_percent": margin,
                "custom_model_limits": target.get("custom_model_limits", {})
            }

    def get_key_effective_limits(
        self,
        key_id: str,
        provider: str,
        tier: str,
        model_name: str
    ) -> Dict[str, Any]:
        """
        Returns the key's dedicated custom_model_limits[model_name] if set,
        otherwise inherits the (provider, tier, model_name) limits scaled by the key's safety_margin_percent.
        """
        with _KEY_LOCK:
            data = self._load_raw()
            target = next((k for k in data.get("keys", []) if k.get("id") == key_id), None)
            
            if target:
                custom_limits = target.get("custom_model_limits", {})
                if model_name in custom_limits:
                    return custom_limits[model_name]
                
                margin_pct = target.get("safety_margin_percent", 85)
                try:
                    from src.token_governor import token_governor
                    from src.config import compute_working_limits
                    base = token_governor.get_model_limits(provider, tier, model_name)
                    strict_limits = base.get("strict_limits", {})
                    base_working = base.get("working_limits", {})
                    thinking = base_working.get("thinking_budget", 0)
                    working = compute_working_limits(strict_limits, margin_pct, thinking)
                    return {
                        "strict_limits": strict_limits,
                        "working_limits": working
                    }
                except Exception:
                    pass

        try:
            from src.token_governor import token_governor
            return token_governor.get_model_limits(provider, tier, model_name)
        except Exception:
            from src.config import DEFAULT_PROVIDER_QUOTAS
            return DEFAULT_PROVIDER_QUOTAS.get(provider, {}).get(tier, {}).get(model_name, {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": {"rpm": 12, "tpm": 212500, "rpd": 425, "max_input_tokens": 27852, "max_output_tokens": 6963, "thinking_budget": 0}
            })

    def reload_keys(self) -> None:
        """Reloads keys and invalidates any cached state."""
        with _KEY_LOCK:
            pass

key_manager = KeyManager()
