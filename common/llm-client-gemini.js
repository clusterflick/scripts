const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyLlmCache } = require("./cache");
const { getId } = require("./utils");
const { parseLlmJson } = require("./parse-llm-json");
const { recordLlmUsage } = require("./llm-usage-log");
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

// Flash-Lite was undercounting films it should be able to name from world
// knowledge alone - e.g. missing several entries of a franchise marathon
// described only as "the first 8 chapters" plus a couple of cast names, with
// no per-film synopsis to fall back on. Flash trades 3x the input cost and
// ~6x the output cost for a real step up in that kind of knowledge-recall
// task. The cache key includes the model name, so switching here never
// replays Flash-Lite's cached answers.
const MODEL = "gemini-2.5-flash";

/**
 * Call Gemini with caching and standard configuration. See ./llm-client.js for
 * the provider-agnostic contract this implements.
 */
async function callLlm({
  systemInstruction,
  prompt,
  cacheKeyPrefix,
  logMessage,
  maxOutputTokens,
  responseSchema,
}) {
  // Namespace by provider + model so it's clear which model produced each cache
  // file, and so switching models never replays another model's cached answers.
  const cacheKey = `${cacheKeyPrefix}-gemini-${MODEL}-${getId(`${systemInstruction}\n${prompt}`)}`;

  // Only set when the cache misses and an API call actually happens; a cache
  // hit costs nothing and has no usage to report.
  let usage;

  const response = await dailyLlmCache(cacheKey, async () => {
    console.log(` - ${logMessage}`);

    const model = getGenAI().getGenerativeModel({
      model: MODEL,
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
    usage = result.response.usageMetadata;
    return parseLlmJson(result.response.text());
  });

  recordLlmUsage({
    cacheKeyPrefix,
    provider: "gemini",
    model: MODEL,
    cacheHit: usage === undefined,
    // Known before the cache is even consulted, so recorded on hits too - a
    // large prompt still costs nothing on a hit, but the same listing will
    // cost real tokens the day the cache expires.
    promptChars: prompt.length,
    ...(usage && {
      promptTokens: usage.promptTokenCount,
      candidatesTokens: usage.candidatesTokenCount,
    }),
  });

  return response;
}

module.exports = { callLlm };
