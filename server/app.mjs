import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { detectIntent } from './features/intent.mjs';
import { processIntent } from './features/handlers.mjs';

export const app = express();

app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, configured: Boolean(process.env.GEMINI_API_KEY) });
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
    
    // Step 1: Transcribe audio if no question text is provided
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
    const result = await processIntent(ai, intent, needsNewFrame, questionText, audioMatch, imageMatch, memories, context, language);

    return response.json(result);
  } catch (error) {
    console.error('NOR AI request failed:', error);
    return response.status(502).json({ error: 'NOR AI could not analyze this view. Please try again.' });
  }
});

export default app;
