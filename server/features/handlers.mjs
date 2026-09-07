import { getFeaturePrompt } from './prompts.mjs';

export async function processIntent(ai, intent, needsNewFrame, question, audioMatch, imageMatch, memories, context, language = 'ar') {
  const answerLanguage = language === 'en'
    ? 'clear, natural English'
    : 'clear, natural Egyptian Arabic written entirely in Arabic script';

  const systemInstruction = getFeaturePrompt(intent, answerLanguage, language);

  let safeMemories = Array.isArray(memories)
    ? memories.filter((item) => typeof item === 'string').slice(-12).map((item) => item.slice(0, 300))
    : [];

  // Add extracted document text to the prompt if we are in a follow-up document session
  let contextText = '';
  if (intent === 'DOCUMENT' && context?.extractedText) {
    contextText = `\n[Extracted Document Text from Context]:\n${context.extractedText}\n`;
  }
  
  if (intent === 'HUMAN_ASSIST' && question.trim().match(/^(أيوه|ايوه|نعم|yes|yeah|yep)$/i)) {
      // Direct confirm phone action without needing AI if it's a direct confirmation
      if (context?.lastIntent === 'HUMAN_ASSIST') {
        return {
          answer: language === 'ar' ? 'جاري الاتصال بجهة الاتصال...' : 'Calling your trusted contact...',
          action: { type: 'CALL', target: 'trusted_contact' },
          intent: 'HUMAN_ASSIST'
        };
      }
  }

  const promptText = `User memory:\n${safeMemories.length ? safeMemories.join('\n') : '(none)'}\n${contextText}\nUser request: ${question.trim() || 'Listen to the audio'}`;
  
  const parts = [{ text: promptText }];
  
  if (audioMatch) {
    let mime = audioMatch[1];
    if (mime === 'audio/mp4') mime = 'video/mp4';
    parts.push({ inlineData: { mimeType: mime, data: audioMatch[2] } });
  }

  if (needsNewFrame && imageMatch) {
    parts.push({ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } });
  }

  const candidateModels = [
    // Lite is noticeably faster for short, spoken assistance responses.
    process.env.GEMINI_FAST_MODEL || 'gemini-3.1-flash-lite',
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
  ].filter(Boolean).filter((model, index, models) => models.indexOf(model) === index);

  let result;
  let lastError;
  for (const model of candidateModels) {
    try {
      result = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
        },
      });
      if (result?.text?.trim()) break;
    } catch (err) {
      lastError = err;
      console.warn(`Model ${model} failed for intent ${intent} (${err?.status || err?.message}), trying next...`);
    }
  }

  if (!result?.text?.trim()) {
    throw lastError || new Error('All candidate models failed to process intent.');
  }

  const raw = result.text.trim();
  const parsed = JSON.parse(raw);

  // Return standardized structured output
  return {
    intent,
    answer: String(parsed.answer || ''),
    memoryToSave: typeof parsed.newMemory === 'string' ? parsed.newMemory.slice(0, 300) : (typeof parsed.memoryToSave === 'string' ? parsed.memoryToSave.slice(0, 300) : null),
    transcript: typeof parsed.transcript === 'string' ? parsed.transcript.slice(0, 500) : question.trim().slice(0, 500),
    action: parsed.action || null,
    context: {
        ...(context || {}),
        lastIntent: intent,
        ...parsed.context // e.g. extractedText, productName, denomination
    }
  };
}
