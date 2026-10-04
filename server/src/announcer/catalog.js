// The predefined announcer catalog — the single source of truth for every line.
//
// The set is small and finite, so every clip can be pre-generated ONCE
// (npm run generate:announcer) and served as a static file. That means zero
// per-event TTS cost on stage — the announcer just maps an event to a catalog
// key and plays the matching cached clip.
//
// Keep keys stable: the generated audio filenames and the manifest are keyed by
// them. To add variety later, add more entries (e.g. `won:openai:1`) and have
// lines.js pick among them — still fully pre-generated.

const NAMES = { gemini: 'Gemini', openai: 'OpenAI', haiku: 'Haiku' };

/** Priority: higher jumps ahead in the playback queue. */
export const PRIORITY = { WIN: 3, SUBMIT: 2, PHASE: 2, PROGRESS: 1 };

function perAgent(agent) {
  const name = NAMES[agent];
  return [
    { key: `found:${agent}`, agent, priority: PRIORITY.PROGRESS, text: `${name}'s inside!` },
    { key: `opened:${agent}`, agent, priority: PRIORITY.PROGRESS, text: `${name} cracked open a file!` },
    { key: `submitted:${agent}`, agent, priority: PRIORITY.SUBMIT, text: `${name}'s making the call!` },
    { key: `won:${agent}`, agent, priority: PRIORITY.WIN, text: `${name} cracked the vault!` },
  ];
}

/** Every announcer line, enumerable and pre-generatable. */
export const CATALOG = Object.freeze([
  // phase / game calls (fixed, no agent)
  { key: 'new_round', agent: null, priority: PRIORITY.PHASE, text: 'A new round begins!' },
  { key: 'bets_open', agent: null, priority: PRIORITY.PHASE, text: 'Bets are open — place your chips!' },
  { key: 'bets_closed', agent: null, priority: PRIORITY.PHASE, text: 'Bets are locked!' },
  { key: 'race_start', agent: null, priority: PRIORITY.PHASE, text: "And they're off!" },
  { key: 'no_crack', agent: null, priority: PRIORITY.PHASE, text: "Time's up — the vault holds!" },
  // per-agent milestones
  ...perAgent('gemini'),
  ...perAgent('openai'),
  ...perAgent('haiku'),
]);

const BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

/** The catalog entry for a key, or null. */
export function entryFor(key) {
  return BY_KEY.get(key) ?? null;
}
