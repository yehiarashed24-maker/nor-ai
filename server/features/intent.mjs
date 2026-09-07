export async function detectIntent(_ai, _apiKey, question, context, _language = 'ar') {
  if (!question || !question.trim()) {
    return { intent: 'UNKNOWN', needsNewFrame: true };
  }

  // Intent selection used to make a separate Gemini request before every
  // answer. A local router removes that entire round trip (usually 5–10 s).
  const value = question.trim().toLowerCase();
  const has = (pattern) => pattern.test(value);
  const documentFollowUp = Boolean(context?.extractedText) && has(/المبلغ|الإجمالي|التاريخ|لخص|الورقة|الفاتورة|الإيصال|total|date|summari[sz]e|receipt|invoice/);
  if (documentFollowUp) return { intent: 'DOCUMENT', needsNewFrame: false };
  if (has(/ساعدني بحد|اتصل|كلم|مساعدة بشرية|call|contact|human help/)) return { intent: 'HUMAN_ASSIST', needsNewFrame: true };
  if (has(/افتكر|احفظ|ذكرني|memory|remember|save this/)) return { intent: 'MEMORY', needsNewFrame: true };
  if (has(/جنيه|فلوس|عملة|ورقة.*كام|denomination|money|cash|currency/)) return { intent: 'MONEY', needsNewFrame: true };
  if (has(/فاتورة|إيصال|مستند|ورقة|اقرأ|نص|receipt|invoice|document|read (this|the) (paper|text)/)) return { intent: 'DOCUMENT', needsNewFrame: true };
  if (has(/عبوة|منتج|صلاحية|مكونات|بيبسي|product|expiry|expiration|ingredients|package/)) return { intent: 'PRODUCT', needsNewFrame: true };
  if (has(/لابس|لبس|لون|لايق|outfit|wearing|match|color/)) return { intent: 'OUTFIT', needsNewFrame: true };
  if (has(/زحمة|ناس كتير|crowd|busy|how many people/)) return { intent: 'CROWD', needsNewFrame: true };
  if (has(/يمين|شمال|فين|مكان|قدامي|right|left|where is|find/)) return { intent: 'DIRECTION', needsNewFrame: true };
  if (has(/خطوة|اعمل إيه|ساعدني أ|how do i|step by step/)) return { intent: 'TASK', needsNewFrame: true };
  if (has(/شخص|وش|واقف|people|person|face/)) return { intent: 'SOCIAL', needsNewFrame: true };
  return { intent: 'SCENE', needsNewFrame: true };
}
