jest.mock("../cache");
jest.mock("@google/generative-ai");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { dailyLlmCache } = require("../cache");
const { getLlmUsageLog, clearLlmUsageLog } = require("../llm-usage-log");

// llm-client-gemini caches its GoogleGenerativeAI client in a module-level
// singleton, so the mock instance (and these spies) has to be fixed up front
// rather than reconfigured per test.
const sendMessage = jest.fn();
const startChat = jest.fn(() => ({ sendMessage }));
const getGenerativeModel = jest.fn(() => ({ startChat }));
GoogleGenerativeAI.mockImplementation(() => ({ getGenerativeModel }));

const { callLlm } = require("../llm-client-gemini");
const { silenceConsoleLog } = require("../test-utils");

silenceConsoleLog();

describe("llm-client-gemini", () => {
  beforeEach(() => {
    clearLlmUsageLog();
    dailyLlmCache.mockReset();
    sendMessage.mockReset();
    getGenerativeModel.mockClear();
    startChat.mockClear();
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

    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash-lite" }),
    );
    expect(getLlmUsageLog()).toEqual([
      {
        cacheKeyPrefix: "ask-llm",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        cacheHit: false,
        promptChars: "prompt".length,
        promptTokens: 42,
        candidatesTokens: 7,
      },
    ]);
  });

  it("records a cache hit with no token usage, but still the prompt size, and makes no API call", async () => {
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
        promptChars: "prompt".length,
      },
    ]);
  });

  it("counts thinking tokens with the candidates, since both are billed as output", async () => {
    dailyLlmCache.mockImplementation((key, retrieve) => retrieve());
    sendMessage.mockResolvedValue({
      response: {
        text: () => "{}",
        usageMetadata: {
          promptTokenCount: 42,
          candidatesTokenCount: 7,
          thoughtsTokenCount: 30,
        },
      },
    });

    await callLlm({
      systemInstruction: "system",
      prompt: "prompt",
      cacheKeyPrefix: "identify-multiple-movies",
      logMessage: "Identifying",
      preferCapableModel: true,
    });

    expect(getLlmUsageLog()).toEqual([
      expect.objectContaining({ promptTokens: 42, candidatesTokens: 37 }),
    ]);
  });

  it("sets a thinking level only for the capable model", async () => {
    dailyLlmCache.mockImplementation((key, retrieve) => retrieve());
    sendMessage.mockResolvedValue({
      response: {
        text: () => "{}",
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    });
    await callLlm({
      systemInstruction: "system",
      prompt: "prompt",
      cacheKeyPrefix: "ask-llm",
      logMessage: "Asking",
    });
    await callLlm({
      systemInstruction: "system",
      prompt: "prompt",
      cacheKeyPrefix: "identify-multiple-movies",
      logMessage: "Identifying",
      preferCapableModel: true,
    });

    const [defaultCall, capableCall] = startChat.mock.calls;
    expect(defaultCall[0].generationConfig).not.toHaveProperty(
      "thinkingConfig",
    );
    expect(capableCall[0].generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "LOW",
    });
  });

  it("uses the capable model and a distinct cache key when preferCapableModel is set", async () => {
    dailyLlmCache.mockImplementation((key, retrieve) => retrieve());
    sendMessage.mockResolvedValue({
      response: {
        text: () => "{}",
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    });

    await callLlm({
      systemInstruction: "system",
      prompt: "prompt",
      cacheKeyPrefix: "identify-multiple-movies",
      logMessage: "Identifying",
      preferCapableModel: true,
    });

    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.8-flash" }),
    );
    expect(getLlmUsageLog()).toEqual([
      expect.objectContaining({ model: "gemini-3.8-flash" }),
    ]);
  });
});
