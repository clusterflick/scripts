const OpenAI = require("openai");
const { dailyLlmCache } = require("./cache");
const { getId } = require("./utils");
const { parseLlmJson } = require("./parse-llm-json");
const { recordLlmUsage } = require("./llm-usage-log");
require("dotenv").config();

// "gpt-6-luna" for near price parity with Gemini Flash-Lite. gpt-4.1-nano,
// which this was, was scheduled to shut down on 2026-10-23; OpenAI named
// gpt-5.6-luna as its substitute, but at twice the input price of the newer
// gpt-6-luna, its pick for the rest of the GPT-4 series. The cache key
// includes the model name, so switching here never reuses another model's
// cached answers.
const MODEL = "gpt-6-luna";

// A capability step up over the default - see CAPABLE_MODEL in
// llm-client-gemini.js for what it's for. Callers request it with
// `preferCapableModel` rather than a raw model name, since that name is
// provider-specific. Replaces gpt-4.1-mini, shutting down 2027-01-14.
const CAPABLE_MODEL = "gpt-6.1-terra";

// Both are reasoning models, whose effort defaults to medium and is billed
// as output. "none" keeps the default model where gpt-4.1-nano was - no
// reasoning, temperature 0 - while the capable model reasons a little, as its
// Gemini counterpart thinks a little. OpenAI accepts temperature only at
// "none", so it is sent only there.
const REASONING_EFFORT = { [MODEL]: "none", [CAPABLE_MODEL]: "low" };

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Call OpenAI with caching and standard configuration. See ./llm-client.js for
 * the provider-agnostic contract this implements.
 *
 * Note on `responseSchema`: that argument is Gemini's enforced-schema format and
 * isn't portable to OpenAI's strict structured outputs (which reject `nullable`,
 * `maxItems`, optional fields, etc.). Every prompt in this codebase already asks
 * for JSON, so we use OpenAI's JSON mode plus the shared parser/repair instead —
 * mirroring how the match path already works without a schema. If OpenAI is
 * promoted to primary, revisit this with translated strict schemas.
 */
async function callLlm({
  systemInstruction,
  prompt,
  cacheKeyPrefix,
  logMessage,
  maxOutputTokens,
  // eslint-disable-next-line no-unused-vars
  responseSchema,
  preferCapableModel = false,
}) {
  const model = preferCapableModel ? CAPABLE_MODEL : MODEL;

  // Namespace by provider + model so switching providers (or models) never
  // replays another provider's cached answers — essential for a fair A/B.
  const cacheKey = `${cacheKeyPrefix}-openai-${model}-${getId(`${systemInstruction}\n${prompt}`)}`;

  // Only set when the cache misses and an API call actually happens; a cache
  // hit costs nothing and has no usage to report.
  let usage;

  const response = await dailyLlmCache(cacheKey, async () => {
    console.log(` - ${logMessage}`);

    // JSON mode requires the word "json" somewhere in the messages; append an
    // explicit instruction so it's guaranteed regardless of the caller's prompt.
    const jsonSystemInstruction = `${systemInstruction}\n\nRespond with a single valid JSON object and nothing else.`;

    const reasoningEffort = REASONING_EFFORT[model];
    const completion = await getClient().chat.completions.create({
      model,
      reasoning_effort: reasoningEffort,
      ...(reasoningEffort === "none" && { temperature: 0 }),
      max_completion_tokens: maxOutputTokens || 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: jsonSystemInstruction },
        { role: "user", content: prompt },
      ],
    });

    usage = completion.usage;
    return parseLlmJson(completion.choices[0].message.content);
  });

  recordLlmUsage({
    cacheKeyPrefix,
    provider: "openai",
    model,
    cacheHit: usage === undefined,
    // Known before the cache is even consulted, so recorded on hits too - a
    // large prompt still costs nothing on a hit, but the same listing will
    // cost real tokens the day the cache expires.
    promptChars: prompt.length,
    ...(usage && {
      promptTokens: usage.prompt_tokens,
      candidatesTokens: usage.completion_tokens,
    }),
  });

  return response;
}

module.exports = { callLlm };
