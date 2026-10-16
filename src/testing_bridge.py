import os
import json
import logging
from typing import Dict, Any, List, Optional
import requests

logger = logging.getLogger("TestingBridge")

# Cross-platform path to external testing suite (Read-Only)
WSL_TESTING_ROOT = "/mnt/d/Project_Files/Ollama_Models_Testing"
WIN_TESTING_ROOT = "D:/Project_Files/Ollama_Models_Testing"

OLLAMA_API_BASE = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")

class TestingBridge:
    """
    Non-invasive, read-only bridge connecting Advance Assistant OS with
    benchmark matrices, best-in-class models, and hardware health audits
    stored in the external Ollama_Models_Testing repository.
    """
    def __init__(self):
        self.root_path = self._resolve_root_path()
        self.is_connected = self.root_path is not None

    def _resolve_root_path(self) -> Optional[str]:
        for candidate in [WSL_TESTING_ROOT, WIN_TESTING_ROOT]:
            if os.path.exists(candidate) and os.path.isdir(candidate):
                return candidate
        return None

    def _safe_load_json(self, rel_path: str) -> Optional[Dict[str, Any]]:
        if not self.is_connected or not self.root_path:
            return None
        full_path = os.path.normpath(os.path.join(self.root_path, rel_path))
        if os.path.exists(full_path):
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read JSON at {full_path}: {e}")
        return None

    def get_vram_safety_classification(self, size_gb: float) -> Dict[str, str]:
        """
        Classifies models based on RTX 4060 8GB VRAM limits established
        in empirical test runs.
        """
        if size_gb <= 5.2:
            return {
                "tier": "SAFE_GPU",
                "badge": "🟢 Pure GPU Safe",
                "description": "Fits entirely within 8GB VRAM with zero paging overhead."
            }
        elif size_gb <= 16.0:
            return {
                "tier": "PAGED_HYBRID",
                "badge": "🟡 Hybrid CPU/GPU Paged",
                "description": "Requires partial CPU/RAM offloading. Execution will be slower."
            }
        else:
            return {
                "tier": "OOM_HAZARDOUS",
                "badge": "🔴 OOM Hazard",
                "description": "High probability of CUDA Out-Of-Memory error without heavy quantization."
            }

    def get_best_in_class_matrix(self) -> Dict[str, Any]:
        """Reads best-in-class rankings across specialty tasks."""
        data = self._safe_load_json("profiles/best_in_class.json")
        if data:
            return data
        # Resilient default fallback
        return {
            "AGENTIC_CODE_FIM": {"primary": "codestral:22b", "fallback": "qwen2.5-coder:7b"},
            "SQL_DATABASE": {"primary": "sqlcoder:7b", "fallback": "qwen2.5-coder:7b"},
            "TOOL_CALLING": {"primary": "llama3-groq-tool-use:8b", "fallback": "hermes3:8b"},
            "COT_REASONING": {"primary": "deepseek-r1:8b", "fallback": "qwen2.5-coder:7b"},
            "FAST_BOILERPLATE": {"primary": "qwen2.5-coder:1.5b", "fallback": "tinyllama:1.1b"}
        }

    def get_all_model_profiles(self) -> List[Dict[str, Any]]:
        """
        Aggregates cataloged local and cloud model profiles with test scores
        and hardware safety classifications.
        """
        profiles = []
        if not self.is_connected or not self.root_path:
            return profiles

        # 1. Ingest Local Ollama Profiles
        local_dir = os.path.join(self.root_path, "profiles", "models")
        if os.path.exists(local_dir):
            try:
                for filename in os.listdir(local_dir):
                    if filename.endswith(".json"):
                        data = self._safe_load_json(os.path.join("profiles", "models", filename))
                        if isinstance(data, dict):
                            model_name = data.get("model_name", filename.replace(".json", "").replace("_", ":"))
                            size_gb = float(data.get("size_gb", 4.0))
                            safety = self.get_vram_safety_classification(size_gb)
                            
                            profiles.append({
                                "id": model_name,
                                "name": model_name,
                                "provider": "OLLAMA_LOCAL",
                                "size_gb": size_gb,
                                "safety": safety,
                                "primary_track": data.get("primary_track", "GENERAL"),
                                "supported_tracks": data.get("eligible_tracks", ["GENERAL"]),
                                "empirical_scores": data.get("evaluations", {}),
                                "tps_average": data.get("tps_average", 0.0),
                                "active_params": data.get("active_params", 7.0)
                            })
            except Exception as e:
                logger.warning(f"Failed to scan local profiles at {local_dir}: {e}")

        # 2. Ingest Cloud Gemini Profiles
        cloud_dir = os.path.join(self.root_path, "profiles", "cloud_models")
        if os.path.exists(cloud_dir):
            try:
                for filename in os.listdir(cloud_dir):
                    if filename.endswith(".json"):
                        data = self._safe_load_json(os.path.join("profiles", "cloud_models", filename))
                        if isinstance(data, dict):
                            model_name = data.get("model_name", filename.replace(".json", ""))
                            profiles.append({
                                "id": model_name,
                                "name": model_name,
                                "provider": "GOOGLE_GEMINI",
                                "size_gb": 0.0,
                                "safety": {
                                    "tier": "CLOUD_UNMETERED",
                                    "badge": "☁️ Cloud Hosted",
                                    "description": "Executes on Google datacenters. Bounded by API rate quotas."
                                },
                                "primary_track": data.get("primary_track", "REASONING"),
                                "supported_tracks": data.get("eligible_tracks", ["ALL"]),
                                "empirical_scores": data.get("evaluations", {}),
                                "tps_average": 0.0,
                                "active_params": 0.0
                            })
            except Exception as e:
                logger.warning(f"Failed to scan cloud profiles at {cloud_dir}: {e}")

        return profiles

    def get_cloud_quotas_matrix(self) -> Dict[str, Any]:
        """Loads Free vs Tier 1 Gemini boundaries from test repository configs."""
        tier1_matrix = self._safe_load_json("config/gemini_tier1_matrix.json")
        cloud_quotas = self._safe_load_json("config/cloud_quotas.json")
        return {
            "tier1_matrix": tier1_matrix or {},
            "cloud_quotas": cloud_quotas or {}
        }

    def get_active_vram_telemetry(self) -> Dict[str, Any]:
        """
        Queries Ollama's active memory status via /api/ps to compute
        real-time VRAM allocation against the 8GB RTX 4060 boundary.
        """
        try:
            res = requests.get(f"{OLLAMA_API_BASE}/api/ps", timeout=1.5)
            if res.status_code == 200:
                payload = res.json()
                models_loaded = payload.get("models", [])
                
                total_vram_bytes = 0
                active_models = []
                for m in models_loaded:
                    size_vram = m.get("size_vram", 0)
                    total_vram_bytes += size_vram
                    active_models.append({
                        "name": m.get("name"),
                        "size_vram_gb": round(size_vram / (1024**3), 2),
                        "size_total_gb": round(m.get("size", 0) / (1024**3), 2),
                        "expires_at": m.get("expires_at")
                    })
                
                used_vram_gb = round(total_vram_bytes / (1024**3), 2)
                vram_budget_gb = 8.0  # NVIDIA RTX 4060 VRAM Limit
                available_vram_gb = max(0.0, round(vram_budget_gb - used_vram_gb, 2))
                
                return {
                    "is_ollama_online": True,
                    "budget_gb": vram_budget_gb,
                    "used_gb": used_vram_gb,
                    "available_gb": available_vram_gb,
                    "usage_percent": round((used_vram_gb / vram_budget_gb) * 100, 1),
                    "active_loaded_models": active_models
                }
        except Exception:
            pass

        return {
            "is_ollama_online": False,
            "budget_gb": 8.0,
            "used_gb": 0.0,
            "available_gb": 8.0,
            "usage_percent": 0.0,
            "active_loaded_models": []
        }

    def scavenge_idle_vram(self, model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Unloads idle models from GPU VRAM by sending keep_alive: 0,
        replicating the hardware scavenger from Ollama_Models_Testing.
        """
        if not model_name:
            # If no model specified, discover and scavenge all currently loaded models
            status = self.get_active_vram_telemetry()
            scavenged = []
            for m in status.get("active_loaded_models", []):
                m_name = m.get("name")
                if m_name:
                    try:
                        requests.post(
                            f"{OLLAMA_API_BASE}/api/generate",
                            json={"model": m_name, "keep_alive": 0},
                            timeout=2.0
                        )
                        scavenged.append(m_name)
                    except Exception:
                        pass
            return {"success": True, "scavenged_models": scavenged}
        else:
            try:
                requests.post(
                    f"{OLLAMA_API_BASE}/api/generate",
                    json={"model": model_name, "keep_alive": 0},
                    timeout=2.0
                )
                return {"success": True, "scavenged_models": [model_name]}
            except Exception as e:
                return {"success": False, "error": str(e)}

# Singleton Instance
testing_bridge = TestingBridge()
