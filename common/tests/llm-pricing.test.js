const { estimateCostUsd } = require("../llm-pricing");

describe("estimateCostUsd", () => {
  it("prices a known provider/model from tokens", () => {
    const cost = estimateCostUsd(
      "gemini",
      "gemini-2.5-flash-lite",
      1_000_000,
      1_000_000,
    );

    expect(cost).toBeCloseTo(0.1 + 0.4, 10);
  });

  it("scales linearly with token counts", () => {
    const cost = estimateCostUsd("gemini", "gemini-2.5-flash-lite", 500_000, 0);

    expect(cost).toBeCloseTo(0.05, 10);
  });

  it("is undefined for a provider/model with no listed price", () => {
    expect(
      estimateCostUsd("gemini", "gemini-9000", 1000, 1000),
    ).toBeUndefined();
    expect(estimateCostUsd("anthropic", "claude", 1000, 1000)).toBeUndefined();
  });
});
