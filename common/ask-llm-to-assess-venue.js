const { callLlm } = require("./llm-client");

const programmeTypes = [
  "recurring-programme",
  "occasional-screenings",
  "one-off-booking",
  "not-a-film-venue",
];

const responseSchema = {
  type: "object",
  properties: {
    isFilmVenue: { type: "boolean" },
    programmeType: { type: "string", enum: programmeTypes },
    reason: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["isFilmVenue", "programmeType", "confidence"],
};

const systemInstruction = `You assess whether a venue is worth listing as a place that screens films. You are given a venue name and the titles of events it has listed on a ticketing platform. Respond with JSON only, no introduction or explanation.

Required fields:
- "isFilmVenue": boolean - true if this venue screens films to an audience
- "programmeType": string - one of: ${programmeTypes.map((t) => `"${t}"`).join(", ")}
- "reason": string - why (max 150 characters)
- "confidence": number 0-9 (9 = most confident)

Programme types:
- "recurring-programme": a named or repeating film strand at this venue (a film club, a season, a numbered series, a monthly night). The strongest signal that the venue is worth listing.
- "occasional-screenings": real film screenings, but no recurring strand - a handful of unrelated films.
- "one-off-booking": a single screening that looks like a room hire or a campaign passing through, rather than anything the venue programmes itself.
- "not-a-film-venue": the events are not film screenings at all.

Rules:
- Judge the venue from the events as a whole, not from any single title.
- Live sport shown on a screen is not film. "Premier League Screening", "Community Shield", a boxing or World Cup screening: "not-a-film-venue".
- Comedy clubs, stand-up nights, quizzes, club nights, parties and life drawing are not film venues, even when a title mentions a film or TV show ("Peep Show Quiz", "Buffy Brewery Quiz", "A Movie Themed Day Party").
- Events *about* the film industry are not screenings: networking ("Film, TV & Media Production Networking"), pitching competitions, film fairs, screen acting or screenwriting classes, filmmaking workshops and training centres. These are "not-a-film-venue" unless the venue also screens films.
- Author talks, book launches and signings are not film screenings.
- A repeated series name across several titles is strong evidence of "recurring-programme" - for example "LOST IN MOVIES: ...", "FREE Kids Movie Club: ...", "Summer Screenings at ...", "Film Café: ...", or a numbered entry such as "SCREEN SELECTA 009".
- An outdoor or seasonal cinema season counts as "recurring-programme".
- A single community screening of one campaign film is "one-off-booking", not a programme, however worthy the film.
- A venue showing several unrelated feature films with no strand name is "occasional-screenings".
- Set "isFilmVenue" false whenever "programmeType" is "not-a-film-venue", and true otherwise.
- Score 8 or 9 when the events clearly fit one type. Reserve low confidence for genuinely ambiguous listings.

Example responses:
{"isFilmVenue":true,"programmeType":"recurring-programme","reason":"Repeating 'LOST IN MOVIES' strand of classic features on the big screen","confidence":9}
{"isFilmVenue":false,"programmeType":"not-a-film-venue","reason":"Every listing is a live Premier League or boxing screening","confidence":9}
{"isFilmVenue":true,"programmeType":"one-off-booking","reason":"Single community screening of one campaign documentary","confidence":8}`;

// The titles are the whole signal, so send enough to show a strand repeating
// without paying for a venue that lists hundreds of the same thing.
const MAX_TITLES = 25;

function convertToPrompt({ name, address, titles }) {
  const parts = [`Venue: ${name}`];
  if (address) parts.push(`Address: ${address}`);
  parts.push(
    `\nEvents listed at this venue (${titles.length} total${titles.length > MAX_TITLES ? `, showing first ${MAX_TITLES}` : ""}):`,
  );
  parts.push(
    titles
      .slice(0, MAX_TITLES)
      .map((t) => `- ${t}`)
      .join("\n"),
  );
  return parts.join("\n");
}

/**
 * Assess whether a discovered venue screens films.
 * @param {Object} venue - { name, address, titles }
 * @returns {Promise<Object>} { isFilmVenue, programmeType, reason, confidence }
 */
async function askLlmToAssessVenue(venue) {
  if (!venue.titles || venue.titles.length === 0) {
    return {
      isFilmVenue: false,
      programmeType: "not-a-film-venue",
      reason: "No event titles available to assess",
      confidence: 0,
    };
  }

  return callLlm({
    systemInstruction,
    prompt: convertToPrompt(venue),
    cacheKeyPrefix: "ask-llm-to-assess-venue",
    logMessage: `Asking LLM to assess venue "${venue.name}"`,
    maxOutputTokens: 512,
    responseSchema,
  });
}

module.exports = askLlmToAssessVenue;
module.exports.programmeTypes = programmeTypes;
