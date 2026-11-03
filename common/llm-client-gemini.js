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

const MODEL = "gemini-2.5-flash-lite";

// A capability step up over the default, for tasks like naming every film in
// a marathon/franchise event ("the first 8 chapters", no per-film synopsis) -
// world knowledge Flash-Lite unreliably recalls. Callers request it with
// `preferCapableModel` rather than a raw model name, since that name is
// Gemini-specific and callLlm also has an OpenAI implementation.
//
// Not a Lite model: gemini-2.5-flash, which this was, shuts down on 2026-12-01
// and Google redirects it to gemini-3.5-flash-lite - the tier this exists to
// step up from.
const CAPABLE_MODEL = "gemini-3.8-flash";

// Gemini 3 models think at a model-dependent default, billed as output. For
// 3.8 Flash that is "MEDIUM", and it is set explicitly because it was measured
// against "LOW" on multi-film listings: both recalled the same films, but
// MEDIUM named under half as many films the listing didn't screen and changed
// answer between identical calls half as often. Set per model because
// thinkingLevel is an error on 2.5 models, which MODEL still is.
//
// The pipeline's capable tier is OpenAI's by default (CAPABLE_LLM_PROVIDER in
// ./llm-client.js); this is what it gets when that is set to "gemini".
const THINKING_LEVEL = { [CAPABLE_MODEL]: "MEDIUM" };

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
  preferCapableModel = false,
}) {
  const model = preferCapableModel ? CAPABLE_MODEL : MODEL;

  // Namespace by provider + model so it's clear which model produced each cache
  // file, and so switching models never replays another model's cached answers.
  const cacheKey = `${cacheKeyPrefix}-gemini-${model}-${getId(`${systemInstruction}\n${prompt}`)}`;

  // Only set when the cache misses and an API call actually happens; a cache
  // hit costs nothing and has no usage to report.
  let usage;

  const response = await dailyLlmCache(cacheKey, async () => {
    console.log(` - ${logMessage}`);

    const generativeModel = getGenAI().getGenerativeModel({
      model,
      systemInstruction,
    });

    const config = { ...generationConfig };
    if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens;
    if (THINKING_LEVEL[model]) {
      config.thinkingConfig = { thinkingLevel: THINKING_LEVEL[model] };
    }
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }
    const chatSession = generativeModel.startChat({
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
    model,
    cacheHit: usage === undefined,
    // Known before the cache is even consulted, so recorded on hits too - a
    // large prompt still costs nothing on a hit, but the same listing will
    // cost real tokens the day the cache expires.
    promptChars: prompt.length,
    ...(usage && {
      promptTokens: usage.promptTokenCount,
      // Thinking is billed as output but reported apart from the response
      // candidates, so the usage report counts it with them.
      candidatesTokens:
        usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0),
    }),
  });

  return response;
}

module.exports = { callLlm };
