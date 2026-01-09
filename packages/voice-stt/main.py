"""
Voice-to-Text Service using NVIDIA Parakeet on Modal

Deploys Parakeet-TDT-0.6B-v2 for high-accuracy speech recognition.
Scales to zero after 20 minutes of inactivity.

Usage:
    modal deploy main.py
    modal serve main.py  # for local development
"""

import modal

app = modal.App("claude-code-voice")

# Build image with NeMo and dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "nemo_toolkit[asr]",
        "torch",
        "torchaudio",
        "huggingface_hub",
    )
)

# Cache the model in a Modal volume to speed up cold starts
model_volume = modal.Volume.from_name("parakeet-model-cache", create_if_missing=True)
MODEL_DIR = "/model-cache"


@app.function(
    gpu="T4",  # 16GB VRAM - cheapest option that works well
    image=image,
    volumes={MODEL_DIR: model_volume},
    scaledown_window=1200,  # 20 min idle timeout
    timeout=120,
    memory=8192,  # 8GB RAM
)
def transcribe(audio_bytes: bytes, language: str = "en") -> dict:
    """
    Transcribe audio bytes to text using Parakeet.

    Args:
        audio_bytes: Raw audio data (WAV, MP3, WebM, etc.)
        language: Language code (default: "en")

    Returns:
        dict with "text" (transcription) and "language"
    """
    import nemo.collections.asr as nemo_asr
    import tempfile
    import os
    import subprocess

    # Convert audio to WAV format (NeMo requirement)
    with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as input_file:
        input_file.write(audio_bytes)
        input_path = input_file.name

    wav_path = input_path.replace(".input", ".wav")

    try:
        # Use ffmpeg to convert to 16kHz mono WAV (optimal for Parakeet)
        subprocess.run(
            [
                "ffmpeg",
                "-i",
                input_path,
                "-ar",
                "16000",  # 16kHz sample rate
                "-ac",
                "1",  # Mono
                "-y",  # Overwrite
                wav_path,
            ],
            check=True,
            capture_output=True,
        )

        # Load model (cached after first load)
        model = nemo_asr.models.ASRModel.from_pretrained(
            "nvidia/parakeet-tdt-0.6b-v2",
            map_location="cuda",
        )

        # Transcribe
        transcriptions = model.transcribe([wav_path])
        text = transcriptions[0] if transcriptions else ""

        return {"text": text, "language": language}

    finally:
        # Cleanup temp files
        if os.path.exists(input_path):
            os.unlink(input_path)
        if os.path.exists(wav_path):
            os.unlink(wav_path)


@app.function(
    gpu="T4",
    image=image,
    volumes={MODEL_DIR: model_volume},
    scaledown_window=1200,
    timeout=120,
    memory=8192,
)
def warmup():
    """
    Pre-warm the model by loading it into GPU memory.
    Call this after deployment to reduce first-request latency.
    """
    import nemo.collections.asr as nemo_asr

    print("Loading Parakeet model...")
    model = nemo_asr.models.ASRModel.from_pretrained(
        "nvidia/parakeet-tdt-0.6b-v2",
        map_location="cuda",
    )
    print(f"Model loaded: {model.__class__.__name__}")
    return {"status": "warm", "model": "parakeet-tdt-0.6b-v2"}


# HTTP endpoint for direct REST API access
@app.function(
    gpu="T4",
    image=image,
    volumes={MODEL_DIR: model_volume},
    scaledown_window=1200,
    timeout=120,
    memory=8192,
)
@modal.web_endpoint(method="POST")
def transcribe_http(audio: bytes) -> dict:
    """
    HTTP endpoint for transcription.
    Accepts raw audio bytes in request body.
    """
    return transcribe.local(audio)


@app.local_entrypoint()
def main():
    """Test the transcription with a sample file."""
    import sys

    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
    else:
        print("Usage: modal run main.py -- <audio_file>")
        print("No audio file provided, running warmup only...")
        result = warmup.remote()
        print(f"Warmup result: {result}")
        return

    print(f"Transcribing: {audio_file}")
    with open(audio_file, "rb") as f:
        audio_bytes = f.read()

    result = transcribe.remote(audio_bytes)
    print(f"Transcription: {result['text']}")
