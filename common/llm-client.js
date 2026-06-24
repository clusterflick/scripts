const { basicNormalize } = require("./utils");
require("dotenv").config();

// Provider-agnostic LLM client. Every caller imports `callLlm` from here; the
// concrete provider is selected at startup via the LLM_PROVIDER env variable
// ("gemini" by default, or "openai"). Each provider module implements the same
// contract:
//
//   callLlm({ systemInstruction, prompt, cacheKeyPrefix, logMessage,
//             maxOutputTokens, responseSchema }) => Promise<Object>
//
// returning the parsed JSON response, with daily caching handled internally.

const provider = basicNormalize(process.env.LLM_PROVIDER || "gemini");

let impl;
if (provider === "gemini") {
  impl = require("./llm-client-gemini");
} else if (provider === "openai") {
  impl = require("./llm-client-openai");
} else {
  throw new Error(
    `Unknown LLM_PROVIDER "${process.env.LLM_PROVIDER}". Use "gemini" or "openai".`,
  );
}

console.log(` - LLM provider: ${provider}`);

module.exports = { callLlm: impl.callLlm };
