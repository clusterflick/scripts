const { callLlm } = require("./llm-client");

const categories = [
  "movie",
  "multiple-movies",
  "tv",
  "quiz",
  "comedy",
  "music",
  "talk",
  "workshop",
  "shorts",
  "event",
];

const systemInstruction = `You categorise cinema listings. Respond with JSON only, no introduction or explanation.

Required fields:
- "title": string - the event title (max 150 characters)
- "category": string - one of: ${categories.map((c) => `"${c}"`).join(", ")}
- "reason": string - why you chose this category (max 150 characters)
- "confidence": number 0-9 (9 = most confident)

Categories:
- "movie": A single film (40+ minutes) as the main attraction. Use when there is one such film, even with shorts before or after it, or a Q&A.
- "multiple-movies": Multiple feature films (each 40+ minutes) shown together (double bills, marathons, trilogies).
- "tv": TV show episodes or series being screened. Strong signals: broadcaster names (BBC, ITV, ITN, Channel 4, Channel 5, Sky, etc.), "TV series", "episode", "from [channel]", or description that it was made for/broadcast on television.
- "shorts": Only short films (each under 40 minutes); no film in the programme is 40+ minutes. Use for programmes of two or more shorts (e.g. "Stick Man + Superworm", "Oscar shorts"), or a single short with no 40+ minute film.
- "quiz": A quiz event.
- "comedy": Stand-up, open mic, or comedy shows (not a comedy film screening).
- "music": Primarily a musical performance, album playback, live band, or dance event (not a musical film).
- "talk": Primarily a talk or discussion (not a film screening with Q&A).
- "workshop": A workshop event.
- "event": Use if none of the above fit, or if confidence is low.

Rules:
- Focus on the primary activity. One feature + Q&A = "movie". Only short films (no feature) = "shorts", even when multiple shorts are named.
- If the description mentions a TV broadcaster (e.g. BBC, ITV, Channel 4) or that the content is a TV series/episode, prefer "tv" over "movie" unless it is clearly a theatrical film being discussed.
- Monthly screening series = "movie" (one film per event).
- Tours and festivals with selections of films may be multiple-movies or shorts. Check the runtime and make a best guess.
- Films being discussed but not shown = "talk" or "event", not "movie".
- Multiple "dir." credits may indicate "multiple-movies" or "shorts".
- If no single category clearly fits, use "event".

Example responses:
{"title":"Nosferatu","category":"movie","reason":"Single feature film screening with director Q&A","confidence":9}
{"title":"Toddler Club: Stick Man + Superworm","category":"shorts","reason":"Screening of two animated short films only; no feature","confidence":9}`;

function convertToPrompt(movie) {
  const parts = [`Title: ${movie.title}`];

  if (movie.year) {
    parts.push(`Year: ${movie.year}`);
  }
  if (movie.classification) {
    parts.push(`Classification: ${movie.classification}`);
  }
  if (movie.matchingHints?.overview) {
    parts.push(`\nDescription:\n${movie.matchingHints.overview}`);
  }

  return parts.join("\n");
}

async function askLlmToCategorise(movie) {
  if (movie.category) return movie;
  if (movie.themoviedb) return { ...movie, category: "movie" };
  if (!movie.matchingHints) return { ...movie, category: "event" };

  const prompt = convertToPrompt(movie);

  const response = await callLlm({
    systemInstruction,
    prompt,
    cacheKeyPrefix: "ask-llm-to-categorise",
    logMessage: `Asking LLM to categorise "${movie.title}"`,
  });

  const hasCategory = !!response.category && response.confidence > 7;
  return { ...movie, category: hasCategory ? response.category : "event" };
}

module.exports = askLlmToCategorise;
