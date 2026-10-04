// Gemini Flash provider adapter (@google/genai).
//
// One step of the tool-use loop: translate the normalized history + tool schemas
// into Gemini's `contents` + `functionDeclarations`, call generateContent once,
// and translate the reply back into { thought?, toolCalls?, usage }.
//
// Gemini has no tool-call ids and matches function responses by NAME, so we
// synthesize ids for the runner's bookkeeping and translate tool results back by
// name. Strategy for this crew member: grep for suspicious strings first.
import { GoogleGenAI } from '@google/genai';

const MAX_TOKENS = 1024;

/** Split the normalized history into Gemini contents[] + a systemInstruction. */
export function toGeminiRequest(messages) {
  let systemInstruction = '';
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') { systemInstruction = [systemInstruction, m.text].filter(Boolean).join('\n'); continue; }
    if (m.role === 'user') { contents.push({ role: 'user', parts: [{ text: m.text ?? '' }] }); continue; }
    if (m.role === 'tool') {
      contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: asObject(m.result) } }] });
      continue;
    }
    // assistant
    const parts = [];
    if (m.text) parts.push({ text: m.text });
    for (const tc of m.toolCalls ?? []) {
      // Gemini 3.x requires the thoughtSignature from the original response to be
      // echoed back on the functionCall part, or the next turn 400s.
      const part = { functionCall: { name: tc.name, args: tc.args ?? {} } };
      if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
      parts.push(part);
    }
    contents.push({ role: 'model', parts });
  }
  return { systemInstruction, contents };
}

/** Our tool defs -> Gemini functionDeclarations. */
export function toGeminiFunctionDeclarations(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

/** A Gemini response -> normalized step. */
export function fromGeminiResponse(resp) {
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  const usage = {
    inputTokens: resp?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: resp?.usageMetadata?.candidatesTokenCount ?? 0,
  };
  let thought = '';
  const toolCalls = [];
  for (const p of parts) {
    if (p.text) thought += p.text;
    if (p.functionCall) {
      toolCalls.push({
        id: `${p.functionCall.name}-${toolCalls.length}`,
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
        thoughtSignature: p.thoughtSignature, // round-trip on the next turn (Gemini 3.x requirement)
      });
    }
  }
  return { thought, toolCalls, usage };
}

export function createGeminiProvider({ apiKey = process.env.GEMINI_API_KEY, model = 'gemini-3.8-flash', client } = {}) {
  const sdk = client ?? (apiKey ? new GoogleGenAI({ apiKey }) : null);
  return {
    name: 'gemini',
    model,
    _hasKey: Boolean(apiKey) || Boolean(client),
    async step({ messages, tools }) {
      if (!sdk) throw new Error('gemini: no API key configured');
      const { systemInstruction, contents } = toGeminiRequest(messages);
      const resp = await sdk.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: MAX_TOKENS,
          tools: [{ functionDeclarations: toGeminiFunctionDeclarations(tools) }],
        },
      });
      return fromGeminiResponse(resp);
    },
  };
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : { result: v };
}
