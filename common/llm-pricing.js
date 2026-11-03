// List pricing for models this codebase calls, used only to turn token counts
// into an estimated USD cost for the LLM usage report (see scripts/llm-usage).
// Actual billing may differ (committed-use discounts, free tier, etc.) - this
// is an estimate for spotting trends, not an invoice.
//
// USD per 1,000,000 tokens. Source: https://aistudio.google.com/docs/pricing
// and https://developers.openai.com/api/docs/pricing, checked 2026-11-03.
//
// gemini-3.8-flash and gpt-6.1-terra are each provider's CAPABLE_MODEL (see
// llm-client-gemini.js / llm-client-openai.js) - the step up requested via
// `preferCapableModel` for tasks the default model isn't reliable enough for.
const PRICING_PER_MILLION_TOKENS = {
  "gemini:gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  // Google lists $0.75 / $3.75 until 2026-12-31 and this from 2027-01-01.
  // The later price is the lasting one, so December's estimates run high
  // rather than every month after it running low if this went unchanged.
  "gemini:gemini-3.8-flash": { input: 1.5, output: 7.5 },
  "openai:gpt-6-luna": { input: 0.1, output: 0.5 },
  "openai:gpt-6.1-terra": { input: 1.0, output: 5.0 },
  // TypeSafe's Jev charges for input only - output is free, which is why the
  // rate is 0 rather than absent. Source: https://docs.typesafe.ai/models.md,
  // checked 2026-09-19. Called by ask-jev-to-categorise, which is live, and by
  // ask-jev-to-review-results, which the pipeline reaches only when MATCHER is
  // set to "jev" - the default is still the LLM.
  "typesafe:jev-latest": { input: 0.042, output: 0 },
};

/**
 * @param {string} provider
 * @param {string} model
 * @param {number} promptTokens
 * @param {number} candidatesTokens
 * @returns {number|undefined} Estimated USD cost, or undefined if this
 *   provider/model isn't in the pricing table
 */
function estimateCostUsd(provider, model, promptTokens, candidatesTokens) {
  const pricing = PRICING_PER_MILLION_TOKENS[`${provider}:${model}`];
  if (!pricing) return undefined;

  return (
    (promptTokens * pricing.input + candidatesTokens * pricing.output) /
    1_000_000
  );
}

module.exports = { PRICING_PER_MILLION_TOKENS, estimateCostUsd };
