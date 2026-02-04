const { callLlm } = require("./llm-client");
const { basicNormalize } = require("./utils");

const systemInstruction = `You match cinema listings to TheMovieDB search results. Respond with JSON only, no introduction or explanation.

Required fields:
- "match": object or null - the matching result from the provided TheMovieDB results, or null if no match
- "confidence": number 0-9 (9 = most confident)
- "reason": string - why you chose this match (max 150 characters, no quote characters). Leave blank if no match chosen.

If a match is found, include the full result object from TheMovieDB (id, title, release_date, etc.).

Matching guidelines:
- Exact phrase matches between the cinema overview and TheMovieDB overview are strong indicators.
- Use the current date to assess plausibility. Unreleased films or those releasing more than a year in the future are unlikely matches.
- Consider original_title for foreign language films.

CRITICAL - When NOT to match:
- If multiple results share the same or similar titles (e.g. remakes, same-name films from different years), you MUST have strong distinguishing evidence to match.
- Strong evidence includes: matching year, matching director/cast names, specific plot details that uniquely identify one film.
- If the cinema listing lacks specific identifying details (just a generic synopsis or no synopsis), return null rather than guessing.
- A vague or generic cinema overview that could apply to multiple same-titled films is NOT sufficient to match.
- When in doubt between multiple same-titled films, return null with confidence 0.

Example response with match:
{"match":{"id":426063,"title":"Nosferatu","original_title":"Nosferatu","release_date":"2024-12-25","overview":"..."},"confidence":8,"reason":"Listing matched description of a vampire and remake of this classic movie"}

Example response without match:
{"match":null,"confidence":0}`;

function convertToPrompt(movie, results, normalizedTitle) {
  const parts = [`Title: ${normalizedTitle}`];

  if (movie.year) {
    parts.push(`Year: ${movie.year}`);
  }
  if (movie.classification) {
    parts.push(`Classification: ${movie.classification}`);
  }

  parts.push(`Current Date: ${new Date().toISOString().split("T")[0]}`);

  if (movie.matchingHints?.overview) {
    parts.push(`\nCinema listing overview:\n${movie.matchingHints.overview}`);
  }

  const filteredResults = results.map(
    ({
      id,
      original_language,
      original_title,
      overview,
      popularity,
      release_date,
      title,
    }) => ({
      id,
      original_language,
      original_title,
      overview,
      popularity,
      release_date,
      title,
    }),
  );

  parts.push(
    `\nTheMovieDB results:\n${JSON.stringify(filteredResults, null, 2)}`,
  );

  return parts.join("\n");
}

module.exports = async function askLlmToReviewResults(
  movie,
  results,
  normalizedTitle,
) {
  const isAnniversary = basicNormalize(movie.title).includes("anniversary");
  // If we've no matching hints, don't use LLM
  // If we've no hint overview, don't use LLM unless it's an anniversary showing
  // (in which case the LLM might just get it without the overview hint)
  if (
    !movie.matchingHints ||
    (!movie.matchingHints.overview && !isAnniversary)
  ) {
    return { match: null, confidence: 0 };
  }

  const prompt = convertToPrompt(movie, results, normalizedTitle);

  return callLlm({
    systemInstruction,
    prompt,
    cacheKeyPrefix: "ask-llm-with-results",
    logMessage: `Asking LLM to match "${movie.title}" against results`,
  });
};
