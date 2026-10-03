// HTTP + WebSocket server: the fan-out layer, command API, and static hosting.
//
// WebSocket: push the single event stream to every connected client (newcomers
// get a `hello` seed of recent events). Nothing reaches a frontend except
// through the bus — the same path a recorded run will replay through.
//
// HTTP:
//   GET  /health              -> JSON status
//   <routes>                  -> command handlers (join / bet / host / demo), JSON in/out
//   GET  /*                   -> static files from webRoot (dashboard + player screen)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

/**
 * @param {{bus, game?, sandbox?, betting?, port:number, webRoot?:string,
 *          routes?:Record<string,(body:object)=>Promise<object>>}} deps
 *   routes are keyed "METHOD /path"; a handler returns a JSON-able object or
 *   throws (optionally with `.status`) to produce an error response.
 */
export function createServer({ bus, game, sandbox, betting, port, webRoot, routes = {} }) {
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const key = `${req.method} ${url.pathname}`;

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true, phase: game?.phase ?? null, round: game?.round ?? null,
        rootfs: sandbox?.root ?? null, clients: wss.clients.size,
        betting: betting?.snapshot?.() ?? null,
      });
    }

    if (routes[key]) {
      let body = {};
      try { body = await readJson(req); } catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
      try {
        const result = await routes[key](body);
        return sendJson(res, 200, { ok: true, ...result });
      } catch (e) {
        return sendJson(res, e.status ?? 400, { ok: false, error: e.message });
      }
    }

    if (req.method === 'GET' && webRoot) return serveStatic(req, res, webRoot);

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    safeSend(ws, { type: 'hello', phase: game?.phase ?? null, round: game?.round ?? null, recent: bus.recent(120) });
    const unsubscribe = bus.subscribe((event) => safeSend(ws, event));
    ws.on('close', unsubscribe);
    ws.on('error', unsubscribe);
  });

  return {
    httpServer, wss,
    listen: () => new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: () => new Promise((resolve) => { wss.close(); httpServer.close(() => resolve()); }),
  };
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* client went away mid-send */ }
  }
}

async function serveStatic(req, res, webRoot) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = path.posix.normalize('/' + urlPath.replace(/^\/+/, '')).replace(/^\/+/, '');
  let filePath = path.join(webRoot, rel || 'index.html');
  if (!filePath.startsWith(path.resolve(webRoot))) { res.writeHead(403); return res.end('Forbidden'); }
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
