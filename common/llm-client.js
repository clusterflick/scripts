const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyLlmCache } = require("./cache");
const { getId } = require("./utils");
require("dotenv").config();

let genAI = null;

function getGenAI() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const generationConfig = {
  temperature: 0,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

function parseJsonResponse(text) {
  return text.replace("```json", "").replace("```", "");
}

/**
 * Call the LLM with caching and standard configuration.
 *
 * @param {Object} options
 * @param {string} options.systemInstruction - The system instruction for the model
 * @param {string} options.prompt - The prompt to send
 * @param {string} options.cacheKeyPrefix - Prefix for the cache key
 * @param {string} options.logMessage - Message to log when making a fresh call
 * @param {function} [options.parseResponse] - Optional custom response parser (receives raw text, should return parsed object)
 * @returns {Promise<Object>} Parsed JSON response from the LLM
 */
async function callLlm({
  systemInstruction,
  prompt,
  cacheKeyPrefix,
  logMessage,
  parseResponse,
}) {
  const cacheKey = `${cacheKeyPrefix}-${getId(`${systemInstruction}\n${prompt}`)}`;

  return dailyLlmCache(cacheKey, async () => {
    console.log(` - ${logMessage}`);

    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction,
    });

    const chatSession = model.startChat({ generationConfig, history: [] });
    const result = await chatSession.sendMessage(prompt);
    const text = parseJsonResponse(result.response.text());

    if (parseResponse) {
      return parseResponse(text, result);
    }

    return JSON.parse(text);
  });
}

module.exports = { callLlm };
