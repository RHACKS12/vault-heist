import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Announcer } from '../src/announcer/announcer.js';
import { lineFor, PRIORITY } from '../src/announcer/lines.js';
import { createMockTTS } from '../src/announcer/providers/mock-tts.js';
import { createEvent, SOURCES, EVENT_TYPES, PHASES } from '../src/events.js';

// --- lines (pure) ---

test('only milestone/phase events get a line; tool noise is silent', () => {
  assert.equal(lineFor({ type: EVENT_TYPES.EXPLORING, agent: 'gemini' }), null);
  assert.equal(lineFor({ type: EVENT_TYPES.REASONING_TOKEN, agent: 'gemini', payload: { text: 'x' } }), null);
  assert.ok(lineFor({ type: EVENT_TYPES.FOUND_DIR, agent: 'gemini', payload: { dir: '/etc' } }));
});

test('fixed phase calls and the winner line have the right text/priority', () => {
  assert.match(lineFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.RACING } }).text, /off/i);
  const win = lineFor({ type: EVENT_TYPES.WON, agent: 'deepseek' });
  assert.match(win.text, /winner/i);
  assert.match(win.text, /DeepSeek/);
  assert.equal(win.priority, PRIORITY.WIN);
  const open = lineFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.BETTING_OPEN } });
  assert.equal(open.fixed, true);
});

test('settled with no winner gets a line; with a winner the won event carries it', () => {
  assert.ok(lineFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.SETTLED, winner: null } }));
  assert.equal(lineFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.SETTLED, winner: 'gemini' } }), null);
});

// --- announcer (pipeline) ---

function harness() {
  const bus = new EventBus();
  const announces = [];
  bus.subscribe((e) => { if (e.type === EVENT_TYPES.ANNOUNCE) announces.push(e); });
  const announcer = new Announcer({ bus, tts: createMockTTS() }).start();
  return { bus, announces, announcer };
}

test('a milestone event produces one announce event with text + priority', async () => {
  const { bus, announces } = harness();
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'gemini', type: EVENT_TYPES.FOUND_DIR, payload: { dir: '/etc' } }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(announces.length, 1);
  assert.equal(announces[0].source, SOURCES.ANNOUNCER);
  assert.match(announces[0].payload.text, /Gemini/);
  assert.equal(announces[0].payload.clip, null); // mock -> browser fallback
});

test('the announcer never announces its own announce events (no loop)', async () => {
  const { bus, announces } = harness();
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'haiku', type: EVENT_TYPES.WON }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(announces.length, 1); // exactly one, not a cascade
});

test('silent events produce no announce', async () => {
  const { bus, announces } = harness();
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'gemini', type: EVENT_TYPES.EXPLORING }));
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'gemini', type: EVENT_TYPES.REASONING_TOKEN, payload: { text: 'hmm' } }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(announces.length, 0);
});

test('narrates replayed milestones too (derived layer)', async () => {
  const { bus, announces } = harness();
  bus.publish({ ...createEvent({ source: SOURCES.AGENT, agent: 'deepseek', type: EVENT_TYPES.OPENED_FILE }), replay: true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(announces.length, 1);
});
