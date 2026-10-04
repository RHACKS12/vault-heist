// Unit tests for the real provider adapters: the pure message/tool translation
// and response parsing, plus one end-to-end step() per provider driven by an
// injected fake SDK client (no network, no API keys).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toOpenAIMessages, toOpenAITools, fromOpenAIResponse,
} from '../src/agents/providers/openai-compatible.js';
import { createOpenAIProvider } from '../src/agents/providers/openai.js';
import {
  toGeminiRequest, toGeminiFunctionDeclarations, fromGeminiResponse, createGeminiProvider,
} from '../src/agents/providers/gemini.js';
import {
  toAnthropicRequest, toAnthropicTools, fromAnthropicResponse, createHaikuProvider,
} from '../src/agents/providers/haiku.js';
import { ALL_TOOLS } from '../src/agents/tools.js';

// A representative normalized history: system, user, an assistant tool call, and
// the tool result that came back.
const history = [
  { role: 'system', text: 'You are an auditor.' },
  { role: 'user', text: 'Find the vuln.' },
  { role: 'assistant', text: 'Looking.', toolCalls: [{ id: 'c1', name: 'list_dir', args: { path: '/etc' } }] },
  { role: 'tool', toolCallId: 'c1', name: 'list_dir', result: { path: '/etc', entries: [] } },
];

// --- OpenAI ---------------------------------------------------------------

test('openai: message + tool translation', () => {
  const msgs = toOpenAIMessages(history);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[2].role, 'assistant');
  assert.equal(msgs[2].tool_calls[0].function.name, 'list_dir');
  assert.equal(JSON.parse(msgs[2].tool_calls[0].function.arguments).path, '/etc');
  assert.equal(msgs[3].role, 'tool');
  assert.equal(msgs[3].tool_call_id, 'c1');

  const tools = toOpenAITools(ALL_TOOLS);
  assert.equal(tools[0].type, 'function');
  assert.ok(tools.some((t) => t.function.name === 'submit'));
});

test('openai: response parsing (tool call + usage)', () => {
  const step = fromOpenAIResponse({
    choices: [{ message: { content: 'ok', tool_calls: [{ id: 'x', type: 'function', function: { name: 'grep', arguments: '{"pattern":"root"}' } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });
  assert.equal(step.thought, 'ok');
  assert.equal(step.toolCalls[0].name, 'grep');
  assert.equal(step.toolCalls[0].args.pattern, 'root');
  assert.deepEqual(step.usage, { inputTokens: 100, outputTokens: 20 });
});

test('openai: refusal is surfaced', () => {
  const step = fromOpenAIResponse({ choices: [{ message: { refusal: 'no' } }], usage: {} });
  assert.equal(step.refused.reason, 'no');
});

test('openai: step() via injected client', async () => {
  let seen;
  const fake = { chat: { completions: { create: async (req) => { seen = req; return {
    choices: [{ message: { content: 'done', tool_calls: [] } }], usage: { prompt_tokens: 5, completion_tokens: 2 },
  }; } } } };
  const provider = createOpenAIProvider({ client: fake, model: 'gpt-4o-mini' });
  const step = await provider.step({ messages: history, tools: ALL_TOOLS });
  assert.equal(seen.model, 'gpt-4o-mini');
  assert.equal(step.thought, 'done');
  assert.equal(step.usage.inputTokens, 5);
});

// --- Gemini ---------------------------------------------------------------

test('gemini: request translation (system split out, functionResponse)', () => {
  const { systemInstruction, contents } = toGeminiRequest(history);
  assert.match(systemInstruction, /auditor/);
  assert.equal(contents[0].role, 'user');
  assert.equal(contents[1].role, 'model');
  assert.equal(contents[1].parts.find((p) => p.functionCall).functionCall.name, 'list_dir');
  const fr = contents[2].parts[0].functionResponse;
  assert.equal(fr.name, 'list_dir');
  assert.equal(fr.response.path, '/etc');

  const decls = toGeminiFunctionDeclarations(ALL_TOOLS);
  assert.ok(decls.some((d) => d.name === 'read_file'));
});

test('gemini: response parsing (functionCall + usage)', () => {
  const step = fromGeminiResponse({
    candidates: [{ content: { parts: [{ text: 'hmm' }, { functionCall: { name: 'strings', args: { path: '/bin/x' } } }] } }],
    usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8 },
  });
  assert.equal(step.thought, 'hmm');
  assert.equal(step.toolCalls[0].name, 'strings');
  assert.equal(step.toolCalls[0].args.path, '/bin/x');
  assert.deepEqual(step.usage, { inputTokens: 50, outputTokens: 8 });
});

test('gemini: step() via injected client', async () => {
  let seen;
  const fake = { models: { generateContent: async (req) => { seen = req; return {
    candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
  }; } } };
  const provider = createGeminiProvider({ client: fake, model: 'gemini-2.5-flash' });
  const step = await provider.step({ messages: history, tools: ALL_TOOLS });
  assert.equal(seen.model, 'gemini-2.5-flash');
  assert.ok(seen.config.tools[0].functionDeclarations.length > 0);
  assert.equal(step.thought, 'ok');
});

// --- Anthropic / Haiku ----------------------------------------------------

test('haiku: request translation (system, tool_use, coalesced tool_result)', () => {
  // two tool results in a row should coalesce into one user message
  const parallel = [
    { role: 'system', text: 'sys' },
    { role: 'assistant', text: '', toolCalls: [{ id: 'a', name: 'grep', args: {} }, { id: 'b', name: 'strings', args: {} }] },
    { role: 'tool', toolCallId: 'a', name: 'grep', result: { hits: [] } },
    { role: 'tool', toolCallId: 'b', name: 'strings', result: { lines: [] } },
  ];
  const { system, messages } = toAnthropicRequest(parallel);
  assert.equal(system, 'sys');
  const assistant = messages[0];
  assert.equal(assistant.content[0].type, 'tool_use');
  const toolMsg = messages[1];
  assert.equal(toolMsg.role, 'user');
  assert.equal(toolMsg.content.length, 2, 'both tool_results coalesced into one user message');
  assert.equal(toolMsg.content[0].type, 'tool_result');

  const tools = toAnthropicTools(ALL_TOOLS);
  assert.ok(tools[0].input_schema);
});

test('haiku: response parsing (text + tool_use + usage)', () => {
  const step = fromAnthropicResponse({
    content: [{ type: 'text', text: 'reading' }, { type: 'tool_use', id: 'z', name: 'read_file', input: { path: '/etc/shadow' } }],
    usage: { input_tokens: 200, output_tokens: 30 },
  });
  assert.equal(step.thought, 'reading');
  assert.equal(step.toolCalls[0].name, 'read_file');
  assert.equal(step.toolCalls[0].args.path, '/etc/shadow');
  assert.deepEqual(step.usage, { inputTokens: 200, outputTokens: 30 });
});

test('haiku: refusal stop_reason is surfaced', () => {
  const step = fromAnthropicResponse({ content: [], stop_reason: 'refusal', stop_details: { explanation: 'cyber' }, usage: {} });
  assert.equal(step.refused.reason, 'cyber');
});

test('haiku: step() via injected client', async () => {
  let seen;
  const fake = { messages: { create: async (req) => { seen = req; return {
    content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 4 },
  }; } } };
  const provider = createHaikuProvider({ client: fake, model: 'claude-haiku-4-5' });
  const step = await provider.step({ messages: history, tools: ALL_TOOLS });
  assert.equal(seen.model, 'claude-haiku-4-5');
  assert.equal(seen.system, 'You are an auditor.');
  assert.equal(step.usage.outputTokens, 4);
});
