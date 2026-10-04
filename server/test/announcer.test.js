import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Announcer } from '../src/announcer/announcer.js';
import { keyFor, lineFor, PRIORITY } from '../src/announcer/lines.js';
import { CATALOG, entryFor } from '../src/announcer/catalog.js';
import { createEvent, SOURCES, EVENT_TYPES, PHASES } from '../src/events.js';

// --- catalog ---

test('every catalog key is unique and every entry has text + priority', () => {
  const keys = new Set();
  for (const e of CATALOG) {
    assert.ok(!keys.has(e.key), `duplicate key ${e.key}`);
    keys.add(e.key);
    assert.ok(e.text && typeof e.text === 'string');
    assert.ok(typeof e.priority === 'number');
  }
  assert.equal(CATALOG.length, 17); // 5 phase/game + 4 milestones x 3 agents
});

// --- event -> key mapping (pure) ---

test('silent events map to no key', () => {
  assert.equal(keyFor({ type: EVENT_TYPES.EXPLORING, agent: 'gemini' }), null);
  assert.equal(keyFor({ type: EVENT_TYPES.REASONING_TOKEN, agent: 'gemini' }), null);
});

test('milestones and phases map to catalog keys', () => {
  assert.equal(keyFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.RACING } }), 'race_start');
  assert.equal(keyFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.BETTING_OPEN } }), 'bets_open');
  assert.equal(keyFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.BETS_LOCKED } }), 'bets_closed');
  assert.equal(keyFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.LOBBY } }), 'new_round');
  assert.equal(keyFor({ type: EVENT_TYPES.FOUND_DIR, agent: 'gemini', payload: { dir: '/etc' } }), 'found:gemini');
  assert.equal(keyFor({ type: EVENT_TYPES.WON, agent: 'deepseek' }), 'won:deepseek');
  // settled only speaks when nobody won
  assert.equal(keyFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.SETTLED, winner: 'gemini' } }), null);
  assert.equal(keyFor({ type: EVENT_TYPES.PHASE_CHANGE, payload: { to: PHASES.SETTLED, winner: null } }), 'no_crack');
});

test('lineFor returns the catalog entry; win line is high priority', () => {
  const win = lineFor({ type: EVENT_TYPES.WON, agent: 'deepseek' });
  assert.equal(win.key, 'won:deepseek');
  assert.match(win.text, /winner/i);
  assert.match(win.text, /DeepSeek/);
  assert.equal(win.priority, PRIORITY.WIN);
  assert.equal(lineFor({ type: EVENT_TYPES.EXPLORING, agent: 'gemini' }), null);
});

// --- announcer pipeline ---

function harness(clips) {
  const bus = new EventBus();
  const announces = [];
  bus.subscribe((e) => { if (e.type === EVENT_TYPES.ANNOUNCE) announces.push(e); });
  const announcer = new Announcer({ bus, clips }).start();
  return { bus, announces, announcer };
}
const tick = () => Promise.resolve().then(() => Promise.resolve());

test('a milestone produces one announce event with catalog text; clip null with no manifest', async () => {
  const { bus, announces } = harness();
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'gemini', type: EVENT_TYPES.FOUND_DIR, payload: { dir: '/etc' } }));
  await tick();
  assert.equal(announces.length, 1);
  assert.equal(announces[0].payload.key, 'found:gemini');
  assert.equal(announces[0].payload.text, entryFor('found:gemini').text);
  assert.equal(announces[0].payload.clip, null);
});

test('a pre-generated clip is attached from the manifest', async () => {
  const clips = new Map([['won:deepseek', '/announcer/won_deepseek.mp3']]);
  const { bus, announces } = harness(clips);
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'deepseek', type: EVENT_TYPES.WON }));
  await tick();
  assert.equal(announces[0].payload.clip, '/announcer/won_deepseek.mp3');
});

test('the announcer never announces its own announce events (no loop)', async () => {
  const { bus, announces } = harness();
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'haiku', type: EVENT_TYPES.WON }));
  await tick();
  assert.equal(announces.length, 1);
});

test('narrates replayed milestones too (derived layer)', async () => {
  const { bus, announces } = harness();
  bus.publish({ ...createEvent({ source: SOURCES.AGENT, agent: 'deepseek', type: EVENT_TYPES.OPENED_FILE }), replay: true });
  await tick();
  assert.equal(announces.length, 1);
});
