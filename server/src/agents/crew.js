// The crew roster: three cheap, fast models from different families, each with a
// distinct search strategy so the winner genuinely varies round to round.
import { createGeminiProvider } from './providers/gemini.js';
import { createDeepSeekProvider } from './providers/deepseek.js';
import { createHaikuProvider } from './providers/haiku.js';

/** @typedef {{agent:string, family:string, strategy:string, model:string, env:string, optional?:boolean}} CrewMember */

/** @type {CrewMember[]} */
export const CREW = Object.freeze([
  { agent: 'gemini', family: 'gemini', strategy: 'grep', model: 'gemini-2.5-flash', env: 'GEMINI_API_KEY' },
  { agent: 'deepseek', family: 'deepseek', strategy: 'walk', model: 'deepseek-chat', env: 'DEEPSEEK_API_KEY' },
  { agent: 'haiku', family: 'haiku', strategy: 'binary', model: 'claude-haiku-4-5-20251001', env: 'ANTHROPIC_API_KEY', optional: true },
]);

const FACTORY = {
  gemini: createGeminiProvider,
  deepseek: createDeepSeekProvider,
  haiku: createHaikuProvider,
};

/**
 * Build the real-provider crew for the Race (agents + strategy + provider).
 * Providers throw NotWiredError on use until the SDK adapters are implemented.
 * Haiku is included only when its key is present (it is optional/swappable).
 */
export function buildRealCrew() {
  return CREW
    .filter((m) => !m.optional || process.env[m.env])
    .map((m) => ({
      agent: m.agent,
      strategy: m.strategy,
      provider: FACTORY[m.family]({ model: m.model }),
    }));
}

/** Which crew members have an API key configured. */
export function configuredAgents() {
  return CREW.filter((m) => Boolean(process.env[m.env])).map((m) => m.agent);
}
