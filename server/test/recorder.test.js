import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventBus } from '../src/bus.js';
import { Recorder } from '../src/recorder.js';
import { createEvent, SOURCES, EVENT_TYPES } from '../src/events.js';

test('records events published while active, ignores before/after', () => {
  const bus = new EventBus();
  const rec = new Recorder({ bus });
  bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.EXPLORING })); // before
  rec.start('t');
  bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.PHASE_CHANGE, payload: { to: 'RACING' } }));
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'gemini', type: EVENT_TYPES.FOUND_DIR }));
  const r = rec.stop();
  bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.SETTLED })); // after
  assert.equal(r.count, 2);
  assert.equal(r.events[0].type, EVENT_TYPES.PHASE_CHANGE);
});

test('double start / stop-when-idle throw', () => {
  const bus = new EventBus();
  const rec = new Recorder({ bus });
  rec.start();
  assert.throws(() => rec.start(), /already recording/);
  rec.stop();
  assert.throws(() => rec.stop(), /not recording/);
});

test('save writes one JSON event per line', async () => {
  const bus = new EventBus();
  const rec = new Recorder({ bus });
  rec.start('save-test');
  bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.PHASE_CHANGE, payload: { to: 'LOBBY' } }));
  bus.publish(createEvent({ source: SOURCES.AGENT, agent: 'haiku', type: EVENT_TYPES.OPENED_FILE }));
  rec.stop();
  const dir = await mkdtemp(path.join(tmpdir(), 'vh-rec-'));
  try {
    const { file, count } = await rec.save(dir, 'run');
    assert.equal(count, 2);
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).type, EVENT_TYPES.PHASE_CHANGE);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
