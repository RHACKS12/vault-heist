// What the announcer says — pure event → line mapping.
//
// Event-driven, NOT a running narrator: only milestone/phase events get a line
// (found a directory, opened the file, submitted, won, and the fixed "and
// they're off / place your bets" calls). Tool calls and reasoning are silent.
// Returns null for anything not worth voicing. Heist-crew persona.
import { EVENT_TYPES, PHASES } from '../events.js';

const NAMES = { gemini: 'Gemini', deepseek: 'DeepSeek', haiku: 'Haiku' };

/** Priority: higher jumps ahead in the playback queue. */
export const PRIORITY = { WIN: 3, SUBMIT: 2, PHASE: 2, PROGRESS: 1 };

function line(key, text, priority, { fixed = false, agent = null } = {}) {
  return { key, text, priority, fixed, agent };
}

function shortDir(dir) {
  if (!dir || dir === '/') return 'the vault';
  const base = dir.split('/').filter(Boolean).pop();
  return `the ${base} vault`;
}

/**
 * @param {object} event a GameEvent
 * @returns {{key:string,text:string,priority:number,fixed:boolean,agent:?string}|null}
 */
export function lineFor(event) {
  if (!event) return null;
  const name = event.agent ? (NAMES[event.agent] ?? event.agent) : null;

  switch (event.type) {
    case EVENT_TYPES.PHASE_CHANGE: {
      const to = event.payload?.to;
      if (to === PHASES.BETTING_OPEN) return line('lobby', 'Place your bets, folks — the crew is casing the joint!', PRIORITY.PHASE, { fixed: true });
      if (to === PHASES.RACING) return line('race_start', "And they're off!", PRIORITY.PHASE, { fixed: true });
      if (to === PHASES.SETTLED && !event.payload?.winner) return line('no_crack', 'Time! Nobody cracked it — the mark holds.', PRIORITY.PHASE, { fixed: true });
      return null;
    }
    case EVENT_TYPES.FOUND_DIR:
      return line(`found_dir:${event.agent}`, `${name} just broke into ${shortDir(event.payload?.dir)}!`, PRIORITY.PROGRESS, { agent: event.agent });
    case EVENT_TYPES.OPENED_FILE:
      return line(`opened_file:${event.agent}`, `${name} is prying open the vulnerable file!`, PRIORITY.PROGRESS, { agent: event.agent });
    case EVENT_TYPES.SUBMITTED:
      return line(`submitted:${event.agent}`, `${name} is calling it — making a submission!`, PRIORITY.SUBMIT, { agent: event.agent });
    case EVENT_TYPES.WON:
      return line('winner', `We have a winner! ${name} cracked the vault!`, PRIORITY.WIN, { agent: event.agent });
    default:
      return null;
  }
}
