jest.mock("../cache");
jest.mock("@google/generative-ai");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyLlmCache } = require("../cache");
const { getLlmUsageLog, clearLlmUsageLog } = require("../llm-usage-log");

// llm-client-gemini caches its GoogleGenerativeAI client in a module-level
// singleton, so the mock instance (and this sendMessage spy) has to be fixed
// up front rather than reconfigured per test.
const sendMessage = jest.fn();
GoogleGenerativeAI.mockImplementation(() => ({
  getGenerativeModel: () => ({
    startChat: () => ({ sendMessage }),
  }),
}));

const { callLlm } = require("../llm-client-gemini");

describe("llm-client-gemini", () => {
  beforeEach(() => {
    clearLlmUsageLog();
    dailyLlmCache.mockReset();
    sendMessage.mockReset();
  });

  it("records an uncached call's token usage against its cacheKeyPrefix", async () => {
    dailyLlmCache.mockImplementation((key, retrieve) => retrieve());
    sendMessage.mockResolvedValue({
      response: {
        text: () => "{}",
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 7 },
      },
    });

    await callLlm({
      systemInstruction: "system",
      prompt: "prompt",
      cacheKeyPrefix: "ask-llm",
      logMessage: "Asking",
    });

    expect(getLlmUsageLog()).toEqual([
      {
        cacheKeyPrefix: "ask-llm",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        cacheHit: false,
        promptTokens: 42,
        candidatesTokens: 7,
      },
    ]);
  });

  it("records a cache hit with no token usage, and makes no API call", async () => {
    dailyLlmCache.mockImplementation(() => Promise.resolve({ cached: true }));

    const result = await callLlm({
      systemInstruction: "system",
      prompt: "prompt",
      cacheKeyPrefix: "ask-llm",
      logMessage: "Asking",
    });

    expect(result).toEqual({ cached: true });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(getLlmUsageLog()).toEqual([
      {
        cacheKeyPrefix: "ask-llm",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        cacheHit: true,
      },
    ]);
  });
});
