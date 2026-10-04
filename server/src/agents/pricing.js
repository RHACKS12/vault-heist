// Model pricing, used to turn per-step token usage into dollars for the race
// cost cap (see cost.js). Prices are USD per 1,000,000 tokens.
//
// These are plain, editable defaults — CONFIRM against each provider's current
// pricing page before trusting the numbers. Mock providers and any model not in
// the table are treated as free (cost 0), so offline demos and tests never trip
// the cap.
export const PRICES = Object.freeze({
  // Google Gemini
  'gemini-2.5-flash': { inputPerM: 0.30, outputPerM: 2.50 },
  // OpenAI
  'gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.60 },
  'gpt-4.1-mini': { inputPerM: 0.40, outputPerM: 1.60 },
  // DeepSeek (still supported via the OpenAI-compatible core)
  'deepseek-chat': { inputPerM: 0.27, outputPerM: 1.10 },
  // Anthropic Claude
  'claude-haiku-4-5': { inputPerM: 1.00, outputPerM: 5.00 },
});

/** Look up a price row, matching exact id first then a longest-prefix fallback
 *  (so dated ids like "claude-haiku-4-5-20251001" resolve to "claude-haiku-4-5"). */
export function priceFor(model) {
  if (!model) return null;
  if (PRICES[model]) return PRICES[model];
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(key) && key.length > bestLen) { best = PRICES[key]; bestLen = key.length; }
  }
  return best;
}

/**
 * Dollar cost of one step's token usage for a model. Unknown models and missing
 * usage cost 0.
 * @param {string} model
 * @param {{inputTokens?:number, outputTokens?:number}} [usage]
 * @returns {number} USD
 */
export function costOf(model, usage) {
  const price = priceFor(model);
  if (!price || !usage) return 0;
  const inTok = Number(usage.inputTokens) || 0;
  const outTok = Number(usage.outputTokens) || 0;
  return (inTok / 1_000_000) * price.inputPerM + (outTok / 1_000_000) * price.outputPerM;
}
