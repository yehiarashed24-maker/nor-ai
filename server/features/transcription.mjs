const DEFAULT_TIMEOUT_MS = 45_000;

/** Keeps the multi-gigabyte PyTorch model outside the PWA and Node process. */
export async function transcribeWithArabicWhisper(audioMatch) {
  const endpoint = process.env.WHISPER_API_URL?.replace(/\/$/, '');
  if (!endpoint || !audioMatch) return null;

  const [, recordedMimeType, base64Audio] = audioMatch;
  const audio = Buffer.from(base64Audio, 'base64');
  if (!audio.length) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WHISPER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${endpoint}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': recordedMimeType,
        'Content-Length': String(audio.length),
        ...(process.env.WHISPER_API_TOKEN ? { Authorization: `Bearer ${process.env.WHISPER_API_TOKEN}` } : {}),
      },
      body: audio,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Whisper service returned ${response.status}`);
    const payload = await response.json();
    return typeof payload?.text === 'string' && payload.text.trim() ? payload.text.trim() : null;
  } finally {
    clearTimeout(timeout);
  }
}
