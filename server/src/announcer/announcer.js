// Announcer: subscribe to the bus, turn milestone events into announcer lines,
// synthesize (or cache) audio, and emit `announce` events for the dashboard.
//
// Narration is a DERIVED presentation layer: it regenerates from the event
// stream, so it narrates replays too (the replayer re-emits the milestones and
// the announcer voices them live). That's why recordings exclude `announce`
// events (see recorder.js) — there is nothing to double up.
import { SOURCES, EVENT_TYPES, createEvent } from '../events.js';
import { lineFor } from './lines.js';

export class Announcer {
  /** @param {{bus, tts?:{synthesize:(text:string,opts?:object)=>Promise<?string>}}} opts */
  constructor({ bus, tts = null }) {
    if (!bus) throw new Error('Announcer requires a bus');
    this.bus = bus;
    this.tts = tts;
    this.cache = new Map();   // fixed line text -> clip url
    this._unsub = null;
  }

  start() {
    if (this._unsub) return this;
    this._unsub = this.bus.subscribe((e) => { this._onEvent(e).catch(() => {}); });
    return this;
  }

  stop() { this._unsub?.(); this._unsub = null; }

  async _onEvent(event) {
    if (event.source === SOURCES.ANNOUNCER) return;   // never announce our own lines
    const line = lineFor(event);
    if (!line) return;
    let clip = null;
    try { clip = await this._clip(line); } catch { clip = null; } // fall back to browser TTS
    this.bus.publish(createEvent({
      round: event.round,
      source: SOURCES.ANNOUNCER,
      agent: line.agent ?? null,
      type: EVENT_TYPES.ANNOUNCE,
      payload: { key: line.key, text: line.text, priority: line.priority, clip },
    }));
  }

  /** Get an audio clip url for a line (cached for fixed lines), or null. */
  async _clip(line) {
    if (!this.tts) return null;
    if (line.fixed && this.cache.has(line.text)) return this.cache.get(line.text);
    const clip = await this.tts.synthesize(line.text, { fixed: line.fixed });
    if (line.fixed && clip) this.cache.set(line.text, clip);
    return clip;
  }
}
