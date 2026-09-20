const {
  APIConnectionError,
  APITimeoutError,
  InternalServerError,
  RateLimitError,
} = require("@typesafe-ai/sdk");
const askLlmToReviewResults = require("./ask-llm-to-review-results");
const askJevToReviewResults = require("./ask-jev-to-review-results");
const { basicNormalize, runLlmFunction } = require("./utils");
require("dotenv").config();

// Which reviewer decides between TheMovieDB search results, selected at
// startup via the MATCHER env variable - "llm" by default, or "jev". The exact
// shape of common/categorise.js and the LLM_PROVIDER toggle, for the same
// reason: a swap this size has to be reversible by an env var rather than a
// revert, and Jev has no second vendor behind the same interface, so the LLM
// stays wired up as a fallback and an outage costs latency rather than a stage.
//
// Measured on the 13 scoreable rows of common/tests/matching-labels.json:
// Jev 12/13 against the LLM's 10/13, about twice as fast, about a third of the
// cost, and - the part that took two attempts to measure - stable where the
// LLM is not. Asked the same question four times with a nonce defeating both
// caches, the LLM returned a different film on 4 of 13 rows and Jev on none.
// Two of those four reproduced exactly the pair that had been alternating in
// the published releases, so a share of the churn that
// helpers/find-unstable-matches.js reports is the reviewer, not the search.
//
// Thirteen rows drawn from the known-hard tail is not a mandate. The default
// stays "llm" until it has been run wider.
const matcher = basicNormalize(process.env.MATCHER || "llm");

if (!["llm", "jev"].includes(matcher)) {
  throw new Error(
    `Unknown MATCHER "${process.env.MATCHER}". Use "llm" or "jev".`,
  );
}

// Only conditions on the far side of the network fall back. Everything else -
// a missing key, a malformed request, a schema the API rejects - is our bug,
// and quietly serving LLM answers for the rest of the run would hide it for as
// long as it took someone to notice the bill. Those throw.
const isTransient = (error) =>
  error instanceof APIConnectionError ||
  error instanceof APITimeoutError ||
  error instanceof RateLimitError ||
  error instanceof InternalServerError;

// The incumbent publishes a match on a confidence it reports about itself.
// Kept exactly as it was: this module changes who is asked, not what the
// answer has to clear.
const LLM_CONFIDENCE_GATE = 8;

const reviewWithLlm = async (movie, results, normalizedTitle) => {
  const result = await runLlmFunction(() =>
    askLlmToReviewResults(movie, results, normalizedTitle),
  );
  if (result === null) return null;

  const { confidence, match } = result;
  if (confidence < LLM_CONFIDENCE_GATE) return null;

  return results.find(({ id }) => id === match?.id) ?? null;
};

// No gate on this side. Jev's no-match outcome is an option in the Choice
// rather than a threshold on a number, so "none of these" is an answer it
// gives rather than one we infer - see the note in ask-jev-to-review-results.
const reviewWithJev = async (movie, results, normalizedTitle) => {
  const { match } = await askJevToReviewResults(
    movie,
    results,
    normalizedTitle,
  );
  return match ?? null;
};

/**
 * @param {object} movie
 * @param {object[]} results - TheMovieDB search results to choose between.
 * @param {string} normalizedTitle
 * @returns {Promise<object|null>} The chosen result, or null.
 */
async function reviewResults(movie, results, normalizedTitle) {
  if (matcher === "llm") return reviewWithLlm(movie, results, normalizedTitle);

  try {
    return await reviewWithJev(movie, results, normalizedTitle);
  } catch (error) {
    if (!isTransient(error)) throw error;

    // Loud on purpose: a fallback that ran silently would look exactly like a
    // working Jev run. Not recorded anywhere beyond the job log, because the
    // usage report already shows it - the two reviewers use different cache
    // key prefixes, so `ask-llm-with-results` appearing in byCallSite during a
    // MATCHER=jev run is itself the signal that Jev could not answer.
    console.log(
      ` ! - Jev unavailable (${error.constructor.name}); falling back to the LLM for "${movie.title}"`,
    );

    return reviewWithLlm(movie, results, normalizedTitle);
  }
}

console.log(` - Matcher: ${matcher}`);

module.exports = reviewResults;
module.exports.matcher = matcher;
