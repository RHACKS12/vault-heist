import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/bus.js';
import { Game } from '../src/game.js';
import { createServer } from '../src/server.js';
import { EVENT_TYPES } from '../src/events.js';

test('a WebSocket client is seeded with hello and then receives published events', async () => {
  const bus = new EventBus();
  const game = new Game({ bus });
  const server = createServer({ bus, game, sandbox: { root: '/x' }, port: 0 });
  const port = await server.listen();

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for phase_change')), 3000);
    ws.addEventListener('open', () => game.openBetting()); // publishes a phase_change
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      messages.push(msg);
      if (msg.type === EVENT_TYPES.PHASE_CHANGE) { clearTimeout(timer); resolve(); }
    });
    ws.addEventListener('error', (e) => { clearTimeout(timer); reject(e.error ?? new Error('ws error')); });
  });

  ws.close();
  await server.close();

  assert.equal(messages[0].type, 'hello', 'first frame is the hello seed');
  const phase = messages.find((m) => m.type === EVENT_TYPES.PHASE_CHANGE);
  assert.ok(phase, 'client should receive the phase_change');
  assert.equal(phase.payload.to, 'BETTING_OPEN');
});
