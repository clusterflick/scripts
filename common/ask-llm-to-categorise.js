const { callLlm } = require("./llm-client");

const categories = {
  movie:
    "Use this category when there is a showing of a single full-length movie. If there are multiple full-length movies showing, this is not the correct category. However, if there is a single full-length movie showing along with short movies, then this is the correct category",
  "multiple-movies":
    "Use this category when there is a showing of more than one full-length movies or a series of films. These event are sometimes referred to as 'double bills', 'movie marathons', 'trilogy', etc.",
  tv: "Use this category when there is one or more episodes of a TV show being shown",
  quiz: "Use this category when the event is a quiz",
  comedy:
    "Use this category when the event is a comedy show, open mic comedy, stand up comedy, etc. and is not related to a showing of movie or TV show",
  music:
    "Use this category when the event is primarily music being played, such as pre-recorded music, album playbacks, or a live band, etc. and is not related to a showing of movie or TV show. Events which contain some music but which a musical performance is not a majority of the event should not use this category.",
  talk: "Use this category when the event is a talk, and is not related to a showing of movie or TV show. Events which contain talks but which a main talk is not a majority of the event should not use this category.",
  workshop:
    "Use this category when the event is a workshop, and is not related to a showing of movie or TV show",
  shorts:
    "Use this category when there is one or more short movies being shown, such as a programme of short films. These are often referred to as shorts and clips",
  event:
    "Use this category if the event doesn't match any of the other categories",
};

const systemInstruction = `
  Given the following details from a cinema listing, provide a response with no introduction or summary, just JSON response.
  The JSON response must an object which contains a \`title\` string, \`category\` string, \`reason\` string and your \`confidence\` as a number from 0 to 9 (9 being the most confident).
  Pick the category which best describes the listing details that have been provided. Look to the most prominant part of the listing when deciding.

  Monthly screenings should be categorised as "movie", not "multiple-movies" as only one film is being shown at once.
  Make sure to check whether a film is being shown, or if it's just being discussed, e.g. "New Writings" events at the BFI are discussions hosted in the library
  When looking at the description:
   * "dir." often indicates the director(s). Multiple lines using this may indicate that it's a multiple movies or shorts.
   * "BBC", "ITV", and "ITN" are channels and companies used for television and may indicate that it's a TV show

  If an event does not have an obvious prominant part (e.g an event with screenings, stories and talks) then it may be that no one specific category is suitable.
  However, if the event has multiple films as well as something else extra (e.g. a talk, performance, etc. especially that you might have at an awards ceremony) then the extra thing should be ignored. The aim is to inform users of what the event is mostly about when filtering.
  e.g. A film screening with Q&A would be category "movie", and an evening of short film with discussion afterwards would be category "short"

  The \`title\` should be the title of the event you're categorising, limited to a maximum of 150 characters.
  The \`reason\` should be the reason you picked a particular category, limited to a maximum of 150 characters.
  The \`category\` property must be one of "${Object.keys(categories).join('", "')}", using "event" if none of the other categories apply or you have a low confidence.

  Here is a description of each of the categories:
  ${JSON.stringify(categories, null, 4)}
`;

function convertToPrompt(movie) {
  const movieYear = movie.year ? `\nYear: ${movie.year}` : "";
  const movieClassification = movie.classification
    ? `\nClassification: ${movie.classification}`
    : "";

  return `
${movie.title}${movieYear}${movieClassification}

${movie.matchingHints.overview || ""}
`.trim();
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
