import os
import time
from PIL import Image
from google import genai
from playwright.sync_api import sync_playwright
from src.config import MODEL_REGISTRY
from src.logger import log_action
from src.agent import governor

# ==============================================================================
# ADVANCE ASSISTANT OS v5.0 - MULTIMODAL FRONTEND VISUAL ENGINE
# ==============================================================================

class VisionEngine:
    def __init__(self):
        """
        Initializes the Frontend Analyst Vision Engine.
        Validates external API tokens and pre-registers default configuration parameters.
        """
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        # Uses the stable, zero-cost multimodal model by default
        self.default_vision_model = "gemini-2.5-flash"

    def analyze_web_page(self, url: str, instruction: str = "Verify layout errors, padding consistency, border margins, and alignment metrics.") -> str:
        """
        Captures a pixel-perfect viewport snapshot of a running application web url,
        scans the visual elements against token governor constraints, and dispatches it 
        to an active free vision model for strict interface auditing.
        """
        screenshot_path = "./logs/latest_screenshot.png"
        os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
        
        log_action(
            category_or_model="VISION_ENGINE",
            action_type="CAPTURE_INITIATED",
            details={"url": url, "target_snapshot": screenshot_path}
        )
        
        # --- PHASE 1: HEADLESS PLAYWRIGHT VIEWPORT CAPTURE ---
        try:
            with sync_playwright() as p:
                log_action(
                    category_or_model="VISION_ENGINE",
                    action_type="BROWSER_LAUNCH",
                    details={"browser": "chromium", "headless": True}
                )
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(viewport={"width": 1280, "height": 800})
                
                # Navigate to the target page with a safe network idle timeout bound
                page.goto(url, timeout=30000, wait_until="networkidle")
                
                # Allow single page layouts or hydration scripts to stabilize visually
                time.sleep(1.5)
                
                page.screenshot(path=screenshot_path, full_page=False)
                browser.close()
                
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="CAPTURE_SUCCESS",
                details={"url": url, "file_size_bytes": os.path.getsize(screenshot_path)}
            )
        except Exception as e:
            error_msg = f"Vision Engine local viewport capture exception encountered: {str(e)}"
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="CAPTURE_CRASH",
                details={"error": str(e)}
            )
            return error_msg

        # --- PHASE 2: MULTIMODAL API TOKEN ALLOCATION & ANALYSIS ---
        if not self.client:
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="API_SKIPPED",
                details={"reason": "Missing validation credentials for cloud analysis client."}
            )
            return "Vision Analysis Stopped: Missing standard GEMINI_API_KEY environment variable token."

        model_id = self.default_vision_model

        # Enforce rate window budget controls to prevent account throttling and automatic billing
        if not governor.inspect_and_cool_allocation(model_id, estimated_tokens=8000, requires_search=False):
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="ANALYSIS_BUDGET_EXHAUSTED",
                details={"model": model_id}
            )
            return "Vision Analysis Deferred: Assigned cloud analysis model currently exceeds safe free daily quotas."

        try:
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="MODEL_DISPATCH",
                details={"model": model_id, "instruction_snippet": instruction[:80]}
            )
            
            # Open image file handles using PIL container wrapper securely
            with Image.open(screenshot_path) as img:
                response = self.client.models.generate_content(
                    model=model_id,
                    contents=[
                        img, 
                        f"Analyze this technical interface screenshot. Instruction Goal: {instruction}"
                    ]
                )
                
            analysis_text = response.text if response.text else "Analysis completed with empty context string output."
            
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="ANALYSIS_SUCCESS",
                details={"model": model_id, "response_length": len(analysis_text)}
            )
            return f"=== VISUAL INTERFACE ANALYSIS MATRIX ({model_id.upper()}) ===\n{analysis_text}"

        except Exception as e:
            log_action(
                category_or_model="VISION_ENGINE",
                action_type="ANALYSIS_FAILED",
                details={"model": model_id, "error": str(e)}
            )
            return f"Vision System Cloud Analysis Runtime Exception: {str(e)}"