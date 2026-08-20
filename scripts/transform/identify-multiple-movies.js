const { callLlm } = require("../../common/llm-client");

const responseSchema = {
  type: "object",
  properties: {
    movies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          year: { type: "string", nullable: true },
          director: { type: "string", nullable: true },
          confidence: { type: "number" },
        },
        required: ["title", "confidence"],
      },
    },
    reason: { type: "string" },
  },
  required: ["movies", "reason"],
};

const systemInstruction = `You identify individual films in multi-film cinema events (double bills, marathons, trilogies, etc.). Respond with JSON only, no introduction or explanation.

Required fields:
- "movies": array of objects, each with:
  - "title": string - the film title (clean, without year or extra info)
  - "year": string or null - the release year if mentioned or clearly identifiable
  - "director": string or null - the director if mentioned or clearly identifiable
  - "confidence": number 0-9 (9 = most confident this film is part of the event)
- "reason": string - brief explanation of how you identified these films (max 150 characters)

Rules:
- Only include full-length feature films, not shorts unless clearly featured
- If the event title mentions specific films, extract those
- If the description mentions specific films, extract those
- If you cannot identify specific films with reasonable confidence, return an empty movies array
- Do not guess films that aren't mentioned or clearly implied
- For anniversary screenings of sequels/series, only include the specific films being shown
- List each film only once. If you're unsure which specific version or edition is meant (e.g. a remake vs the original), pick the single most likely one rather than including several candidates for the same film
- Keep titles in the language they're given in rather than substituting a similarly-themed but different film in English - only give a translated title when it's clearly just a rendering of the same work
- If Directors are provided, use them to match each name to the film they directed - this is the strongest signal for telling films in a double bill or marathon apart

Example input: "Back to the Future Triple Bill - Join us for all three time-travelling adventures!"
Example response:
{"movies":[{"title":"Back to the Future","year":"1985","director":"Robert Zemeckis","confidence":9},{"title":"Back to the Future Part II","year":"1989","director":"Robert Zemeckis","confidence":9},{"title":"Back to the Future Part III","year":"1990","director":"Robert Zemeckis","confidence":9}],"reason":"Triple bill explicitly mentions all three Back to the Future films"}`;

function convertToPrompt(movie) {
  const parts = [
    `Current Date: ${new Date().toISOString().split("T")[0]}`,
    `Event Title: ${movie.title}`,
  ];

  if (movie.overview?.year) {
    parts.push(`Year: ${movie.overview.year}`);
  }
  if (movie.overview?.duration) {
    const durationMins = Math.round(movie.overview.duration / 60000);
    parts.push(`Total Duration: ${durationMins} minutes`);
  }
  if (movie.overview?.directors?.length > 0) {
    parts.push(`Directors: ${movie.overview.directors.join(", ")}`);
  }
  if (movie.matchingHints?.overview) {
    parts.push(`\nDescription:\n${movie.matchingHints.overview}`);
  }

  return parts.join("\n");
}

async function identifyMultipleMovies(movie) {
  // If there's no matching hints, we can't identify the films
  if (!movie.matchingHints?.overview) {
    return { movies: [], reason: "No description available to identify films" };
  }

  const prompt = convertToPrompt(movie);

  const response = await callLlm({
    systemInstruction,
    prompt,
    cacheKeyPrefix: "identify-multiple-movies",
    logMessage: `Identifying films in "${movie.title}"`,
    responseSchema,
  });

  // Ensure we have a valid response structure
  if (!response || !Array.isArray(response.movies)) {
    return { movies: [], reason: "Invalid LLM response" };
  }

  // Drop movies matched with no title, e.g. if the director has been named but
  // the actual movie hasn't
  response.movies = response.movies.filter(({ title }) => !!title);
  return response;
}

module.exports = identifyMultipleMovies;
