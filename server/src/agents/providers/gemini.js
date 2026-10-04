// Gemini Flash provider adapter — STUB.
//
// Wired up in the next step (real-provider wiring) with the @google/genai SDK.
// Intended mapping:
//   - new GoogleGenAI({ apiKey }); model: a Flash model id (confirm current id).
//   - Translate normalized `tools` -> functionDeclarations; our JSON-Schema
//     `parameters` map onto Gemini's function parameter schema.
//   - Translate normalized `messages` -> contents[], with tool results sent back
//     as functionResponse parts.
//   - Return { thought, toolCalls:[{id,name,args}] } or {} when the model stops.
//   - Include usage:{ inputTokens, outputTokens } from the response so the race
//     cost cap can bill this step (see cost.js / pricing.js). Without it, this
//     agent's spend is invisible to the cap.
//
// Strategy for this crew member: grep strings first. Also feeds "Best Use of Gemini".
import { NotWiredError } from './not-wired.js';

export function createGeminiProvider({ apiKey = process.env.GEMINI_API_KEY, model = 'gemini-2.5-flash' } = {}) {
  return {
    name: 'gemini',
    model,
    async step() {
      throw new NotWiredError('gemini', 'GEMINI_API_KEY', '@google/genai');
    },
    _hasKey: Boolean(apiKey),
  };
}
