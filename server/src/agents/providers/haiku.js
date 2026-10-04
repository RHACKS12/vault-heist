// Haiku (Anthropic) provider adapter — STUB.
//
// Wired up in the next step with @anthropic-ai/sdk. Before implementing, read the
// claude-api skill to confirm the current model id, tool-use request/response
// shape, and streaming. Intended mapping:
//   - new Anthropic({ apiKey }); model: a Haiku id (e.g. claude-haiku-4-5-*).
//   - Normalized `tools` -> Anthropic tools:[{name,description,input_schema}].
//   - Normalized `messages` -> Anthropic messages; tool results as
//     role:'user' content blocks {type:'tool_result', tool_use_id, content}.
//   - Parse response content blocks: text -> thought, tool_use -> toolCalls.
//   - Include usage:{ inputTokens, outputTokens } (from response.usage:
//     input_tokens / output_tokens) so the race cost cap can bill this step.
//
// Strategy for this crew member: inspect binaries first. Optional / swappable.
import { NotWiredError } from './not-wired.js';

export function createHaikuProvider({ apiKey = process.env.ANTHROPIC_API_KEY, model = 'claude-haiku-4-5-20251001' } = {}) {
  return {
    name: 'haiku',
    model,
    async step() {
      throw new NotWiredError('haiku', 'ANTHROPIC_API_KEY', '@anthropic-ai/sdk');
    },
    _hasKey: Boolean(apiKey),
  };
}
