export async function detectIntent(ai, apiKey, question, context, language = 'ar') {
  if (!question || !question.trim()) {
    return { intent: 'UNKNOWN', needsNewFrame: true };
  }

  const systemInstruction = `You are the Intent Router for NOR AI, a visual assistant.
Analyze the user's question to determine the required capability.
Choose EXACTLY ONE intent from this list:
SCENE (general view description, looking around)
READ_TEXT (finding or reading general text in the scene)
SOCIAL (reading faces, social cues, posture, but NOT identifying specific people)
CROWD (describing a crowd or busy area)
DIRECTION (finding objects and giving relative directions)
TASK (step-by-step guidance for a physical task)
MEMORY (recalling a saved memory)
MONEY (recognizing currency, counting money, asking "how much is this note")
OUTFIT (describing clothing, colors, matching, orientation)
PRODUCT (identifying a packaged product, reading expiry date, ingredients, size)
DOCUMENT (reading, summarizing, or extracting info from a document like a receipt, invoice, letter, paper)
HUMAN_ASSIST (asking to talk to a human, call someone, or get help from a person)
UNKNOWN (fallback if none apply)

Respond with ONLY valid JSON using this schema:
{
  "intent": "string",
  "needsNewFrame": "boolean"
}

Rule for needsNewFrame:
It should ALWAYS be true, EXCEPT when the intent is DOCUMENT AND the user is asking a follow-up question about the CURRENT document that can be answered from the extractedText in the provided context, without needing to see the paper again.

Examples:
"دي كام؟" -> MONEY
"دول لايقين على بعض؟" -> OUTFIT
"دي عبوة إيه؟" -> PRODUCT
"اقرأ الورقة دي" -> DOCUMENT
"لخص المستند ده" -> DOCUMENT
"المبلغ كام؟" (if context has document) -> DOCUMENT (needsNewFrame: false)
"ساعدني بحد" -> HUMAN_ASSIST`;

  const promptText = `Context: ${JSON.stringify(context || {})}
User Question: ${question.trim()}`;

  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
  ].filter(Boolean);

  let result;
  for (const model of candidateModels) {
    try {
      result = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
      if (result?.text?.trim()) break;
    } catch (err) {
      console.warn(`Intent model ${model} failed, trying next...`);
    }
  }

  if (!result?.text?.trim()) {
    return { intent: 'UNKNOWN', needsNewFrame: true };
  }

  try {
    const parsed = JSON.parse(result.text.trim());
    return {
      intent: parsed.intent || 'UNKNOWN',
      needsNewFrame: typeof parsed.needsNewFrame === 'boolean' ? parsed.needsNewFrame : true,
    };
  } catch {
    return { intent: 'UNKNOWN', needsNewFrame: true };
  }
}
