"""Arabic STT service using dev-ahmedhany/whisper-large-v3-turbo-arabic-ft."""

import os
import subprocess
import tempfile
from contextlib import asynccontextmanager

import librosa
import torch
from fastapi import FastAPI, HTTPException, Request
from transformers import WhisperForConditionalGeneration, WhisperProcessor

MODEL_ID = os.getenv("WHISPER_MODEL_ID", "dev-ahmedhany/whisper-large-v3-turbo-arabic-ft")
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.bfloat16 if DEVICE == "cuda" and torch.cuda.is_bf16_supported() else torch.float32
model = None
processor = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, processor
    # Uses the supplied fine-tuned Arabic model. CPU safely falls back to fp32.
    model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID, torch_dtype=DTYPE)
    model.to(DEVICE)
    model.eval()
    processor = WhisperProcessor.from_pretrained(MODEL_ID, language="arabic", task="transcribe")
    yield


app = FastAPI(title="NOR AI Arabic Whisper", lifespan=lifespan)


def decode_to_16khz_wav(audio: bytes):
    """Mobile MediaRecorder normally produces WebM/Opus, so decode with ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".input") as source, tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        source.write(audio)
        source.flush()
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", source.name, "-ac", "1", "-ar", "16000", wav.name],
                check=True, capture_output=True, timeout=30,
            )
        except FileNotFoundError as error:
            raise HTTPException(500, "ffmpeg is required by the Whisper service") from error
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            raise HTTPException(400, "The audio recording could not be decoded") from error
        return librosa.load(wav.name, sr=16000, mono=True)


@app.get("/health")
async def health():
    return {"ok": model is not None, "model": MODEL_ID, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(request: Request):
    if os.getenv("WHISPER_API_TOKEN") and request.headers.get("authorization") != f"Bearer {os.environ['WHISPER_API_TOKEN']}":
        raise HTTPException(401, "Unauthorized")
    audio = await request.body()
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio is empty or exceeds the allowed size")
    waveform, sampling_rate = decode_to_16khz_wav(audio)
    inputs = processor(waveform, sampling_rate=sampling_rate, return_tensors="pt")
    features = inputs.input_features.to(device=DEVICE, dtype=DTYPE)
    with torch.inference_mode():
        ids = model.generate(input_features=features, language="arabic", task="transcribe")
    return {"text": processor.batch_decode(ids, skip_special_tokens=True)[0].strip(), "language": "ar", "model": MODEL_ID}
