// OpenAI (ChatGPT) provider adapter.
//
// Thin wrapper over the shared OpenAI-compatible core. Strategy for this crew
// member: walk the filesystem directory by directory.
import { createOpenAICompatibleProvider } from './openai-compatible.js';

export function createOpenAIProvider({ apiKey = process.env.OPENAI_API_KEY, model = 'gpt-4o-mini', client } = {}) {
  return createOpenAICompatibleProvider({ name: 'openai', apiKey, model, client });
}
