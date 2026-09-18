import subprocess
import os
import json
import re
import requests
from src.logger import log_action
from src.memory_manager import get_tool_catalog

# ==============================================================================
# ADVANCE ASSISTANT OS v5.0 - EXTERNAL TOOL & AUTOMATION BRIDGE
# ==============================================================================

def normalize_tool_path(path_str: str) -> str:
    """
    Translates Windows drive letters (e.g., D:\\... or C:\\...) into native WSL 
    mount paths (/mnt/d/...) to ensure external CLI processes launch reliably.
    """
    if not path_str:
        return os.getcwd()
    clean = path_str.replace("\\", "/")
    if re.match(r'^[a-zA-Z]:', clean):
        drive_letter = clean[0].lower()
        clean = f"/mnt/{drive_letter}" + clean[2:]
    return os.path.normpath(os.path.abspath(clean))


def trigger_n8n_webhook(webhook_url: str, payload: dict) -> str:
    """
    Routes automation payloads to a local Windows n8n webhook endpoint
    (e.g., http://localhost:5678/webhook/advance-assistant-task) or external server.
    """
    log_action(
        category_or_model="TOOL_BRIDGE",
        action_type="N8N_TRIGGER",
        details={"url": webhook_url, "payload_keys": list(payload.keys())}
    )
    try:
        response = requests.post(webhook_url, json=payload, timeout=15)
        result_text = f"n8n Workflow triggered successfully. Status Code: {response.status_code} | Response: {response.text[:200]}"
        log_action(
            category_or_model="TOOL_BRIDGE",
            action_type="N8N_SUCCESS",
            details={"status_code": response.status_code}
        )
        return result_text
    except Exception as e:
        log_action(
            category_or_model="TOOL_BRIDGE",
            action_type="N8N_FAILED",
            details={"error": str(e)}
        )
        return f"Failed to connect to n8n webhook endpoint at {webhook_url}: {str(e)}"


def invoke_mcp_tool_call(server_name: str, tool_name: str, arguments: dict) -> str:
    """
    Model Context Protocol (MCP) Bridge:
    Formats and dispatches standardized MCP tool execution requests to active MCP servers.
    """
    log_action(
        category_or_model="TOOL_BRIDGE",
        action_type="MCP_CALL_DISPATCHED",
        details={"server": server_name, "tool": tool_name, "arguments": arguments}
    )
    try:
        # Standard MCP JSON-RPC payload structure
        mcp_payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            },
            "id": 1
        }
        
        # Local IPC / HTTP bridge to active MCP server daemon
        mcp_server_url = f"http://localhost:8080/mcp/{server_name}"
        res = requests.post(mcp_server_url, json=mcp_payload, timeout=20)
        
        if res.status_code == 200:
            return f"MCP Tool [{tool_name}] Execution Result:\n{res.text}"
        else:
            return f"MCP Server [{server_name}] returned error status {res.status_code}: {res.text}"
            
    except Exception as e:
        log_action(
            category_or_model="TOOL_BRIDGE",
            action_type="MCP_CALL_FAILED",
            details={"error": str(e)}
        )
        return f"MCP Bridge Tool Call Exception: {str(e)}"


def invoke_external_agent_tool(tool_name: str, working_dir: str, prompt_instruction: str) -> str:
    """
    Unified External Agentic Bridge:
    Spins up or dispatches tasks directly to local developer tools running on Windows/WSL:
      - Aider: Runs non-interactive batch code modifications in target folder.
      - RooCode / Cursor: Appends task instructions to local agent workspace prompts.
      - Antigravity: Executes tasks inside isolated Linux sandboxes.
      - n8n: Sends workflow payloads to local n8n automation instances.
    """
    target_dir = normalize_tool_path(working_dir)
    tool_lower = tool_name.lower().strip()

    log_action(
        category_or_model="TOOL_BRIDGE",
        action_type="INVOKING_EXTERNAL_TOOL",
        details={"tool": tool_lower, "working_dir": target_dir, "prompt_snippet": prompt_instruction[:100]}
    )

    # Ensure target directory exists before spawning external processes
    os.makedirs(target_dir, exist_ok=True)

    # --------------------------------------------------------------------------
    # 1. AIDER BATCH CLI INTEGRATION
    # --------------------------------------------------------------------------
    if tool_lower == "aider":
        escaped_prompt = prompt_instruction.replace('"', '\\"')
        command = f'aider --message "{escaped_prompt}" --no-auto-commit --no-analytics'
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                cwd=target_dir,
                timeout=300
            )
            output = result.stdout if result.returncode == 0 else result.stderr
            log_action(
                category_or_model="TOOL_BRIDGE",
                action_type="AIDER_SUCCESS",
                details={"exit_code": result.returncode, "output_snippet": output[:200]}
            )
            return f"=== AIDER BATCH EXECUTION TRACE ===\n{output}"
        except subprocess.TimeoutExpired:
            log_action(
                category_or_model="TOOL_BRIDGE",
                action_type="AIDER_TIMEOUT",
                details={"timeout_seconds": 300}
            )
            return "Aider Integration Error: Process execution timed out after 300 seconds."
        except Exception as e:
            log_action(
                category_or_model="TOOL_BRIDGE",
                action_type="AIDER_FAILED",
                details={"error": str(e)}
            )
            return f"Aider Integration Exception: {str(e)}"

    # --------------------------------------------------------------------------
    # 2. LOCAL WINDOWS N8N AUTOMATION BRIDGE
    # --------------------------------------------------------------------------
    elif tool_lower == "n8n":
        webhook_url = "http://localhost:5678/webhook/advance-assistant-task"
        payload = {
            "task": prompt_instruction,
            "directory": target_dir,
            "source": "Advance_Assistant_OS"
        }
        return trigger_n8n_webhook(webhook_url, payload)

    # --------------------------------------------------------------------------
    # 3. ROOCODE / CURSOR VS CODE EXTENSION PROMPT BRIDGE
    # --------------------------------------------------------------------------
    elif tool_lower in ["roocode", "cursor"]:
        task_file = os.path.join(target_dir, ".roocode_task.md")
        try:
            with open(task_file, "w", encoding="utf-8") as f:
                f.write(f"# RooCode / Cursor Task Directive\n\n{prompt_instruction}\n")
            
            log_action(
                category_or_model="TOOL_BRIDGE",
                action_type="ROOCODE_PROMPT_WRITTEN",
                details={"path": task_file}
            )
            return f"Successfully generated RooCode/Cursor task file at: {task_file}\nOpen VS Code inside '{target_dir}' to execute."
        except Exception as e:
            return f"RooCode Task Bridge Exception: {str(e)}"

    # --------------------------------------------------------------------------
    # 4. ANTIGRAVITY ISOLATED SANDBOX BRIDGE
    # --------------------------------------------------------------------------
    elif tool_lower == "antigravity":
        command = f'antigravity run --dir "{target_dir}" --goal "{prompt_instruction}"'
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                cwd=target_dir,
                timeout=300
            )
            output = result.stdout if result.returncode == 0 else result.stderr
            log_action(
                category_or_model="TOOL_BRIDGE",
                action_type="ANTIGRAVITY_SUCCESS",
                details={"output_snippet": output[:200]}
            )
            return f"=== ANTIGRAVITY SANDBOX TRACE ===\n{output}"
        except Exception as e:
            return f"Antigravity Sandbox Execution Exception: {str(e)}"

    # Failsafe for unsupported tools
    return f"Unsupported or unregistered external tool configuration: '{tool_name}'"