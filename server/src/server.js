// HTTP + WebSocket server: the fan-out layer.
//
// The only job here is to push the single event stream to every connected
// client. Nothing reaches a frontend except through the bus — that is what
// will later let a recorded run replay through the exact same path as a live
// one. A newcomer is seeded with recent events so it sees current state.
import http from 'node:http';
import { WebSocketServer } from 'ws';

/**
 * @param {{bus:import('./bus.js').EventBus, game?:import('./game.js').Game, sandbox?:{root:string}, port:number}} deps
 */
export function createServer({ bus, game, sandbox, port }) {
  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        phase: game?.phase ?? null,
        round: game?.round ?? null,
        rootfs: sandbox?.root ?? null,
        clients: wss.clients.size,
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    // seed the newcomer with current phase + recent events
    safeSend(ws, {
      type: 'hello',
      phase: game?.phase ?? null,
      round: game?.round ?? null,
      recent: bus.recent(50),
    });
    const unsubscribe = bus.subscribe((event) => safeSend(ws, event));
    ws.on('close', unsubscribe);
    ws.on('error', unsubscribe);
  });

  return {
    httpServer,
    wss,
    listen: () => new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: () => new Promise((resolve) => {
      wss.close();
      httpServer.close(() => resolve());
    }),
  };
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* client went away mid-send */ }
  }
}
