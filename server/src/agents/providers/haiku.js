// Haiku (Anthropic) provider adapter (@anthropic-ai/sdk).
//
// One step of the tool-use loop: translate the normalized history + tool schemas
// into Anthropic Messages shape, call messages.create once, and translate the
// reply back into { thought?, toolCalls?, refused?, usage }.
//
// No extended thinking (plain tool use on Haiku 4.5). Consecutive tool results
// are coalesced into a single user message, as the API requires all tool_result
// blocks for a turn to arrive together. Strategy: inspect binaries first.
import Anthropic from '@anthropic-ai/sdk';

const MAX_TOKENS = 1024;

/** Split the normalized history into a top-level system string + messages[]. */
export function toAnthropicRequest(messages) {
  let system = '';
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') { system = [system, m.text].filter(Boolean).join('\n'); continue; }
    if (m.role === 'user') { out.push({ role: 'user', content: m.text ?? '' }); continue; }
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: jsonify(m.result) };
      const prev = out[out.length - 1];
      // coalesce a run of tool results into one user message
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && prev.content[0]?.type === 'tool_result') {
        prev.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
    // assistant
    const content = [];
    if (m.text) content.push({ type: 'text', text: m.text });
    for (const tc of m.toolCalls ?? []) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} });
    out.push({ role: 'assistant', content });
  }
  return { system, messages: out };
}

/** Our tool defs -> Anthropic tools. */
export function toAnthropicTools(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

/** An Anthropic message response -> normalized step. */
export function fromAnthropicResponse(resp) {
  const usage = {
    inputTokens: resp?.usage?.input_tokens ?? 0,
    outputTokens: resp?.usage?.output_tokens ?? 0,
  };
  if (resp?.stop_reason === 'refusal') {
    return { refused: { reason: resp?.stop_details?.explanation ?? 'refused' }, usage };
  }
  let thought = '';
  const toolCalls = [];
  for (const block of resp?.content ?? []) {
    if (block.type === 'text') thought += block.text;
    if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input ?? {} });
  }
  return { thought, toolCalls, usage };
}

export function createHaikuProvider({ apiKey = process.env.ANTHROPIC_API_KEY, model = 'claude-haiku-4-5', client } = {}) {
  const sdk = client ?? (apiKey ? new Anthropic({ apiKey }) : null);
  return {
    name: 'haiku',
    model,
    _hasKey: Boolean(apiKey) || Boolean(client),
    async step({ messages, tools }) {
      if (!sdk) throw new Error('haiku: no API key configured');
      const { system, messages: msgs } = toAnthropicRequest(messages);
      const resp = await sdk.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: toAnthropicTools(tools),
        messages: msgs,
      });
      return fromAnthropicResponse(resp);
    },
  };
}

function jsonify(v) {
  return typeof v === 'string' ? v : JSON.stringify(v ?? {});
}
