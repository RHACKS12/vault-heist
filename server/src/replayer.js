// Replayer: re-emit a recorded run onto the bus at a watchable cadence.
//
// Because everything on the frontend is driven by the bus, a replay looks
// identical to a live run — the observer dashboard and player screens can't tell
// the difference. This is the bulletproof demo path: if a model balks or the
// WiFi dies on stage, replay a pre-vetted run through the exact same code.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SOURCES, EVENT_TYPES, PHASES, createEvent } from './events.js';

export class Replayer {
  constructor({ bus }) {
    if (!bus) throw new Error('Replayer requires a bus');
    this.bus = bus;
    this.playing = false;
    this._stop = false;
  }

  static parse(text) {
    return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
  }

  async loadFile(file) {
    return Replayer.parse(await fsp.readFile(file, 'utf8'));
  }

  stop() { this._stop = true; }

  /**
   * Replay events onto the bus.
   * @param {object[]} events
   * @param {{speed?:number, minGapMs?:number, maxGapMs?:number, resetFirst?:boolean, onEvent?:Function}} [opts]
   *   Gaps are derived from recorded ts, clamped to [minGapMs, maxGapMs] (after
   *   dividing by speed) so a fast mock recording still paces out watchably.
   *   resetFirst publishes a LOBBY phase_change so client reducers start clean.
   */
  async play(events, { speed = 1, minGapMs = 120, maxGapMs = 1500, resetFirst = true, onEvent } = {}) {
    if (this.playing) throw new Error('already replaying');
    if (!events?.length) return { played: 0 };
    this.playing = true;
    this._stop = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    try {
      if (resetFirst) {
        this.bus.publish(createEvent({
          round: events[0].round ?? 1, source: SOURCES.GAME, type: EVENT_TYPES.PHASE_CHANGE,
          payload: { from: null, to: PHASES.LOBBY, replay: true },
        }));
      }
      let prev = events[0].ts;
      let played = 0;
      for (const e of events) {
        if (this._stop) break;
        const raw = (e.ts - prev) / speed;
        prev = e.ts;
        const gap = Math.min(maxGapMs, Math.max(minGapMs, Number.isFinite(raw) ? raw : minGapMs));
        if (played > 0 && gap > 0) await sleep(gap);
        if (this._stop) break;
        this.bus.publish({ ...e, replay: true });
        onEvent?.(e);
        played++;
      }
      return { played, stopped: this._stop };
    } finally {
      this.playing = false;
    }
  }

  async playFile(file, opts) {
    return this.play(await this.loadFile(file), opts);
  }
}

/** List recorded runs in a directory (name + size + mtime). */
export async function listRecordings(dir) {
  let names = [];
  try { names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.jsonl')); } catch { return []; }
  const out = [];
  for (const name of names) {
    try { const st = await fsp.stat(path.join(dir, name)); out.push({ name, size: st.size, mtime: st.mtimeMs }); } catch { /* skip */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
