const {
  recordLlmUsage,
  getLlmUsageLog,
  clearLlmUsageLog,
} = require("../llm-usage-log");

describe("llm-usage-log", () => {
  beforeEach(() => {
    clearLlmUsageLog();
  });

  it("starts empty", () => {
    expect(getLlmUsageLog()).toEqual([]);
  });

  it("collects records in the order they were recorded", () => {
    const first = { cacheKeyPrefix: "ask-llm", cacheHit: true };
    const second = { cacheKeyPrefix: "identify-shorts", cacheHit: false };

    recordLlmUsage(first);
    recordLlmUsage(second);

    expect(getLlmUsageLog()).toEqual([first, second]);
  });

  it("clears back to empty", () => {
    recordLlmUsage({ cacheKeyPrefix: "ask-llm", cacheHit: true });
    clearLlmUsageLog();

    expect(getLlmUsageLog()).toEqual([]);
  });
});
