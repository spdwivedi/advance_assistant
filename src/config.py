import os

# Base Directory Paths
SEARCH_DATA_DIR = os.path.abspath("./.search_data")
SWARM_REGISTRY_FILE = os.path.abspath("./.agent_memory/swarm_registry.json")
TOKEN_LEDGER_FILE = os.path.abspath("./.agent_memory/token_ledger.json")

# Isolated Testing Paths
TEST_DATA_DIR = os.path.abspath("./test/test_data")
TEST_LOGS_DIR = os.path.abspath("./test/test_logs")
TEST_SCRIPTS_DIR = os.path.abspath("./test/test_scripts")

# Windows Native Cross-Platform Test Path
WIN_TEST_DATA_DIR = "D:/Project_Files/Assistant_Projects/Test_Win_Data"

# Project-Scoped Workspace Isolated Logs Directory
PROJECT_LOGS_DIR = os.path.abspath("./logs/projects")
PROJECT_LOG_DIR = PROJECT_LOGS_DIR

# Auto-create local directories
for t_dir in [TEST_DATA_DIR, TEST_LOGS_DIR, TEST_SCRIPTS_DIR, PROJECT_LOGS_DIR]:
    os.makedirs(t_dir, exist_ok=True)

# Attempt to initialize Windows Test Data directory if D: drive path is accessible
try:
    if os.path.exists("D:/Project_Files/Assistant_Projects"):
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

# ------------------------------------------------------------------------------
# HARD FREE-TIER MODEL LIMITS REGISTRY (Google AI Studio Exact Boundaries)
# ------------------------------------------------------------------------------
MODEL_REGISTRY = {
    "gemini-3.1-pro-preview": {"rpm": 25,   "tpm": 2000000, "rpd": 250},
    "gemini-2.5-pro":         {"rpm": 150,  "tpm": 2000000, "rpd": 1000},
    "gemini-3.6-flash":       {"rpm": 1000, "tpm": 2000000, "rpd": 10000},
    "gemini-3.5-flash":       {"rpm": 1000, "tpm": 2000000, "rpd": 10000},
    "gemini-3-flash-preview": {"rpm": 1000, "tpm": 2000000, "rpd": 10000},
    "gemini-2.5-flash":       {"rpm": 1000, "tpm": 1000000, "rpd": 10000},
    "gemini-3.5-flash-lite":  {"rpm": 4000, "tpm": 4000000, "rpd": 150000},
    "gemini-3.1-flash-lite":  {"rpm": 4000, "tpm": 4000000, "rpd": 150000},
    "gemini-2.5-flash-lite":  {"rpm": 4000, "tpm": 4000000, "rpd": 999999},  # Unlimited
    "qwen2.5-coder:32b":      {"rpm": 999,  "tpm": 9900000, "rpd": 999999},
    "qwen2.5-coder:7b":       {"rpm": 999,  "tpm": 9900000, "rpd": 999999}
}

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