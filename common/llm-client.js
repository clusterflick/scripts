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

/**
 * Call the LLM with caching and standard configuration.
 *
 * @param {Object} options
 * @param {string} options.systemInstruction - The system instruction for the model
 * @param {string} options.prompt - The prompt to send
 * @param {string} options.cacheKeyPrefix - Prefix for the cache key
 * @param {string} options.logMessage - Message to log when making a fresh call
 * @param {number} [options.maxOutputTokens] - Override default max output tokens
 * @param {Object} [options.responseSchema] - OpenAPI schema for structured JSON output
 * @returns {Promise<Object>} Parsed JSON response from the LLM
 */
async function callLlm({
  systemInstruction,
  prompt,
  cacheKeyPrefix,
  logMessage,
  maxOutputTokens,
  responseSchema,
}) {
  const cacheKey = `${cacheKeyPrefix}-${getId(`${systemInstruction}\n${prompt}`)}`;

  return dailyLlmCache(cacheKey, async () => {
    console.log(` - ${logMessage}`);

    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction,
    });

    const config = { ...generationConfig };
    if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens;
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }
    const chatSession = model.startChat({
      generationConfig: config,
      history: [],
    });
    const result = await chatSession.sendMessage(prompt);
    const response = result.response.text();
    // Unwrap the string if it's been wrapped in markdown block
    const jsonString = response.replace("```json", "").replace("```", "");

    try {
      return JSON.parse(jsonString);
    } catch {
      // Fall through to apply corrections
    }

    const correctedJsonString = jsonString
      // Apply corrections for malformed escape characters (perhaps due to truncation)
      .replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, "")
      // Apply corrections for hallucinated invalid additions
      .replace(/"backdrop_path": "[^,]+,\n/i, "")
      // Fix unescaped quotes within the "reason" field value
      // Match from "reason":" to the closing quote followed by , or }
      .replace(
        /"reason"\s*:\s*"(.*)"\s*([,}])/,
        (_match, reasonContent, terminator) => {
          // Escape any unescaped internal quotes (not already escaped)
          const fixed = reasonContent.replace(/(?<!\\)"/g, '\\"');
          return `"reason":"${fixed}"${terminator}`;
        },
      );

    try {
      return JSON.parse(correctedJsonString);
    } catch (e) {
      console.log("Error parsing LLM answer");
      console.log("--- Original response: -----------------------");
      console.log(response);
      console.log("--- Corrected response: ----------------------");
      console.log(correctedJsonString);
      console.log("----------------------------------------------");
      throw e;
    }
  });
}

module.exports = { callLlm };
