const {
  APIConnectionError,
  APITimeoutError,
  InternalServerError,
  RateLimitError,
} = require("@typesafe-ai/sdk");
const askLlmToCategorise = require("./ask-llm-to-categorise");
const askJevToCategorise = require("./ask-jev-to-categorise");
const { basicNormalize } = require("./utils");
require("dotenv").config();

// Which categoriser the transform uses, selected at startup via the
// CATEGORISER env variable - "llm" by default, or "jev". Mirrors the
// LLM_PROVIDER toggle in llm-client.js, and exists for the same reason: a
// swap this size has to be reversible by an env var rather than a revert.
//
// Unlike that toggle, this one has no second vendor offering the same
// interface. Gemini and OpenAI are interchangeable; Jev is not interchangeable
// with anything. So when Jev is selected the LLM stays wired up behind it as a
// fallback, and an outage costs latency rather than a stage.
const categoriser = basicNormalize(process.env.CATEGORISER || "llm");

if (!["llm", "jev"].includes(categoriser)) {
  throw new Error(
    `Unknown CATEGORISER "${process.env.CATEGORISER}". Use "llm" or "jev".`,
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

// Jev is not deterministic. Asked the same question twice its probabilities
// move a little, and where the top two categories are close that is enough to
// change which one wins: seven listings in the 21 September release changed
// category between two runs on identical input, and asked three more times,
// three of them changed again. Because cache-llm is keyed by day, a near-tie
// gets one fresh draw per day, so a listing can move category overnight with
// nothing about it having changed.
//
// So when today's answer is a near-tie and yesterday's published category for
// the same listing is today's runner-up, yesterday's stands. It only ever
// returns an answer Jev ranks second today - this holds a listing steady, it
// never gives it one Jev doesn't back. A listing new today, or one Jev has
// clearly moved away from, gets today's answer.
//
// A near-tie is 20 points or less between the top two: the seven that moved had
// gaps of 0.01 to 0.20. Too tight a line only makes this apply less often, so
// it errs tight. Compared in whole hundredths, because 0.56 - 0.36 is
// 0.20000000000000007 in floating point and would fall just outside the line.
const NEAR_TIE_POINTS = 20;

function holdYesterdaysCategory(result, previousCategory) {
  if (!previousCategory || !result.jev) return result;

  const [first, second] = Object.entries(result.jev.probabilities).sort(
    ([, a], [, b]) => b - a,
  );
  if (!second || second[0] !== previousCategory) return result;
  if (Math.round((first[1] - second[1]) * 100) > NEAR_TIE_POINTS) return result;

  console.log(
    ` - Holding "${result.title}" at ${previousCategory}: a near-tie today (${first[0]} ${first[1].toFixed(2)}, ${second[0]} ${second[1].toFixed(2)})`,
  );
  return { ...result, category: previousCategory };
}

// askJevToCategorise hangs the full distribution off the movie for the
// comparison harness. On the pipeline path that field would reach
// validate-against-schema, and schema.json is additionalProperties: false - so
// it is dropped here rather than made optional there. The harness calls the
// module directly and still gets it.
// eslint-disable-next-line no-unused-vars
const withoutDistribution = ({ jev, ...movie }) => movie;

/**
 * @param {object} movie
 * @param {object} [options]
 * @param {string} [options.previousCategory] - What yesterday's release
 *   published for this listing, when the categoriser decided it. Used only to
 *   break a near-tie; see holdYesterdaysCategory.
 */
async function categorise(movie, { previousCategory } = {}) {
  if (categoriser === "llm") return askLlmToCategorise(movie);

  try {
    return withoutDistribution(
      holdYesterdaysCategory(await askJevToCategorise(movie), previousCategory),
    );
  } catch (error) {
    if (!isTransient(error)) throw error;

    // Loud on purpose: a fallback that ran silently would look exactly like a
    // working Jev run. Not recorded anywhere beyond the job log, because the
    // usage report already shows it - the two categorisers use different cache
    // key prefixes, so `ask-llm-to-categorise` appearing in byCallSite during a
    // CATEGORISER=jev run is itself the signal that Jev could not answer.
    console.log(
      ` ! - Jev unavailable (${error.constructor.name}); falling back to the LLM for "${movie.title}"`,
    );

    return askLlmToCategorise(movie);
  }
}

console.log(` - Categoriser: ${categoriser}`);

module.exports = categorise;
module.exports.categoriser = categoriser;
module.exports.holdYesterdaysCategory = holdYesterdaysCategory;
