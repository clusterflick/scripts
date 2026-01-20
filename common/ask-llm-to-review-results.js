const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyLlmCache } = require("./cache");
const { getId, basicNormalize } = require("./utils");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const systemInstruction = `
  Given the following details from a cinema listing, and a JSON list of results from themoviedb, provide a response with no introduction or summary, just JSON response.
  The JSON must contain \`match\` JSON which is a match taken from the JSON list of results from themoviedb and \`confidence\` as a number from 0 to 9 (9 being the most confident).
  If there are no matches (or confidence is 0), then the value of \`match\` may be \`null\`
`;

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  systemInstruction,
});

const generationConfig = {
  temperature: 0,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

function convertToPrompt(movie, results, normalizedTitle) {
  const movieYear = movie.year ? `Year: ${movie.year}\n` : "";
  const movieClassification = movie.classification
    ? `Classification: ${movie.classification}\n`
    : "";

  return `
Title: ${normalizedTitle}
${movieYear}${movieClassification}
Overview from the cinema listing, contained between the "---" delimeters:
---
${movie.matchingHints.overview}
---

Using the JSON search response below, see if there is a match for the details above, which are from a cinema listing. The "overview" value for each result in the JSON will contain details to match on.
Phrases in the cinema listing above which are an exact match to phrases in the "overview" value should be considered a strong indicator of matching.
Take todays date into account when considering which movie could match this cinema listing. Movies which are not released yet, or have release dates more than a year in the future are unlikely to be good matches.

${JSON.stringify(
  results.map(
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
  ),
  null,
  2,
)}
`.trim();
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

  return dailyLlmCache(`ask-llm-with-results-${getId(prompt)}`, async () => {
    console.log(` - Asking LLM to match "${movie.title}" against results`);
    const chatSession = model.startChat({ generationConfig, history: [] });
    const result = await chatSession.sendMessage(prompt);
    const text = result.response
      .text()
      .replace(/"backdrop_path": "[^,]+,\n/i, "") // Fix for specific LLM issue which generated invalid JSON
      .replace("```json", "")
      .replace("```", "");
    try {
      const answer = JSON.parse(text);
      return answer;
    } catch (e) {
      console.log("Error parsing LLM answer, full response below:");
      console.log("----------------------------------------------");
      console.log(result.response.text());
      console.log("----------------------------------------------");
      throw e;
    }
  });
};
