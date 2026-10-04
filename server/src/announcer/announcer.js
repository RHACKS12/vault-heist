// Announcer: subscribe to the bus, map milestone events to predefined catalog
// lines, and emit `announce` events for the dashboard — attaching a pre-generated
// audio clip when one exists (zero runtime TTS cost).
//
// Narration is a DERIVED presentation layer: it regenerates from the event
// stream, so it narrates replays too. Recordings therefore exclude `announce`
// events (see recorder.js) — nothing to double up.
//
// Clips come from a manifest (key -> url) built offline by
// `npm run generate:announcer`. With no manifest (or a missing key), the clip is
// null and the dashboard falls back to the browser's built-in speech, so the
// announcer is audible even before anything is generated. An optional `tts`
// provider can synthesize keys that aren't pre-generated (not used by default).
import { SOURCES, EVENT_TYPES, createEvent } from '../events.js';
import { lineFor } from './lines.js';

export class Announcer {
  /**
   * @param {{bus, clips?:Map<string,string>|Record<string,string>,
   *          tts?:{synthesize:(text:string)=>Promise<?string>}}} opts
   */
  constructor({ bus, clips = new Map(), tts = null }) {
    if (!bus) throw new Error('Announcer requires a bus');
    this.bus = bus;
    this.clips = clips instanceof Map ? clips : new Map(Object.entries(clips ?? {}));
    this.tts = tts;
    this._unsub = null;
    // Per-round de-duplication: each line is announced at most once per round, and
    // once someone WINS the round we go quiet. This stops an agent that re-calls
    // submit() (e.g. gpt-4o-mini retrying a wrong answer) from spamming
    // "… is making the call!", and stops stale milestones playing after the win.
    this._roundNo = null;
    this._announced = new Set();
    this._won = false;
  }

  start() {
    if (this._unsub) return this;
    this._unsub = this.bus.subscribe((e) => { this._onEvent(e).catch(() => {}); });
    return this;
  }

  stop() { this._unsub?.(); this._unsub = null; }

  async _onEvent(event) {
    if (event.source === SOURCES.ANNOUNCER) return; // never announce our own lines
    const line = lineFor(event);
    if (!line) return;

    // Reset the per-round state when the round number changes.
    if (event.round !== this._roundNo) {
      this._roundNo = event.round;
      this._announced = new Set();
      this._won = false;
    }
    const isWin = line.key.startsWith('won:');
    if (this._won && !isWin) return;          // quiet once the round is won
    if (this._announced.has(line.key)) return; // say each line at most once per round
    this._announced.add(line.key);            // claim it BEFORE any await (race-safe)
    if (isWin) this._won = true;

    let clip = this.clips.get(line.key) ?? null;
    if (!clip && this.tts) { try { clip = await this.tts.synthesize(line.text); } catch { clip = null; } }
    this.bus.publish(createEvent({
      round: event.round,
      source: SOURCES.ANNOUNCER,
      agent: line.agent ?? null,
      type: EVENT_TYPES.ANNOUNCE,
      payload: { key: line.key, text: line.text, priority: line.priority, clip },
    }));
  }
}
