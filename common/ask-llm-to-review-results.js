const { callLlm } = require("./llm-client");
const { basicNormalize } = require("./utils");

const systemInstruction = `You match cinema listings to TheMovieDB search results. Respond with JSON only, no introduction or explanation. Keep total response under 500 characters.

IMPORTANT: Output fields in this exact order — reason MUST come first:
- "reason": string - one brief sentence explaining your choice (no quote characters). Leave blank if no match chosen.
- "confidence": number 0-9 (9 = most confident)
- "match": object with just {"id": <number>} referencing the id from the provided TheMovieDB results list, or null if no match. You MUST only use an id that exists in the provided results.

Matching guidelines:
- If a TheMovieDB result's overview text appears verbatim (word-for-word) within the cinema listing overview, that is the strongest possible signal and should be treated as a definitive match — even over other results with the same title.
- Use the current date to assess plausibility. Films releasing more than a year in the future are unlikely matches, but films releasing within the next few months are plausible.
- Consider original_title for foreign language films.
- Never prefer a "making of", "behind the scenes", or documentary-about-a-film over the film itself. If both a film and its making-of documentary appear in the results, match the film.

CRITICAL - When NOT to match:
- You may ONLY match against films in the provided TheMovieDB results list. If you believe the cinema listing refers to a film that is NOT in the results, return null. Do NOT select a different film with a similar title as a substitute.
- If multiple results share the same or similar titles (e.g. remakes, same-name films from different years), you MUST have strong distinguishing evidence to match.
- Strong evidence includes: matching year, matching director/cast names, specific plot details that uniquely identify one film.
- If the cinema listing lacks specific identifying details (just a generic synopsis or no synopsis), return null rather than guessing.
- A vague or generic cinema overview that could apply to multiple same-titled films is NOT sufficient to match.
- When in doubt between multiple same-titled films, return null with confidence 0.
- A result's overview must describe the SAME story, subject, or plot as the cinema listing. Superficial coincidences (e.g. a shared city name, a single overlapping word) are NOT evidence of a match. If the cinema listing describes a specific story and no result's overview is about that same story, return null.

Example response with match:
{"reason":"Listing matched description of a vampire and remake of this classic movie","confidence":8,"match":{"id":426063}}

Example response without match:
{"reason":"","confidence":0,"match":null}`;

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
    maxOutputTokens: 1024,
  });
};
