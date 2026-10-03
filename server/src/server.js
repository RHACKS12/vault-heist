// HTTP + WebSocket server: the fan-out layer, plus static hosting of the
// observer dashboard.
//
// The only job of the WebSocket side is to push the single event stream to every
// connected client. Nothing reaches a frontend except through the bus — that is
// what will later let a recorded run replay through the exact same path as a
// live one. A newcomer is seeded with recent events so it sees current state.
//
// The HTTP side serves:
//   GET  /health          -> JSON status
//   POST /api/demo/race    -> trigger a mock race (if an onDemoRace handler is wired)
//   GET  /*                -> static files from webRoot (the dashboard)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * @param {{bus, game?, sandbox?, port:number, webRoot?:string,
 *          onDemoRace?:()=>Promise<any>}} deps
 */
export function createServer({ bus, game, sandbox, port, webRoot, onDemoRace }) {
  const httpServer = http.createServer((req, res) => {
    // --- API ---
    if (req.url === '/health') {
      return sendJson(res, 200, {
        ok: true,
        phase: game?.phase ?? null,
        round: game?.round ?? null,
        rootfs: sandbox?.root ?? null,
        clients: wss.clients.size,
      });
    }
    if (req.method === 'POST' && req.url === '/api/demo/race') {
      if (!onDemoRace) return sendJson(res, 501, { ok: false, error: 'demo race not available' });
      Promise.resolve()
        .then(() => onDemoRace())
        .then((result) => sendJson(res, 200, { ok: true, ...result }))
        .catch((e) => sendJson(res, 409, { ok: false, error: e.message }));
      return;
    }
    // --- static dashboard ---
    if (req.method === 'GET' && webRoot) {
      return serveStatic(req, res, webRoot);
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    safeSend(ws, { type: 'hello', phase: game?.phase ?? null, round: game?.round ?? null, recent: bus.recent(80) });
    const unsubscribe = bus.subscribe((event) => safeSend(ws, event));
    ws.on('close', unsubscribe);
    ws.on('error', unsubscribe);
  });

  return {
    httpServer,
    wss,
    listen: () => new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: () => new Promise((resolve) => { wss.close(); httpServer.close(() => resolve()); }),
  };
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* client went away mid-send */ }
  }
}

async function serveStatic(req, res, webRoot) {
  // map the URL path to a file, clamped under webRoot (no traversal)
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = path.posix.normalize('/' + urlPath.replace(/^\/+/, '')).replace(/^\/+/, '');
  let filePath = path.join(webRoot, rel || 'index.html');
  if (!filePath.startsWith(path.resolve(webRoot))) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    let stat = await fsp.stat(filePath).catch(() => null);
    if (stat?.isDirectory()) { filePath = path.join(filePath, 'index.html'); stat = await fsp.stat(filePath).catch(() => null); }
    if (!stat) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error');
  }
}
