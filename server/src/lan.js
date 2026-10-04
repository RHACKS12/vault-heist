// Join-URL discovery for the QR code on the big screen. The projector usually
// shows the dashboard at http://localhost, which no phone can reach, so the
// server reports the addresses it is reachable on from the room's network.
import os from 'node:os';

/** Private IPv4 ranges, most likely venue/home Wi-Fi first. */
const RANK = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
const rank = (ip) => { const i = RANK.findIndex((re) => re.test(ip)); return i === -1 ? RANK.length : i; };

/**
 * Base URLs a phone can open, best first. PUBLIC_URL (a tunnel or deployed
 * domain) wins outright; otherwise every external IPv4 address, private
 * ranges first.
 * @param {{port:number, publicUrl?:string, interfaces?:ReturnType<typeof os.networkInterfaces>}} opts
 * @returns {string[]}
 */
export function joinUrls({ port, publicUrl = process.env.PUBLIC_URL, interfaces = os.networkInterfaces() }) {
  if (publicUrl) return [publicUrl.replace(/\/+$/, '')];
  const ips = Object.values(interfaces).flat()
    .filter((a) => a && !a.internal && (a.family === 'IPv4' || a.family === 4))
    .map((a) => a.address);
  return [...new Set(ips)].sort((x, y) => rank(x) - rank(y)).map((ip) => `http://${ip}:${port}`);
}
