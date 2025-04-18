const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyCache } = require("./cache");
const { getId, basicNormalize } = require("./utils");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const systemInstruction = `
  Given the following details from a cinema listing, and a JSON list of results from themoviedb, provide a response with no introduction or summary, just JSON response.
  The JSON must contain \`match\` JSON which is a match taken from the JSON list of results from themoviedb and \`confidence\` as a number from 0 to 9 (9 being the most confident).
  If there are no matches (or confidence is 0), then the value of \`match\` may be \`null\`
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

function convertToPrompt(movie, results) {
  const movieYear = movie.year ? `\nYear: ${movie.year}` : "";
  const movieClassification = movie.classification
    ? `\nClassification: ${movie.classification}`
    : "";

  return `
${movie.title}${movieYear}${movieClassification}

${movie.matchingHints.overview}

Using the JSON search response below, see if there is a match for the details above, which are from a cinema listing.

${JSON.stringify(results)}
`.trim();
}

module.exports = async function askLlmToReviewResults(movie, results) {
  const normalizedTitle = basicNormalize(movie.title);
  const isAnniversaryShowing = normalizedTitle.includes("anniversary");
  // If we've no matching hints, don't use LLM
  // If we've no hint overview, don't use LLM unless it's an anniversary showing
  // (in which case the LLM might just get it without the overview hint)
  if (
    !movie.matchingHints ||
    (!movie.matchingHints.overview && !isAnniversaryShowing)
  ) {
    return { match: null, confidence: 0 };
  }

  console.log(`Asking LLM to help match "${movie.title}" with results`);
  const prompt = convertToPrompt(movie, results);

  return dailyCache(`ask-llm-with-results-${getId(prompt)}`, async () => {
    const chatSession = model.startChat({ generationConfig, history: [] });
    const result = await chatSession.sendMessage(prompt);
    const text = result.response
      .text()
      .replace("```json", "")
      .replace("```", "");
    return JSON.parse(text);
  });
};
