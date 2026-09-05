import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

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

  const { question, audio, image, language = 'ar', memories = [] } = request.body ?? {};
  const hasQuestion = typeof question === 'string' && Boolean(question.trim());
  const audioMatch = typeof audio === 'string'
    ? audio.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/s)
    : null;
  if (!hasQuestion && !audioMatch) {
    return response.status(400).json({ error: 'A spoken or typed question is required.' });
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return response.status(400).json({ error: 'A fresh camera image is required.' });
  }

  const imageMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!imageMatch) {
    return response.status(400).json({ error: 'The camera image format is invalid.' });
  }

  const safeMemories = Array.isArray(memories)
    ? memories.filter((item) => typeof item === 'string').slice(-12).map((item) => item.slice(0, 300))
    : [];
  const answerLanguage = language === 'en'
    ? 'clear, natural English'
    : 'clear, natural Egyptian Arabic written entirely in Arabic script';
  const systemInstruction = `You are NOR AI, a concise voice-first visual assistant for blind and visually impaired people.
Answer only in ${answerLanguage}, based on the selected website language even if the user asks in another language. Analyze only the single fresh image attached to this request.
Support scene questions, reading visible text, social context, crowd summaries, step-by-step task guidance, and locating a requested object using simple image-relative directions: left, right, above, below, or center.
Never claim certainty about identity, emotion, danger, distance, or an object you cannot see clearly. Say when the view is unclear and ask the user to point the camera again.
For navigation or safety-critical questions, describe visible facts and advise the user to verify with a cane, guide, or another person. Do not give street-crossing clearance.
Do not identify real people from their faces. You may describe visible clothing, posture, and non-sensitive social cues.
Keep the spoken answer short unless the user asks for detail or task steps. Use natural sentences that sound good when read aloud. Avoid technical terms, markdown, emoji, Latin words in Arabic answers, and unnecessary punctuation. Preserve visible text exactly only when the user asks you to read it.
If spoken audio is attached, transcribe it internally and answer the spoken request. Do not ask the user to repeat unless the audio is unintelligible.
If the user explicitly asks you to remember a fact, return that fact in memoryToSave. Otherwise return null.
Return valid JSON only with this shape: {"answer":"...","memoryToSave":null,"transcript":"the detected user request"}.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `User memory:\n${safeMemories.length ? safeMemories.join('\n') : '(none)'}\n\n${hasQuestion ? `User request: ${question.trim()}` : 'The user request is in the attached audio. Listen carefully and answer it.'}`;
    const parts = [{ text: prompt }];
    if (audioMatch) {
      parts.push({ inlineData: { mimeType: audioMatch[1], data: audioMatch[2] } });
    }
    parts.push({ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } });
    const preferredModel = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== 'gemini-3.6-flash')
      ? process.env.GEMINI_MODEL
      : 'gemini-3.5-flash';

    let result;
    try {
      result = await ai.models.generateContent({
        model: preferredModel,
        contents: [{
          role: 'user',
          parts,
        }],
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });
    } catch (err) {
      console.warn(`Model ${preferredModel} failed (${err?.status || err?.message}), falling back to gemini-3.5-flash`);
      result = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{
          role: 'user',
          parts,
        }],
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });
    }

    const raw = result.text?.trim();
    if (!raw) throw new Error('Gemini returned an empty response.');
    const parsed = JSON.parse(raw);
    return response.json({
      answer: String(parsed.answer || ''),
      memoryToSave: typeof parsed.memoryToSave === 'string' ? parsed.memoryToSave.slice(0, 300) : null,
      transcript: typeof parsed.transcript === 'string'
        ? parsed.transcript.slice(0, 500)
        : (hasQuestion ? question.trim().slice(0, 500) : ''),
    });
  } catch (error) {
    console.error('NOR AI request failed:', error);
    return response.status(502).json({ error: 'NOR AI could not analyze this view. Please try again.' });
  }
});

export default app;
