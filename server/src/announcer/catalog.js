// The predefined announcer catalog — the single source of truth for every line.
//
// The set is small and finite (3 phase calls + 4 milestones x 3 agents = 15), so
// every clip can be pre-generated ONCE (npm run generate:announcer) and served as
// a static file. That means zero per-event TTS cost on stage — the announcer just
// maps an event to a catalog key and plays the matching cached clip.
//
// Keep keys stable: the generated audio filenames and the manifest are keyed by
// them. To add variety later, add more entries (e.g. `won:deepseek:1`) and have
// lines.js pick among them — still fully pre-generated.

const NAMES = { gemini: 'Gemini', deepseek: 'DeepSeek', haiku: 'Haiku' };

/** Priority: higher jumps ahead in the playback queue. */
export const PRIORITY = { WIN: 3, SUBMIT: 2, PHASE: 2, PROGRESS: 1 };

function perAgent(agent) {
  const name = NAMES[agent];
  return [
    { key: `found:${agent}`, agent, priority: PRIORITY.PROGRESS, text: `${name} is inside the vault!` },
    { key: `opened:${agent}`, agent, priority: PRIORITY.PROGRESS, text: `${name} is prying the file open!` },
    { key: `submitted:${agent}`, agent, priority: PRIORITY.SUBMIT, text: `${name} is calling it in!` },
    { key: `won:${agent}`, agent, priority: PRIORITY.WIN, text: `We have a winner — ${name} cracked the vault!` },
  ];
}

/** Every announcer line, enumerable and pre-generatable. */
export const CATALOG = Object.freeze([
  { key: 'lobby', agent: null, priority: PRIORITY.PHASE, text: "Place your bets, folks — the crew is casing the joint!" },
  { key: 'race_start', agent: null, priority: PRIORITY.PHASE, text: "And they're off!" },
  { key: 'no_crack', agent: null, priority: PRIORITY.PHASE, text: "Time! Nobody cracked it — the mark holds." },
  ...perAgent('gemini'),
  ...perAgent('deepseek'),
  ...perAgent('haiku'),
]);

const BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

/** The catalog entry for a key, or null. */
export function entryFor(key) {
  return BY_KEY.get(key) ?? null;
}
