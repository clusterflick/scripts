const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyLlmCache } = require("./cache");
const { getId } = require("./utils");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const categories = {
  movie:
    "Use this category when there is a showing of a single full-length movie",
  "multiple-movies":
    "Use this category when there is a showing of multiple full-length movies. Sometimes referred to as 'double bills', 'movie marathons', 'trilogy', etc.",
  tv: "Use this category when there is one or more episodes of a TV show being shown",
  quiz: "Use this category when the event is a quiz",
  comedy:
    "Use this category when the event is a comedy show, open mic comedy, stand up comedy, etc. and is not related to a showing of movie or TV show",
  music:
    "Use this category when the event is primarily music being played, such as pre-recorded music or a live band, etc. and is not related to a showing of movie or TV show. Events which contain some music but which a musical performance is not a majority of the event should not use this category.",
  talk: "Use this category when the event is a talk, and is not related to a showing of movie or TV show. Events which contain talks but which a main talk is not a majority of the event should not use this category.",
  workshop:
    "Use this category when the event is a workshop, and is not related to a showing of movie or TV show",
  shorts:
    "Use this category when there is one or more short movies being shown",
  event:
    "Use this category if the event doesn't match any of the other categories",
};

const systemInstruction = `
  Given the following details from a cinema listing, provide a response with no introduction or summary, just JSON response.
  The JSON response must an object which contains a \`category\` string, and your \`confidence\` as a number from 0 to 9 (9 being the most confident).
  The \`category\` property must be one of "${Object.keys(categories).join('", "')}", using "event" if none of the other categories apply or you have a low confidence.
  Here is a description of each of the categories:
  ${JSON.stringify(categories, null, 4)}
`;
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction,
});
const generationConfig = {
  temperature: 0,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

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

  const response = await dailyLlmCache(
    `ask-llm-to-categorise-${getId(prompt)}`,
    async () => {
      console.log(` - Asking LLM to categorise "${movie.title}"`);
      const chatSession = model.startChat({ generationConfig, history: [] });
      const result = await chatSession.sendMessage(prompt);
      const text = result.response
        .text()
        .replace("```json", "")
        .replace("```", "");
      return JSON.parse(text);
    },
  );
  return { ...movie, category: response.category || "event" };
}

module.exports = askLlmToCategorise;
