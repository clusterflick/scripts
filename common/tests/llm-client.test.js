jest.mock("../llm-client-gemini", () => ({ callLlm: jest.fn(() => "gemini") }));
jest.mock("../llm-client-openai", () => ({ callLlm: jest.fn(() => "openai") }));

const { silenceConsoleLog } = require("../test-utils");

silenceConsoleLog();

// llm-client picks its providers when it loads, so each case loads it afresh
// under the environment it is testing.
function loadWith(env) {
  const saved = { ...process.env };
  delete process.env.LLM_PROVIDER;
  delete process.env.CAPABLE_LLM_PROVIDER;
  Object.assign(process.env, env);
  try {
    let client;
    jest.isolateModules(() => {
      client = require("../llm-client");
    });
    return client;
  } finally {
    process.env = saved;
  }
}

describe("llm-client", () => {
  it("answers ordinary calls with Gemini and capable calls with OpenAI by default", () => {
    const { callLlm } = loadWith({});

    expect(callLlm({ prompt: "p" })).toBe("gemini");
    expect(callLlm({ prompt: "p", preferCapableModel: true })).toBe("openai");
  });

  it("chooses each tier's provider from its own variable", () => {
    const { callLlm } = loadWith({
      LLM_PROVIDER: "openai",
      CAPABLE_LLM_PROVIDER: "gemini",
    });

    expect(callLlm({ prompt: "p" })).toBe("openai");
    expect(callLlm({ prompt: "p", preferCapableModel: true })).toBe("gemini");
  });

  it("refuses a provider it doesn't know rather than falling back", () => {
    expect(() => loadWith({ CAPABLE_LLM_PROVIDER: "anthropic" })).toThrow(
      'Unknown CAPABLE_LLM_PROVIDER "anthropic"',
    );
  });
});
