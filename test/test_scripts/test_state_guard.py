"""
State and Memory Guard for Zero-Pollution Test Execution.
Backs up sensitive .agent_memory state files in memory before test suites run,
and restores them byte-for-byte upon exit, reloading token_governor and key_manager singletons.
"""
import os
import sys
from pathlib import Path
from contextlib import contextmanager
from typing import Dict, Optional

# Track the monitored state files
MEMORY_FILES = [
    "token_ledger.json",
    "provider_quotas.json",
    "api_keys.json",
    "env_history.json",
    "swarm_profiles.json",
    "swarm_registry.json",
    "sub_agents.json",
    "catalog_index.json"
]

@contextmanager
def preserve_agent_memory():
    """
    Context manager that snapshots specified .agent_memory JSON files into memory,
    runs the inner block, and restores all files to exact pre-test bytes in finally:.
    Also reloads singleton states (token_governor, key_manager).
    """
    # Locate .agent_memory directory
    repo_root = Path(__file__).resolve().parent.parent.parent
    mem_dir = repo_root / ".agent_memory"

    # Snapshot files into memory (bytes)
    snapshots: Dict[str, Optional[bytes]] = {}
    for fname in MEMORY_FILES:
        fpath = mem_dir / fname
        if fpath.exists():
            try:
                with open(fpath, "rb") as f:
                    snapshots[fname] = f.read()
            except Exception:
                snapshots[fname] = None
        else:
            snapshots[fname] = None

    try:
        yield
    finally:
        # Restore all files byte-for-byte
        for fname, data in snapshots.items():
            fpath = mem_dir / fname
            if data is not None:
                try:
                    with open(fpath, "wb") as f:
                        f.write(data)
                except Exception as e:
                    print(f"[preserve_agent_memory] Warning: Failed to restore {fname}: {e}", file=sys.stderr)
            else:
                # File didn't exist before test; remove if created during test
                if fpath.exists():
                    try:
                        fpath.unlink()
                    except Exception:
                        pass

        # Reload singletons
        try:
            from src.token_governor import token_governor
            token_governor.reload_state()
        except Exception:
            pass

        try:
            from src.key_manager import key_manager
            if hasattr(key_manager, "reload_keys"):
                key_manager.reload_keys()
        except Exception:
            pass
