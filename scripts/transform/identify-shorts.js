const { callLlm } = require("../../common/llm-client");

const systemInstruction = `You identify individual short films in cinema short film programmes (collections, compilations, showcases, etc.). Respond with JSON only, no introduction or explanation.

Required fields:
- "movies": array of objects, each with:
  - "title": string - the short film title (clean, without year or extra info)
  - "year": string or null - the release year if mentioned or clearly identifiable
  - "director": string or null - the director if mentioned or clearly identifiable
  - "confidence": number 0-9 (9 = most confident this film is part of the programme)
- "reason": string - brief explanation of how you identified these films (max 150 characters)

Rules:
- Include short films (under 40 minutes) that are clearly named in the title or description
- If the event title mentions specific short films, extract those
- If the description mentions specific short films, extract those
- If you cannot identify specific short films with reasonable confidence, return an empty movies array
- Do not guess films that aren't mentioned or clearly implied
- For compilations like "Oscar Nominated Shorts", try to identify individual titles if they are listed

Example input: "Oscar Nominated Animated Shorts 2025 - Featuring Beautiful Men, In the Shadow of the Cypress, Magic Candies, Wander to Wonder, and Yuck!"
Example response:
{"movies":[{"title":"Beautiful Men","year":"2024","director":null,"confidence":8},{"title":"In the Shadow of the Cypress","year":"2024","director":null,"confidence":8},{"title":"Magic Candies","year":"2024","director":null,"confidence":8},{"title":"Wander to Wonder","year":"2024","director":null,"confidence":8},{"title":"Yuck!","year":"2024","director":null,"confidence":8}],"reason":"Oscar nominated shorts programme with five individually named animated short films"}`;

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
  if (movie.matchingHints?.overview) {
    parts.push(`\nDescription:\n${movie.matchingHints.overview}`);
  }

  return parts.join("\n");
}

async function identifyShorts(movie) {
  // If there's no matching hints, we can't identify the films
  if (!movie.matchingHints?.overview) {
    return {
      movies: [],
      reason: "No description available to identify short films",
    };
  }

  const prompt = convertToPrompt(movie);

  const response = await callLlm({
    systemInstruction,
    prompt,
    cacheKeyPrefix: "identify-shorts",
    logMessage: `Identifying short films in "${movie.title}"`,
  });

  // Ensure we have a valid response structure
  if (!response || !Array.isArray(response.movies)) {
    return { movies: [], reason: "Invalid LLM response" };
  }

  // Filter out entries where the LLM couldn't determine a title
  // (e.g. Isiah Medina's "--, 2013, 4 min." was returned with title: null)
  response.movies = response.movies.filter((m) => m.title);

  return response;
}

module.exports = identifyShorts;
