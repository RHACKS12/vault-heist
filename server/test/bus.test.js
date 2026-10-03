import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { createEvent, SOURCES, EVENT_TYPES } from '../src/events.js';

test('publish emits to subscribers and returns the event', () => {
  const bus = new EventBus();
  const got = [];
  const unsub = bus.subscribe((e) => got.push(e));

  const ev = bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.PHASE_CHANGE, payload: { to: 'LOBBY' } }));
  assert.equal(got.length, 1);
  assert.equal(got[0], ev);

  unsub();
  bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.EXPLORING }));
  assert.equal(got.length, 1, 'an unsubscribed listener receives nothing further');
});

test('recent() is a bounded ring buffer (oldest dropped first)', () => {
  const bus = new EventBus({ bufferSize: 5 });
  for (let i = 0; i < 10; i++) {
    bus.publish(createEvent({ source: SOURCES.GAME, type: EVENT_TYPES.EXPLORING, payload: { i } }));
  }
  const recent = bus.recent(100);
  assert.equal(recent.length, 5);
  assert.equal(recent[0].payload.i, 5);
  assert.equal(recent[4].payload.i, 9);
});
