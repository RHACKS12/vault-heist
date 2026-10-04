// The join QR on the big screen: where phones should go, drawn as one SVG path.
import qrcode from '/vendor/qrcode.mjs';

const LOOPBACK = /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/;

/**
 * The player-screen URL a phone in the room can open. `?join=<base url>` on the
 * dashboard overrides everything. A dashboard opened on localhost asks the
 * server for its LAN address (or PUBLIC_URL), since phones can't reach
 * localhost. `reachable` is false when we could only fall back to loopback.
 * @returns {Promise<{url:string, reachable:boolean}>}
 */
export async function resolveJoinUrl() {
  const override = new URLSearchParams(location.search).get('join');
  if (override) return { url: `${override.replace(/\/+$/, '')}/play.html`, reachable: true };
  if (!LOOPBACK.test(location.hostname)) return { url: `${location.origin}/play.html`, reachable: true };
  try {
    const state = await (await fetch('/api/state')).json();
    if (state.joinUrls?.length) return { url: `${state.joinUrls[0]}/play.html`, reachable: true };
  } catch { /* server unreachable: fall through */ }
  return { url: `${location.origin}/play.html`, reachable: false };
}

/** An SVG QR code for `text`; colour it with CSS `fill`. */
export function qrSvg(text, label = 'QR code') {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  }
  const safe = label.replace(/[<&"]/g, '');
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="${safe}"><path d="${d}"/></svg>`;
}

/** Strip the scheme for display: "192.168.1.4:3000/play.html". */
export const prettyUrl = (url) => url.replace(/^https?:\/\//, '');
