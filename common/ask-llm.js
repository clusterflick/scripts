const { callLlm } = require("./llm-client");

const responseSchema = {
  type: "object",
  properties: {
    isMovie: { type: "boolean" },
    isMultipleMovies: { type: "boolean" },
    confidence: { type: "number" },
    matches: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          isKnownMovie: { type: "boolean" },
          title: { type: "string" },
          year: { type: "number", nullable: true },
          directors: { type: "array", maxItems: 5, items: { type: "string" } },
          cast: { type: "array", maxItems: 5, items: { type: "string" } },
        },
        required: ["isKnownMovie", "title", "directors", "cast"],
      },
    },
  },
  required: ["isMovie", "isMultipleMovies", "confidence"],
};

const systemInstruction = `You identify movies from cinema listing data.

Required fields:
- "isMovie": boolean - true if this is a movie screening. False for Q&As, discussions, talks, or other non-screening events.
- "isMultipleMovies": boolean - true if this is a double bill, marathon, trilogy screening, etc.
- "confidence": number 0-9 (9 = most confident)

If "isMovie" is true, include:
- "matches": array of up to 5 possible movies, ordered most to least likely

Each match must include:
- "isKnownMovie": boolean - true if you recognise this movie, false if relying solely on the input
- "title": string - original language title (required)
- "year": number or null - year of initial release, null if uncertain
- "directors": array of up to 5 director names (empty array if unknown)
- "cast": array of up to 5 cast member names (empty array if unknown)

Use the provided current date to weigh current cinema releases more heavily when titles are ambiguous.
If a Duration is provided, use it to identify the correct version of a film — in particular to distinguish between a feature film and a short with the same name, or between remakes from different years.

Example response for a movie:
{"isMovie":true,"isMultipleMovies":false,"confidence":8,"matches":[{"isKnownMovie":true,"title":"Nosferatu","year":2024,"directors":["Robert Eggers"],"cast":["Bill Skarsgård","Lily-Rose Depp"]}]}

Example response for a non-movie:
{"isMovie":false,"isMultipleMovies":false,"confidence":9}`;

function convertToPrompt(movie) {
  const parts = [`Title: ${movie.title}`];

  if (movie.overview?.year) {
    parts.push(`Year: ${movie.overview.year}`);
  }
  if (movie.overview?.classification) {
    parts.push(`Classification: ${movie.overview.classification}`);
  }
  if (movie.overview?.duration) {
    parts.push(
      `Duration: ${Math.round(movie.overview.duration / 60000)} minutes`,
    );
  }

  parts.push(`Current Date: ${new Date().toISOString().split("T")[0]}`);
  parts.push(`\nDescription:\n${movie.matchingHints.overview}`);

  return parts.join("\n");
}

module.exports = async function askLlm(movie) {
  if (!movie.matchingHints?.overview) {
    return { isMovie: false, isMultipleMovies: false, confidence: 0 };
  }

  const prompt = convertToPrompt(movie);

  return callLlm({
    systemInstruction,
    prompt,
    cacheKeyPrefix: "ask-llm",
    logMessage: `Asking LLM to identify "${movie.title}"`,
    maxOutputTokens: 1024,
    responseSchema,
  });
};
