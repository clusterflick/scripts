// List pricing for models this codebase calls, used only to turn token counts
// into an estimated USD cost for the LLM usage report (see scripts/llm-usage).
// Actual billing may differ (committed-use discounts, free tier, etc.) - this
// is an estimate for spotting trends, not an invoice.
//
// USD per 1,000,000 tokens. Source: https://ai.google.dev/gemini-api/docs/pricing
// and https://platform.openai.com/docs/pricing, checked 2026-08-20.
//
// gemini-2.5-flash-lite is scheduled for retirement by Google on 2026-10-16.
// Kept here (rather than removed) so historical usage logged before the
// MODEL switch in llm-client-gemini.js still prices correctly.
const PRICING_PER_MILLION_TOKENS = {
  "gemini:gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini:gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "openai:gpt-4.1-nano": { input: 0.1, output: 0.4 },
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
