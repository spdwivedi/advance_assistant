from typing import Dict, Any, Optional
import os
import re

def normalize_wsl_path(path_str: str) -> str:
    r"""
    Converts Windows drive paths (e.g., 'D:/Project_Files/...' or 'C:\Users\...')
    into canonical WSL mount paths ('/mnt/d/Project_Files/...') when running on Linux/WSL,
    and normalizes slashes cleanly.
    """
    if not path_str or not isinstance(path_str, str):
        return "/tmp"
    cleaned = path_str.strip().strip('"').strip("'")
    # Detect accidental repo-prefixed Windows path: /home/.../D:/Project_Files/...
    embedded_win = re.search(r"[/\\]([a-zA-Z]):[/\\](.*)$", cleaned)
    if embedded_win and os.name != "nt":
        drive = embedded_win.group(1).lower()
        rest = embedded_win.group(2).replace('\\', "/")
        return os.path.abspath(f"/mnt/{drive}/{rest}")
    # Detect standard Windows drive path: D:/... or D:\...
    win_match = re.match(r"^([a-zA-Z]):[/\\](.*)$", cleaned)
    if win_match and os.name != "nt":
        drive = win_match.group(1).lower()
        rest = win_match.group(2).replace('\\', "/")
        return os.path.abspath(f"/mnt/{drive}/{rest}")
    return os.path.abspath(os.path.expanduser(cleaned))


# Base Directory Paths
SEARCH_DATA_DIR = os.path.abspath("./.search_data")
SWARM_REGISTRY_FILE = os.path.abspath("./.agent_memory/swarm_registry.json")
TOKEN_LEDGER_FILE = os.path.abspath("./.agent_memory/token_ledger.json")
PROVIDER_QUOTAS_FILE = os.path.abspath("./.agent_memory/provider_quotas.json")

# Isolated Testing Paths
TEST_DATA_DIR = os.path.abspath("./test/test_data")
TEST_LOGS_DIR = os.path.abspath("./test/test_logs")
TEST_SCRIPTS_DIR = os.path.abspath("./test/test_scripts")

# Windows Native Cross-Platform Test Path
WIN_TEST_DATA_DIR = normalize_wsl_path("D:/Project_Files/Assistant_Projects/Test_Win_Data")

# Project-Scoped Workspace Isolated Logs Directory
PROJECT_LOGS_DIR = os.path.abspath("./logs/projects")
PROJECT_LOG_DIR = PROJECT_LOGS_DIR

# Auto-create local directories
for t_dir in [TEST_DATA_DIR, TEST_LOGS_DIR, TEST_SCRIPTS_DIR, PROJECT_LOGS_DIR]:
    os.makedirs(t_dir, exist_ok=True)

# Attempt to initialize Windows Test Data directory if D: drive path is accessible
try:
    if os.path.exists(normalize_wsl_path("D:/Project_Files/Assistant_Projects")):
        os.makedirs(WIN_TEST_DATA_DIR, exist_ok=True)
except Exception:
    pass

# Swarm & Execution Defaults
MAX_SWARM_WORKERS = 17
DEFAULT_ISOLATION_ENABLED = False
DEFAULT_EXECUTION_MODE = "AUTO_DETECT"
DEFAULT_RESEARCH_PROFILE = "MAX"
DEFAULT_TARGET_ENVIRONMENT = "WINDOWS_DESKTOP"
DEFAULT_MODEL_CONSTRAINING_PROFILE = "HIGH_RPM_TPM"  # Default Mode: High RPM & TPM Flash/Lite models

# Dual-Model Local System Configuration
LOCAL_ORCHESTRATOR_MODEL = "qwen2.5-coder:32b"  # Deep Reasoning, JSON Routing, Book Defrag
LOCAL_WORKER_MODEL = "qwen2.5-coder:7b"        # Fast Local Code Writes & Syntax Repairs

# Active System Modules
ENABLED_TOOLS = {
    "WEB_RESEARCH": True,
    "MCP_BRIDGE": True,
    "VISION_ENGINE": True
}

# ------------------------------------------------------------------------------
# RESEARCH & GROUNDING RESOURCE BOUNDS (Capped Per Research Pass)
# ------------------------------------------------------------------------------
MAX_DUCKDUCKGO_SEARCHES_PER_PASS = 20
MAX_CLOUD_PROMPTS_PER_MODEL_PER_PASS = 2
MAX_SEARCH_GROUNDING_REQS_PER_PASS = 5

# ------------------------------------------------------------------------------
# PRO MODEL HARD PROJECT-LEVEL CAP RULES
# ------------------------------------------------------------------------------
PRO_MODEL_PROJECT_CAPS = {
    "gemini-3.1-pro-preview": {
        "max_rpm": 20,
        "max_tpm": 1900000,
        "max_project_requests": 40
    },
    "gemini-2.5-pro": {
        "max_rpm": 140,
        "max_tpm": 1900000,
        "max_project_requests": 200
    }
}

# ------------------------------------------------------------------------------
# MODEL GROUPS & CATEGORY POOLS
# ------------------------------------------------------------------------------
MODEL_GROUPS = {
    "GROUP_1_COMPLEX_PLANNING": [
        "gemini-3.1-pro-preview"
    ],
    "GROUP_2_HIGH_CONCURRENCY": [
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite"
    ],
    "GROUP_3_GEMINI_3_ENGINE": [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3-flash-preview"
    ],
    "GROUP_4_GEMINI_2_ENGINE": [
        "gemini-2.5-flash",
        "gemini-2.5-pro"
    ],
    "GROUP_5_HIGH_FREQUENCY": [
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite"
    ]
}

# ------------------------------------------------------------------------------
# MODEL CONSTRAINING PROFILES (Layered on top of HYBRID / OFFLINE modes)
# ------------------------------------------------------------------------------
MODEL_CONSTRAINING_PROFILES = {
    "HIGH_RPM_TPM": {
        "allowed_models": [
            "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite",
            "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash",
            "qwen2.5-coder:32b", "qwen2.5-coder:7b"
        ],
        "description": "Default High-Throughput profile using Flash and Lite models (1K-4K RPM)."
    },
    "HIGHEST_RPM_TPM": {
        "allowed_models": [
            "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite",
            "qwen2.5-coder:32b", "qwen2.5-coder:7b"
        ],
        "description": "Ultra high concurrency profile using exclusively 4K RPM Lite models."
    },
    "PRO_PLAN": {
        "allowed_models": [
            "gemini-3.1-pro-preview", "gemini-2.5-pro",
            "gemini-3.6-flash", "gemini-3.5-flash",
            "qwen2.5-coder:32b", "qwen2.5-coder:7b"
        ],
        "description": "Complex engineering profile using Pro models under strict project caps."
    },
    "GEMINI_ONLY": {
        "allowed_models": [
            "gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-3.6-flash", "gemini-3.5-flash",
            "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"
        ],
        "description": "Exclusively Gemini cloud models."
    },
    "GEMINI_3_ONLY": {
        "allowed_models": [
            "gemini-3.1-pro-preview", "gemini-3.6-flash", "gemini-3.5-flash",
            "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"
        ],
        "description": "Exclusively Gemini 3.x generation engines."
    },
    "GEMINI_2_ONLY": {
        "allowed_models": [
            "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"
        ],
        "description": "Exclusively Gemini 2.x generation engines."
    },
    "OFFLINE_PURE": {
        "allowed_models": [
            "qwen2.5-coder:32b", "qwen2.5-coder:7b"
        ],
        "description": "Pure local execution using local Qwen weights only."
    }
}

# ------------------------------------------------------------------------------
# TIER POOLS MAP
# ------------------------------------------------------------------------------
TIER_POOLS = {
    "HIGH": [
        "gemini-3.1-pro-preview", 
        "gemini-2.5-pro", 
        "gemini-3.6-flash", 
        "qwen2.5-coder:32b"
    ],
    "MID": [
        "gemini-3.6-flash", 
        "gemini-3.5-flash", 
        "gemini-3-flash-preview", 
        "gemini-2.5-flash",
        "qwen2.5-coder:32b"
    ],
    "FAST": [
        "gemini-3.5-flash-lite", 
        "gemini-3.1-flash-lite", 
        "gemini-2.5-flash-lite", 
        "qwen2.5-coder:7b"
    ]
}

def compute_working_limits(strict_limits: Dict[str, int], margin_pct: int = 85, thinking_budget: int = 0) -> Dict[str, int]:
    """
    Computes safe working limits at exactly `margin_pct`% (default 85%) of the real strict limits
    for both FREE and PAID tiers so execution never hits 100% RPM/TPM/RPD ceilings.
    """
    ratio = max(0.1, min(1.0, margin_pct / 100.0))
    return {
        "rpm": max(1, int(strict_limits.get("rpm", 5) * ratio)),
        "tpm": max(1000, int(strict_limits.get("tpm", 250000) * ratio)),
        "rpd": max(1, int(strict_limits.get("rpd", 50) * ratio)),
        "max_input_tokens": max(1024, int(strict_limits.get("max_input_tokens", 32768) * ratio)),
        "max_output_tokens": max(512, int(strict_limits.get("max_output_tokens", 8192) * ratio)),
        "thinking_budget": thinking_budget
    }

# ------------------------------------------------------------------------------
# HIERARCHICAL PROVIDER-TIER-MODEL QUOTA DEFINITIONS
# ------------------------------------------------------------------------------
DEFAULT_PROVIDER_QUOTAS = {
    "GOOGLE": {
        "FREE": {
            "gemini-2.5-pro": {
                "strict_limits": {"rpm": 5, "tpm": 250000, "rpd": 100, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 5, "tpm": 250000, "rpd": 100, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 2048)
            },
            "gemini-3.1-pro-preview": {
                "strict_limits": {"rpm": 5, "tpm": 250000, "rpd": 50, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 5, "tpm": 250000, "rpd": 50, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 2048)
            },
            "gemini-2.5-flash": {
                "strict_limits": {"rpm": 10, "tpm": 250000, "rpd": 250, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 10, "tpm": 250000, "rpd": 250, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-3.6-flash": {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-3.5-flash": {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-3-flash-preview": {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 250000, "rpd": 500, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-2.5-flash-lite": {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 1000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 250000, "rpd": 1000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-3.1-flash-lite": {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 1000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 250000, "rpd": 1000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-3.5-flash-lite": {
                "strict_limits": {"rpm": 15, "tpm": 250000, "rpd": 1000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 250000, "rpd": 1000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-2.0-flash": {
                "strict_limits": {"rpm": 15, "tpm": 1000000, "rpd": 1500, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 15, "tpm": 1000000, "rpd": 1500, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-2.0-flash-lite": {
                "strict_limits": {"rpm": 30, "tpm": 1000000, "rpd": 1500, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 30, "tpm": 1000000, "rpd": 1500, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "gemma-3-27b-it": {
                "strict_limits": {"rpm": 30, "tpm": 15000, "rpd": 14400, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 30, "tpm": 15000, "rpd": 14400, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            }
        },
        "PAID": {
            "gemini-2.5-pro": {
                "strict_limits": {"rpm": 150, "tpm": 2000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 150, "tpm": 2000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 2048)
            },
            "gemini-3.1-pro-preview": {
                "strict_limits": {"rpm": 150, "tpm": 2000000, "rpd": 1000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 150, "tpm": 2000000, "rpd": 1000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 2048)
            },
            "gemini-2.5-flash": {
                "strict_limits": {"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-3.6-flash": {
                "strict_limits": {"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-3.5-flash": {
                "strict_limits": {"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-3-flash-preview": {
                "strict_limits": {"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 1000, "tpm": 1000000, "rpd": 10000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 512)
            },
            "gemini-2.5-flash-lite": {
                "strict_limits": {"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-3.1-flash-lite": {
                "strict_limits": {"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-3.5-flash-lite": {
                "strict_limits": {"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-2.0-flash": {
                "strict_limits": {"rpm": 2000, "tpm": 4000000, "rpd": 100000, "max_input_tokens": 128000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 2000, "tpm": 4000000, "rpd": 100000, "max_input_tokens": 128000, "max_output_tokens": 8192}, 85, 0)
            },
            "gemini-2.0-flash-lite": {
                "strict_limits": {"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 4000, "tpm": 4000000, "rpd": 150000, "max_input_tokens": 64000, "max_output_tokens": 8192}, 85, 0)
            }
        }
    },
    "GROQ": {
        "FREE": {
            "llama-3.3-70b-versatile": {
                "strict_limits": {"rpm": 30, "tpm": 12000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 30, "tpm": 12000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "llama-3.1-8b-instant": {
                "strict_limits": {"rpm": 30, "tpm": 20000, "rpd": 14400, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 30, "tpm": 20000, "rpd": 14400, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "qwen-2.5-coder-32b": {
                "strict_limits": {"rpm": 30, "tpm": 15000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 30, "tpm": 15000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "deepseek-r1-distill-llama-70b": {
                "strict_limits": {"rpm": 30, "tpm": 12000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 30, "tpm": 12000, "rpd": 1000, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            }
        },
        "PAID": {
            "llama-3.3-70b-versatile": {
                "strict_limits": {"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "llama-3.1-8b-instant": {
                "strict_limits": {"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "qwen-2.5-coder-32b": {
                "strict_limits": {"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            },
            "deepseek-r1-distill-llama-70b": {
                "strict_limits": {"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192},
                "working_limits": compute_working_limits({"rpm": 300, "tpm": 300000, "rpd": 50000, "max_input_tokens": 32768, "max_output_tokens": 8192}, 85, 0)
            }
        }
    },
    "OLLAMA": {
        "LOCAL": {
            "qwen2.5-coder:32b": {
                "strict_limits": {"rpm": 60, "tpm": 500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 60, "tpm": 500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "qwen2.5-coder:14b": {
                "strict_limits": {"rpm": 90, "tpm": 750000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 90, "tpm": 750000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "qwen2.5-coder:7b": {
                "strict_limits": {"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "qwen2.5-coder:1.5b": {
                "strict_limits": {"rpm": 180, "tpm": 1500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 180, "tpm": 1500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "codestral:22b": {
                "strict_limits": {"rpm": 60, "tpm": 500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 60, "tpm": 500000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "deepseek-r1:8b": {
                "strict_limits": {"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "sqlcoder:7b": {
                "strict_limits": {"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            },
            "llama3-groq-tool-use:8b": {
                "strict_limits": {"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096},
                "working_limits": compute_working_limits({"rpm": 120, "tpm": 1000000, "rpd": 999999, "max_input_tokens": 8192, "max_output_tokens": 4096}, 85, 0)
            }
        }
    }
}

# ------------------------------------------------------------------------------
# DYNAMIC MODEL REGISTRY & LIMITS (Derived dynamically from DEFAULT_PROVIDER_QUOTAS)
# ------------------------------------------------------------------------------
MODEL_REGISTRY = {}

# Populate primary models from Google Free tier and Ollama Local tier
for _m_name, _m_cfg in DEFAULT_PROVIDER_QUOTAS.get("GOOGLE", {}).get("FREE", {}).items():
    _limits = _m_cfg.get("strict_limits", {})
    MODEL_REGISTRY[_m_name] = {
        "rpm": _limits.get("rpm", 15),
        "tpm": _limits.get("tpm", 250000),
        "rpd": _limits.get("rpd", 500)
    }

for _m_name, _m_cfg in DEFAULT_PROVIDER_QUOTAS.get("OLLAMA", {}).get("LOCAL", {}).items():
    _limits = _m_cfg.get("strict_limits", {})
    MODEL_REGISTRY[_m_name] = {
        "rpm": _limits.get("rpm", 60),
        "tpm": _limits.get("tpm", 500000),
        "rpd": _limits.get("rpd", 999999)
    }

# Backward compatibility alias
MODEL_LIMITS = MODEL_REGISTRY

# Research & Specification Profiles
RESEARCH_PROFILES = {
    "BASIC": {
        "web_search_enabled": False, 
        "cache_raw_data": False, 
        "description": "Local offline memory extraction only."
    },
    "MEDIUM": {
        "web_search_enabled": True, 
        "cache_raw_data": True, 
        "description": "Single-turn live web documentation scraping loops."
    },
    "HIGH": {
        "web_search_enabled": True, 
        "cache_raw_data": True, 
        "description": "Parallel specific tech spec documentation lookups."
    },
    "MAX": {
        "web_search_enabled": True, 
        "cache_raw_data": True, 
        "description": "Multidimensional spec gathers + late context compilation passes."
    }
}
