const {
  APIConnectionError,
  APITimeoutError,
  InternalServerError,
  RateLimitError,
} = require("@typesafe-ai/sdk");
const askLlmToCategorise = require("./ask-llm-to-categorise");
const askJevToCategorise = require("./ask-jev-to-categorise");
const { basicNormalize } = require("./utils");
const { recordCategoriserFallback } = require("./llm-usage-log");
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

// askJevToCategorise hangs the full distribution off the movie for the
// comparison harness. On the pipeline path that field would reach
// validate-against-schema, and schema.json is additionalProperties: false - so
// it is dropped here rather than made optional there. The harness calls the
// module directly and still gets it.
// eslint-disable-next-line no-unused-vars
const withoutDistribution = ({ jev, ...movie }) => movie;

async function categorise(movie) {
  if (categoriser === "llm") return askLlmToCategorise(movie);

  try {
    return withoutDistribution(await askJevToCategorise(movie));
  } catch (error) {
    if (!isTransient(error)) throw error;

    // Loud on purpose. A fallback that ran silently would look exactly like a
    // working Jev run, and the whole point of the A/B is knowing which
    // answered. The usage report counts these so a run that limped through on
    // the LLM cannot be read as a clean one.
    console.log(
      ` ! - Jev unavailable (${error.constructor.name}); falling back to the LLM for "${movie.title}"`,
    );
    recordCategoriserFallback({
      title: movie.title,
      reason: error.constructor.name,
    });

    return askLlmToCategorise(movie);
  }
}

console.log(` - Categoriser: ${categoriser}`);

module.exports = categorise;
module.exports.categoriser = categoriser;
