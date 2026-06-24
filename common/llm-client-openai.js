const OpenAI = require("openai");
const { dailyLlmCache } = require("./cache");
const { getId } = require("./utils");
const { parseLlmJson } = require("./parse-llm-json");
require("dotenv").config();

// Swap this in code to A/B different tiers, e.g. "gpt-4.1-nano" for price parity
// with Gemini Flash-Lite, "gpt-4.1-mini" for a capability step up. The cache key
// includes the model name, so switching here never reuses another model's
// cached answers.
const MODEL = "gpt-4.1-nano";

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
}) {
  // Namespace by provider + model so switching providers (or models) never
  // replays another provider's cached answers — essential for a fair A/B.
  const cacheKey = `${cacheKeyPrefix}-openai-${MODEL}-${getId(`${systemInstruction}\n${prompt}`)}`;

  return dailyLlmCache(cacheKey, async () => {
    console.log(` - ${logMessage}`);

    // JSON mode requires the word "json" somewhere in the messages; append an
    // explicit instruction so it's guaranteed regardless of the caller's prompt.
    const jsonSystemInstruction = `${systemInstruction}\n\nRespond with a single valid JSON object and nothing else.`;

    const completion = await getClient().chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_completion_tokens: maxOutputTokens || 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: jsonSystemInstruction },
        { role: "user", content: prompt },
      ],
    });

    return parseLlmJson(completion.choices[0].message.content);
  });
}

module.exports = { callLlm };
