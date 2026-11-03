const { basicNormalize } = require("./utils");
require("dotenv").config();

// Provider-agnostic LLM client. Every caller imports `callLlm` from here; the
// concrete provider is selected at startup by env variable. Each provider
// module implements the same contract:
//
//   callLlm({ systemInstruction, prompt, cacheKeyPrefix, logMessage,
//             maxOutputTokens, responseSchema, preferCapableModel })
//     => Promise<Object>
//
// returning the parsed JSON response, with daily caching handled internally.
//
// The two tiers are chosen separately. LLM_PROVIDER ("gemini" by default, or
// "openai") answers ordinary calls. CAPABLE_LLM_PROVIDER ("openai" by default,
// or "gemini") answers calls made with `preferCapableModel` - the
// knowledge-recall step that names every film in a marathon - because on that
// task gpt-6.1-terra matched the best of nine setups at a third of the cost of
// the best Gemini one. Each provider's own CAPABLE_MODEL is what that tier
// gets, so setting it to "gemini" goes back to Gemini's.

const PROVIDERS = {
  gemini: () => require("./llm-client-gemini"),
  openai: () => require("./llm-client-openai"),
};

function selectProvider(variable, defaultProvider) {
  const name = basicNormalize(process.env[variable] || defaultProvider);
  if (!PROVIDERS[name]) {
    throw new Error(
      `Unknown ${variable} "${process.env[variable]}". Use "gemini" or "openai".`,
    );
  }
  return name;
}

const provider = selectProvider("LLM_PROVIDER", "gemini");
const capableProvider = selectProvider("CAPABLE_LLM_PROVIDER", "openai");
const impl = PROVIDERS[provider]();
const capableImpl = PROVIDERS[capableProvider]();

console.log(` - LLM provider: ${provider} (capable: ${capableProvider})`);

function callLlm(args) {
  return (args.preferCapableModel ? capableImpl : impl).callLlm(args);
}

module.exports = { callLlm };
