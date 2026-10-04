// The crew roster: three cheap, fast models from different families, each with a
// distinct search strategy so the winner genuinely varies round to round.
import { createGeminiProvider } from './providers/gemini.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createHaikuProvider } from './providers/haiku.js';

/** @typedef {{agent:string, family:string, strategy:string, model:string, env:string, optional?:boolean}} CrewMember */

/** @type {CrewMember[]} */
export const CREW = Object.freeze([
  { agent: 'gemini', family: 'gemini', strategy: 'grep', model: 'gemini-2.5-flash', env: 'GEMINI_API_KEY' },
  { agent: 'openai', family: 'openai', strategy: 'walk', model: 'gpt-4o-mini', env: 'OPENAI_API_KEY' },
  { agent: 'haiku', family: 'haiku', strategy: 'binary', model: 'claude-haiku-4-5', env: 'ANTHROPIC_API_KEY', optional: true },
]);

const FACTORY = {
  gemini: createGeminiProvider,
  openai: createOpenAIProvider,
  haiku: createHaikuProvider,
};

/**
 * Build the real-provider crew for the Race. Only members whose API key is set
 * are included; the caller fills any missing slots (e.g. with a mock) so the
 * roster stays complete and the keyless demo still runs.
 */
export function buildRealCrew() {
  return CREW
    .filter((m) => Boolean(process.env[m.env]))
    .map((m) => ({
      agent: m.agent,
      strategy: m.strategy,
      model: m.model,
      provider: FACTORY[m.family]({ model: m.model }),
    }));
}

/** Which crew members have an API key configured. */
export function configuredAgents() {
  return CREW.filter((m) => Boolean(process.env[m.env])).map((m) => m.agent);
}
