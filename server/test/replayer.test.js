import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Recorder } from '../src/recorder.js';
import { Replayer, listRecordings } from '../src/replayer.js';
import { createEvent, SOURCES, EVENT_TYPES, PHASES } from '../src/events.js';

const sampleEvents = () => ([
  createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.PHASE_CHANGE, payload: { to: 'RACING' } }),
  createEvent({ source: SOURCES.AGENT, agent: 'openai', type: EVENT_TYPES.OPENED_FILE }),
  createEvent({ source: SOURCES.AGENT, agent: 'openai', type: EVENT_TYPES.WON }),
]);

test('replay re-emits events in order (fast, no reset)', async () => {
  const bus = new EventBus();
  const seen = [];
  bus.subscribe((e) => seen.push(e.type));
  const replayer = new Replayer({ bus });
  const r = await replayer.play(sampleEvents(), { minGapMs: 0, maxGapMs: 0, resetFirst: false });
  assert.equal(r.played, 3);
  assert.deepEqual(seen, [EVENT_TYPES.PHASE_CHANGE, EVENT_TYPES.OPENED_FILE, EVENT_TYPES.WON]);
});

test('resetFirst prepends a LOBBY phase_change so clients start clean', async () => {
  const bus = new EventBus();
  const seen = [];
  bus.subscribe((e) => seen.push(e));
  const replayer = new Replayer({ bus });
  await replayer.play(sampleEvents(), { minGapMs: 0, maxGapMs: 0, resetFirst: true });
  assert.equal(seen[0].type, EVENT_TYPES.PHASE_CHANGE);
  assert.equal(seen[0].payload.to, PHASES.LOBBY);
  assert.equal(seen.length, 4); // 1 reset + 3 events
});

test('replayed events are tagged replay:true', async () => {
  const bus = new EventBus();
  const seen = [];
  bus.subscribe((e) => seen.push(e));
  const replayer = new Replayer({ bus });
  await replayer.play(sampleEvents(), { minGapMs: 0, maxGapMs: 0, resetFirst: false });
  assert.ok(seen.every((e) => e.replay === true));
});

test('stop() halts replay partway', async () => {
  const bus = new EventBus();
  const seen = [];
  bus.subscribe((e) => seen.push(e));
  const replayer = new Replayer({ bus });
  const p = replayer.play(sampleEvents(), { minGapMs: 50, maxGapMs: 50, resetFirst: false });
  replayer.stop();
  const r = await p;
  assert.ok(r.played < 3);
});

test('record then replay round-trips the same event types', async () => {
  const bus = new EventBus();
  const rec = new Recorder({ bus });
  rec.start('rt');
  for (const e of sampleEvents()) bus.publish(e);
  const recorded = rec.stop().events;

  const bus2 = new EventBus();
  const seen = [];
  bus2.subscribe((e) => seen.push(e.type));
  await new Replayer({ bus: bus2 }).play(recorded, { minGapMs: 0, maxGapMs: 0, resetFirst: false });
  assert.deepEqual(seen, recorded.map((e) => e.type));
});

test('parse ignores blank lines', () => {
  const evs = Replayer.parse('{"type":"a"}\n\n  \n{"type":"b"}\n');
  assert.equal(evs.length, 2);
});
