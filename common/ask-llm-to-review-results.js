const { callLlm } = require("./llm-client");
const { basicNormalize } = require("./utils");

const systemInstruction = `You match cinema listings to TheMovieDB search results. Respond with JSON only, no introduction or explanation.

Required fields:
- "match": object or null - the matching result from the provided TheMovieDB results, or null if no match
- "confidence": number 0-9 (9 = most confident)

If a match is found, include the full result object from TheMovieDB (id, title, release_date, etc.).

Matching guidelines:
- Exact phrase matches between the cinema overview and TheMovieDB overview are strong indicators.
- Use the current date to assess plausibility. Unreleased films or those releasing more than a year in the future are unlikely matches.
- Consider original_title for foreign language films.

Example response with match:
{"match":{"id":426063,"title":"Nosferatu","original_title":"Nosferatu","release_date":"2024-12-25","overview":"..."},"confidence":8}

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

function parseResponse(text, result) {
  // Fix for specific LLM issue which generated invalid JSON
  const cleanedText = text.replace(/"backdrop_path": "[^,]+,\n/i, "");
  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    console.log("Error parsing LLM answer, full response below:");
    console.log("----------------------------------------------");
    console.log(result.response.text());
    console.log("----------------------------------------------");
    throw e;
  }
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
    parseResponse,
  });
};
