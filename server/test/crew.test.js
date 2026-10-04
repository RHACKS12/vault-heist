// The crew roster: OpenAI replaced DeepSeek, and buildRealCrew only includes
// agents whose API key is set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREW, buildRealCrew, configuredAgents } from '../src/agents/crew.js';

test('the roster is gemini + openai + haiku (no deepseek)', () => {
  const agents = CREW.map((m) => m.agent);
  assert.deepEqual(agents, ['gemini', 'openai', 'haiku']);
  const openai = CREW.find((m) => m.agent === 'openai');
  assert.equal(openai.model, 'gpt-4o-mini');
  assert.equal(openai.env, 'OPENAI_API_KEY');
});

test('buildRealCrew includes only agents with a key set', () => {
  const saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';

    const crew = buildRealCrew();
    assert.deepEqual(crew.map((m) => m.agent), ['openai']);
    assert.equal(crew[0].provider.model, 'gpt-4o-mini');
    assert.ok(configuredAgents().includes('openai'));
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
