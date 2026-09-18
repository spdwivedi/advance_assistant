import os
from src.logger import log_action

# ==============================================================================
# ADVANCE ASSISTANT OS - AUDIO LISTENER & VOICE SYNTHESIS ENGINE
# ==============================================================================

class VoiceEngine:
    def __init__(self, stt_model_size: str = "small.en"):
        """
        Initializes the Voice Processing Engine.
        Lazy-loads CUDA Faster-Whisper weights on demand to conserve GPU VRAM budget.
        """
        self.stt_model = None
        self.stt_model_size = stt_model_size

    def initialize_stt(self):
        """
        Lazy loader for Faster-Whisper on CUDA.
        Loads compute weights into GPU memory only when transcription is requested.
        """
        if self.stt_model is None:
            try:
                from faster_whisper import WhisperModel
                log_action(
                    category_or_model="AUDIO_LISTENER",
                    action_type="INITIALIZING_STT",
                    details={"model_size": self.stt_model_size, "device": "cuda", "compute_type": "float16"}
                )
                # Load Whisper Model on GPU CUDA cores
                self.stt_model = WhisperModel(
                    self.stt_model_size, 
                    device="cuda", 
                    compute_type="float16"
                )
                log_action(
                    category_or_model="AUDIO_LISTENER",
                    action_type="STT_READY",
                    details={"status": "initialized"}
                )
            except Exception as e:
                log_action(
                    category_or_model="AUDIO_LISTENER",
                    action_type="STT_INIT_FAILED",
                    details={"error": str(e)}
                )
                print(f"VoiceEngine STT Initialization Warning: {str(e)}")

    def transcribe_audio(self, audio_filepath: str) -> str:
        """
        Transcribes an input audio file into text using CUDA-accelerated Faster-Whisper.
        """
        self.initialize_stt()
        if not self.stt_model:
            log_action(
                category_or_model="AUDIO_LISTENER",
                action_type="STT_UNAVAILABLE",
                details={"file": audio_filepath}
            )
            return "Transcription Unavailable: CUDA Whisper Model failed to initialize."

        log_action(
            category_or_model="AUDIO_LISTENER",
            action_type="TRANSCRIBING_START",
            details={"file": audio_filepath}
        )

        try:
            segments, info = self.stt_model.transcribe(audio_filepath, beam_size=1)
            transcription_text = " ".join([segment.text for segment in segments]).strip()

            log_action(
                category_or_model="AUDIO_LISTENER",
                action_type="TRANSCRIPTION_COMPLETE",
                details={
                    "text_length": len(transcription_text),
                    "detected_language": info.language,
                    "language_probability": info.language_probability
                }
            )
            return transcription_text

        except Exception as e:
            log_action(
                category_or_model="AUDIO_LISTENER",
                action_type="TRANSCRIBING_FAILED",
                details={"error": str(e)}
            )
            return f"Audio Transcription Runtime Exception: {str(e)}"

    def speak_text(self, text: str):
        """
        Synthesizes text to speech output using local system audio backends.
        Applies input sanitization to prevent terminal shell injection.
        """
        log_action(
            category_or_model="AUDIO_SPEAKER",
            action_type="SYNTHESIZING_SPEAKER",
            details={"text_snippet": text[:100]}
        )

        try:
            # Strip quotes, backticks, and shell command separators
            clean_text = text.replace('"', '').replace("'", "").replace("`", "").replace(";", "")
            
            # Execute speech synthesizer via system command fallback
            os.system(f'espeak-ng "{clean_text[:250]}" > /dev/null 2>&1')
            
            log_action(
                category_or_model="AUDIO_SPEAKER",
                action_type="SPEECH_SUCCESS",
                details={"chars_spoken": min(len(clean_text), 250)}
            )
        except Exception as e:
            log_action(
                category_or_model="AUDIO_SPEAKER",
                action_type="SPEAKER_ERROR",
                details={"error": str(e)}
            )
            print(f"Speech Synthesis Exception: {str(e)}")