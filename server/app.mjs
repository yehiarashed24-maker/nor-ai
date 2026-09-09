import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { detectIntent } from './features/intent.mjs';
import { processIntent } from './features/handlers.mjs';
import { transcribeWithArabicWhisper } from './features/transcription.mjs';

export const app = express();

app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY) });
});

const pcmToWavDataUrl = (pcmBase64, sampleRate = 24_000) => {
  const pcm = Buffer.from(pcmBase64, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return `data:audio/wav;base64,${Buffer.concat([header, pcm]).toString('base64')}`;
};

app.post('/api/speech', async (request, response) => {
  const text = typeof request.body?.text === 'string' ? request.body.text.trim().slice(0, 800) : '';
  if (!text) return response.status(400).json({ error: 'Text is required.' });

  const keys = [process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_KEY_SECONDARY].filter(Boolean);
  const region = process.env.AZURE_SPEECH_REGION;
  const voice = process.env.AZURE_SPEECH_VOICE || 'ar-EG-SalmaNeural';
  if (keys.length === 0 || !region) {
    return response.status(503).json({ error: 'Azure Speech is not configured.' });
  }

  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const ssml = `<speak version="1.0" xml:lang="ar-EG"><voice name="${voice}">${escapedText}</voice></speak>`;

  let lastError = null;
  for (const key of keys) {
    try {
      const azureResponse = await fetch(
        `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'NOR-AI',
          },
          body: ssml,
        },
      );
      if (!azureResponse.ok) {
        throw new Error(`Azure Speech returned ${azureResponse.status}`);
      }

      const audio = Buffer.from(await azureResponse.arrayBuffer()).toString('base64');
      if (!audio) throw new Error('Azure Speech returned empty audio');

      response.set('Cache-Control', 'no-store');
      return response.json({ audio: `data:audio/mpeg;base64,${audio}` });
    } catch (error) {
      lastError = error;
      console.warn('Azure Speech attempt failed, trying next key if available:', error.message);
    }
  }

  console.error('Arabic TTS failed:', lastError);
  return response.status(502).json({ error: 'Arabic voice generation failed.' });
});

app.post('/api/assist', async (request, response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return response.status(503).json({
      error: 'GEMINI_API_KEY is missing. Add your key in the environment variables.',
    });
  }

  const { question, audio, image, language = 'ar', memories = [], context = {} } = request.body ?? {};
  
  const audioMatch = typeof audio === 'string'
    ? audio.match(/^data:(audio\/[^;]+).*?;base64,(.+)$/s)
    : null;
    
  let questionText = typeof question === 'string' ? question.trim() : '';

  if (!questionText && !audioMatch) {
    return response.status(400).json({ error: 'A spoken or typed question is required.' });
  }

  // We still require the image if the intent is unknown or new frame is needed
  // But we defer the validation to after intent detection if possible.
  // Actually, for simplicity and since the frontend always sends an image currently:
  const imageMatch = typeof image === 'string' ? image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s) : null;
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Step 1: Prefer the fine-tuned Arabic Whisper service. Gemini is a
    // compatibility fallback while that separate GPU service is unavailable.
    if (!questionText && audioMatch) {
      try {
        questionText = await transcribeWithArabicWhisper(audioMatch) || '';
      } catch (error) {
        console.warn(`Arabic Whisper transcription unavailable (${error?.message}); using fallback.`);
      }
    }

    if (!questionText && audioMatch) {
      let mime = audioMatch[1];
      if (mime === 'audio/mp4') mime = 'video/mp4';
      const candidateModels = [process.env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.7-flash', 'gemini-3.5-flash'].filter(Boolean);
      for (const model of candidateModels) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: [{
              role: 'user',
              parts: [
                { text: 'Transcribe this audio exactly. Do not answer it. Just write the text in Arabic (if Arabic) or English (if English).' },
                { inlineData: { mimeType: mime, data: audioMatch[2] } }
              ]
            }],
            config: { temperature: 0.1 }
          });
          if (res?.text?.trim()) {
            questionText = res.text.trim();
            break;
          }
        } catch (err) {
          console.warn(`Transcription failed with model ${model}, trying next...`);
        }
      }
    }

    // Step 2: Detect Intent
    const { intent, needsNewFrame } = await detectIntent(ai, apiKey, questionText, context, language);

    if (needsNewFrame && !imageMatch) {
      return response.status(400).json({ error: 'A fresh camera image is required for this request.' });
    }

    // Step 3: Process Intent
    // Speech is now text: avoid sending the recording to Gemini a second time.
    const result = await processIntent(ai, intent, needsNewFrame, questionText, null, imageMatch, memories, context, language);

    return response.json(result);
  } catch (error) {
    console.error('NOR AI request failed:', error);
    return response.status(502).json({ error: 'NOR AI could not analyze this view. Please try again.' });
  }
});

export default app;
