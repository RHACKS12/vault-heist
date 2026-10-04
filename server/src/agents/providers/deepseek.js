// DeepSeek provider adapter — STUB.
//
// Wired up in the next step with the OpenAI-compatible SDK pointed at DeepSeek:
//   - new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' }); model 'deepseek-chat'.
//   - Normalized `tools` -> OpenAI `tools:[{type:'function', function:{name,description,parameters}}]`.
//   - Normalized `messages` -> OpenAI chat messages; tool results as role:'tool'
//     messages keyed by tool_call_id.
//   - Return { thought, toolCalls:[{id,name,args}] } from the assistant message's
//     content + tool_calls (args = JSON.parse(arguments)).
//   - Include usage:{ inputTokens, outputTokens } (from response.usage:
//     prompt_tokens / completion_tokens) so the race cost cap can bill this step.
//
// Strategy for this crew member: walk the filesystem.
import { NotWiredError } from './not-wired.js';

export function createDeepSeekProvider({ apiKey = process.env.DEEPSEEK_API_KEY, model = 'deepseek-chat' } = {}) {
  return {
    name: 'deepseek',
    model,
    async step() {
      throw new NotWiredError('deepseek', 'DEEPSEEK_API_KEY', 'openai (baseURL=https://api.deepseek.com)');
    },
    _hasKey: Boolean(apiKey),
  };
}
