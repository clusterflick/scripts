// In-memory record of every callLlm invocation for the current process. Each
// `transform <location>` run is its own process, so this naturally scopes to
// one venue - see index.js, which clears it before transforming and writes
// whatever it collected to llm-usage-data/<location> afterwards.
//
// Kept separate from the transformed-data output on purpose: nothing that
// reads cinema listings should carry LLM diagnostics, the same reasoning that
// keeps departed-movies.json out of combined-data.json.

let records = [];

/**
 * @param {object} record
 * @param {string} record.cacheKeyPrefix - Identifies which callLlm call site
 *   this came from (e.g. "ask-llm", "identify-shorts")
 * @param {string} record.provider - "gemini" or "openai"
 * @param {string} record.model
 * @param {boolean} record.cacheHit - Whether the daily cache served this
 *   without an API call
 * @param {number} [record.promptTokens] - Absent on a cache hit; no call was made
 * @param {number} [record.candidatesTokens] - Absent on a cache hit
 */
function recordLlmUsage(record) {
  records.push(record);
}

function getLlmUsageLog() {
  return records;
}

function clearLlmUsageLog() {
  records = [];
}

module.exports = { recordLlmUsage, getLlmUsageLog, clearLlmUsageLog };
