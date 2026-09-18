import subprocess
import os
import re
import shutil
from src.logger import log_action

# Safe baseline command execution prefix list across WSL and Windows
ALLOWED_SAFE_COMMANDS = [
    "ls", "dir", "git status", "git", "pytest", "python3", "python", "cat", "type", 
    "pwd", "mkdir", "cd", "npm", "node", "npx", "pip install", "npm install",
    "npm run", "uvicorn", "powershell", "cmd"
]


def normalize_cross_platform_path(path_str: str) -> str:
    """
    Translates Windows drive paths (e.g. D:\\Project_Files or D:/Project_Files)
    into native WSL mount paths (/mnt/d/Project_Files) for Linux execution environments.
    """
    if not path_str:
        return path_str
    clean = path_str.replace("\\", "/")
    if re.match(r'^[a-zA-Z]:', clean):
        drive_letter = clean[0].lower()
        clean = f"/mnt/{drive_letter}" + clean[2:]
    return os.path.normpath(clean)


def sanitize_file_content(content: str, filepath: str) -> str:
    """
    Strips LLM Markdown artifacts (bold wrappers, code fence lines, conversational text)
    and blocks error warning summaries from accidentally being written to disk.
    """
    if not content:
        return ""

    content = content.strip()

    # Detect and reject conversational phrases accidentally passed by correction loops
    corrupt_phrases = [
        "the code generated was incomplete",
        "had formatting tags",
        "rewrite it fully",
        "please ensure that the directory structure"
    ]
    if any(phrase in content.lower() for phrase in corrupt_phrases):
        log_action(
            category_or_model="GATEKEEPER",
            action_type="CORRUPT_CONTENT_INTERCEPTED",
            details={"filepath": filepath, "content_preview": content[:60]}
        )
        if filepath.endswith(".py"):
            return f"# Auto-repaired placeholder for {os.path.basename(filepath)}\n"
        return ""

    # 1. Strip surrounding Markdown bold/italic syntax (e.g., **code**)
    while (content.startswith("**") and content.endswith("**")) or (content.startswith("*") and content.endswith("*")):
        if content.startswith("**") and content.endswith("**") and len(content) >= 4:
            content = content[2:-2].strip()
        elif content.startswith("*") and content.endswith("*") and len(content) >= 2:
            content = content[1:-1].strip()

    # 2. Strip Markdown code fences (e.g., ```python ... ```)
    lines = content.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines.pop(0)  # Remove opening fence line
    if lines and lines[-1].strip().startswith("```"):
        lines.pop()   # Remove closing fence line

    cleaned = "\n".join(lines).strip()

    # 3. Clean lingering trailing bold markers from responses
    if cleaned.endswith("**"):
        cleaned = cleaned[:-2].strip()

    # 4. Strict Sanitization for requirements.txt (Keep ONLY valid package specifiers)
    if filepath.endswith("requirements.txt"):
        req_lines = []
        for line in cleaned.splitlines():
            line_str = line.strip()
            if line_str and not line_str.startswith("#") and not line_str.startswith("`") and " " not in line_str:
                req_lines.append(line_str)
            elif line_str and ("==" in line_str or ">=" in line_str or "<=" in line_str or "~=" in line_str):
                req_lines.append(line_str)
        cleaned = "\n".join(req_lines).strip()

    return cleaned


def resolve_path_collisions(target_path: str):
    """
    Path Collision Resolver (Errno 17 & Errno 20 Fix):
    Verifies if any parent folder in target_path exists as a plain file on disk.
    Automatically removes conflicting files so directory trees can be created cleanly.
    """
    norm_path = os.path.normpath(target_path)
    parts = norm_path.split(os.sep)

    current_check = "/" if target_path.startswith("/") else ""
    for part in parts[:-1]:  # Check parent directories only
        if not part:
            continue
        current_check = os.path.join(current_check, part)
        if os.path.exists(current_check) and os.path.isfile(current_check):
            log_action(
                category_or_model="GATEKEEPER",
                action_type="COLLISION_FILE_REMOVED",
                details={"conflicting_file": current_check}
            )
            try:
                os.remove(current_check)
            except Exception as e:
                print(f"⚠️ Unable to remove conflicting file '{current_check}': {e}")


def execute_command(
    command: str,
    target_dir: str = None,
    model_name: str = "DEV_CODER",
    auto_approve: bool = False,
    project_name: str = None,
    test_name: str = None
) -> str:
    """
    Cross-Platform Execution Gatekeeper & File Writer v6.0:
    - Normalizes Windows drive paths (D:\\) to native WSL mounts (/mnt/d/).
    - Resolves filesystem path collisions (Errno 17/20/21) before disk writes.
    - Sanitizes code content against LLM conversational artifacts.
    - Routes logs to project-scoped and test-scoped mirror logs.
    """
    command = command.strip().strip('*`').strip()

    # --------------------------------------------------------------------------
    # 1. HANDLE FILE WRITING REQUESTS (WRITE_FILE: /path | content)
    # --------------------------------------------------------------------------
    if "WRITE_FILE:" in command:
        try:
            raw_data = command[command.find("WRITE_FILE:") + 11:].strip()
            if "|" not in raw_data:
                return "Error: Invalid WRITE_FILE structure. Expected '|' separator between path and content."

            filepath, raw_content = raw_data.split("|", 1)
            filepath = filepath.strip().strip('*`"\'')

            # Clean LLM path echo duplications
            filepath = re.sub(r'(/mnt/[a-z]/[^\s]+)\s+\1', r'\1', filepath).strip()

            # Normalize Windows drive letters to WSL path syntax
            filepath = normalize_cross_platform_path(filepath)

            # Resolve absolute target path
            resolved_filepath = filepath
            if not os.path.isabs(resolved_filepath) and target_dir:
                clean_target_dir = normalize_cross_platform_path(target_dir)
                resolved_filepath = os.path.normpath(os.path.join(clean_target_dir, filepath))

            # Guardrail: Prevent writing directly to root folder path (Errno 21 Fix)
            if os.path.isdir(resolved_filepath) or (target_dir and resolved_filepath.rstrip('/\\') == normalize_cross_platform_path(target_dir).rstrip('/\\')):
                log_action(
                    category_or_model="GATEKEEPER",
                    action_type="WRITE_BLOCKED_IS_DIR",
                    details={"path": resolved_filepath, "project_name": project_name, "test_name": test_name},
                    model_name=model_name
                )
                return f"WRITE_BLOCKED: Target '{filepath}' is a directory. Please supply a valid filename."

            # Guardrail: Block Python scripts inside frontend UI folders
            clean_filepath_lower = filepath.replace("\\", "/").lower()
            if "frontend/" in clean_filepath_lower and clean_filepath_lower.endswith(".py"):
                log_action(
                    category_or_model="GATEKEEPER",
                    action_type="WRITE_BLOCKED",
                    details={"reason": "Prevented Python file creation inside frontend directory", "path": filepath, "project_name": project_name, "test_name": test_name},
                    model_name=model_name
                )
                return f"WRITE_BLOCKED: Skipped writing Python file '{filepath}' inside frontend folder."

            # Sanitize raw code content
            clean_content = sanitize_file_content(raw_content, filepath)

            # Resolve parent directory collisions
            resolve_path_collisions(resolved_filepath)

            # Ensure parent directories exist
            os.makedirs(os.path.dirname(resolved_filepath), exist_ok=True)

            # Write clean sanitized code to disk
            with open(resolved_filepath, "w", encoding="utf-8") as f:
                f.write(clean_content)

            log_action(
                category_or_model="GATEKEEPER",
                action_type="FILE_WRITE_SUCCESS",
                details={
                    "path": resolved_filepath, 
                    "bytes_written": len(clean_content),
                    "project_name": project_name,
                    "test_name": test_name
                },
                model_name=model_name
            )
            return f"Successfully created and wrote sanitized file at: {resolved_filepath}"

        except Exception as e:
            log_action(
                category_or_model="GATEKEEPER",
                action_type="FILE_WRITE_FAILED",
                details={"error": str(e), "project_name": project_name, "test_name": test_name},
                model_name=model_name
            )
            return f"File creation failed: {str(e)}"

    # --------------------------------------------------------------------------
    # 2. HANDLE TERMINAL & SYSTEM COMMAND EXECUTION
    # --------------------------------------------------------------------------
    cmd_stripped = command.strip()
    
    is_safe = any(cmd_stripped.startswith(cmd) for cmd in ALLOWED_SAFE_COMMANDS) or "pip install" in cmd_stripped or "npm" in cmd_stripped

    if not is_safe and not auto_approve:
        print(f"\n⚠️  [PERMISSION REQUESTED BY {model_name.upper()}]")
        user_input = input(f"Allow command execution: '{command}'? (y/n): ")
        if user_input.lower() != 'y':
            log_action(
                category_or_model="GATEKEEPER",
                action_type="EXECUTION_DENIED",
                details={"command": command, "project_name": project_name, "test_name": test_name},
                model_name=model_name
            )
            return "EXECUTION_DENIED_BY_USER"

    log_action(
        category_or_model="GATEKEEPER",
        action_type="EXECUTING_COMMAND",
        details={"command": command, "directory_context": target_dir, "project_name": project_name, "test_name": test_name},
        model_name=model_name
    )

    try:
        working_directory = normalize_cross_platform_path(target_dir) if target_dir else os.getcwd()
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=working_directory
        )
        output = result.stdout if result.returncode == 0 else result.stderr
        return output if output else "Command executed successfully with no console output."

    except subprocess.TimeoutExpired:
        log_action(
            category_or_model="GATEKEEPER",
            action_type="COMMAND_TIMEOUT",
            details={"command": command, "timeout_seconds": 120, "project_name": project_name, "test_name": test_name},
            model_name=model_name
        )
        return "Command Execution Error: Process timed out after 120 seconds."

    except Exception as e:
        log_action(
            category_or_model="GATEKEEPER",
            action_type="COMMAND_EXECUTION_EXCEPT",
            details={"error": str(e), "project_name": project_name, "test_name": test_name},
            model_name=model_name
        )
        return f"Command Execution Exception: {str(e)}"