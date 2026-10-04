// OpenAI-compatible provider core — one step of the tool-use loop against any
// Chat Completions API (OpenAI itself, or DeepSeek via a baseURL override).
//
// The AgentRunner owns the loop; this adapter does ONE request per step: it
// translates the normalized message history + tool schemas into the Chat
// Completions shape, calls the API once, and translates the reply back into
// { thought?, toolCalls?, refused?, usage }.
import OpenAI from 'openai';

const MAX_TOKENS = 1024; // tool calls + a sentence of reasoning; not long prose

/** Normalized messages -> OpenAI chat messages. */
export function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'system') return { role: 'system', content: m.text ?? '' };
    if (m.role === 'user') return { role: 'user', content: m.text ?? '' };
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: jsonify(m.result) };
    }
    // assistant
    const msg = { role: 'assistant', content: m.text ?? '' };
    if (m.toolCalls?.length) {
      msg.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
      }));
      if (!m.text) msg.content = null; // OpenAI wants null content when only tool calls
    }
    return msg;
  });
}

/** Our JSON-Schema tool defs -> OpenAI function tools. */
export function toOpenAITools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** An OpenAI chat completion -> normalized step. */
export function fromOpenAIResponse(resp) {
  const choice = resp?.choices?.[0];
  const message = choice?.message ?? {};
  const usage = {
    inputTokens: resp?.usage?.prompt_tokens ?? 0,
    outputTokens: resp?.usage?.completion_tokens ?? 0,
  };
  if (message.refusal) return { refused: { reason: message.refusal }, usage };

  const toolCalls = (message.tool_calls ?? [])
    .filter((tc) => tc.type === 'function')
    .map((tc) => ({ id: tc.id, name: tc.function.name, args: safeParse(tc.function.arguments) }));

  return { thought: message.content ?? '', toolCalls, usage };
}

/**
 * Build an OpenAI-compatible provider. Pass `baseURL` for a compatible API
 * (e.g. DeepSeek). `client` can be injected for tests.
 */
export function createOpenAICompatibleProvider({ name, apiKey, model, baseURL, client } = {}) {
  const sdk = client ?? (apiKey ? new OpenAI(baseURL ? { apiKey, baseURL } : { apiKey }) : null);
  return {
    name,
    model,
    _hasKey: Boolean(apiKey) || Boolean(client),
    async step({ messages, tools }) {
      if (!sdk) throw new Error(`${name}: no API key configured`);
      const resp = await sdk.chat.completions.create({
        model,
        max_tokens: MAX_TOKENS,
        tool_choice: 'auto',
        tools: toOpenAITools(tools),
        messages: toOpenAIMessages(messages),
      });
      return fromOpenAIResponse(resp);
    },
  };
}

function jsonify(v) {
  return typeof v === 'string' ? v : JSON.stringify(v ?? {});
}
function safeParse(s) {
  try { return typeof s === 'string' ? JSON.parse(s) : (s ?? {}); } catch { return {}; }
}
