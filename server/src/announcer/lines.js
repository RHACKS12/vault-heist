// Event → announcer line: map a milestone/phase event to a catalog KEY, then
// return that catalog entry (key, text, priority, agent). Everything voiced is a
// predefined catalog entry, so it can be pre-generated and cached (catalog.js).
//
// Event-driven, NOT a running narrator: tool calls and reasoning are silent.
import { EVENT_TYPES, PHASES } from '../events.js';
import { entryFor, PRIORITY } from './catalog.js';

export { PRIORITY };

/** The catalog key for an event, or null if it isn't voiced. */
export function keyFor(event) {
  if (!event) return null;
  switch (event.type) {
    case EVENT_TYPES.PHASE_CHANGE: {
      const to = event.payload?.to;
      if (to === PHASES.BETTING_OPEN) return 'lobby';
      if (to === PHASES.RACING) return 'race_start';
      if (to === PHASES.SETTLED && !event.payload?.winner) return 'no_crack';
      return null;
    }
    case EVENT_TYPES.FOUND_DIR: return event.agent ? `found:${event.agent}` : null;
    case EVENT_TYPES.OPENED_FILE: return event.agent ? `opened:${event.agent}` : null;
    case EVENT_TYPES.SUBMITTED: return event.agent ? `submitted:${event.agent}` : null;
    case EVENT_TYPES.WON: return event.agent ? `won:${event.agent}` : null;
    default: return null;
  }
}

/**
 * @param {object} event a GameEvent
 * @returns {{key:string,text:string,priority:number,agent:?string}|null}
 */
export function lineFor(event) {
  const key = keyFor(event);
  return key ? entryFor(key) : null;
}
