const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyCache } = require("./cache");
const { getId } = require("./utils");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const systemInstruction = `
  Given the following details from a cinema listing, provide a response with no introduction or summary, just JSON response.
  The JSON must contain \`isMovie\` boolean on whether it's a movie and \`confidence\` as a number from 0 to 9 (9 being the most confident).
  Take the date that this request is being made into account when considering which movies could match this data. Short names which match older movies may also be referencing mmovies which are currently in the cinema. You should weigh movies currently in the cinema more heavily in your returned matches.
  If \`isMovie\` is true, the response must have a \`matches\` array of possible matches (up to 5) ordered from most to least likely. Otherwise, do not include a matches array.
  Each match must include a \`isKnownMovie\` boolean on whether you know the movie being referenced, or are relying on the input content for the properties defined next.
  If \`isKnownMovie\` is true, then each match must include the properties \`title\` (in original language), \`year\` of initial release (leave blank if uncertain), \`directors\` as an array of director names and \`cast\` as an array of cast member names.
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
  const movieYear = movie.year ? ` (${movie.year})` : "";
  const movieClassification = movie.classification
    ? `[${movie.classification}]`
    : "";
  return `
${movie.title}${movieYear}${movieClassification}
${movie.matchingHints.overview}
`.trim();
}

module.exports = async function askLlm(movie) {
  if (!movie.matchingHints?.overview) {
    return { isMovie: false, confidence: 0 };
  }

  console.log(`Asking LLM to help match "${movie.title}"`);
  const prompt = convertToPrompt(movie);

  return dailyCache(`ask-llm-${getId(prompt)}`, async () => {
    const chatSession = model.startChat({ generationConfig, history: [] });
    const result = await chatSession.sendMessage(prompt);
    const text = result.response
      .text()
      .replace("```json", "")
      .replace("```", "");
    return JSON.parse(text);
  });
};
