import { describe, expect, it } from "vitest";
import { summarizeTokenUsage, tokenUsageCacheRatio } from "./token-usage.js";

describe("token usage helpers", () => {
  it("treats cached input as a subset of total input tokens", () => {
    const summary = summarizeTokenUsage({
      inputTokens: 498_406,
      cachedInputTokens: 457_856,
      outputTokens: 6_588,
    });

    expect(summary).toMatchObject({
      inputTokens: 498_406,
      cachedInputTokens: 457_856,
      outputTokens: 6_588,
      uncachedInputTokens: 40_550,
      promptTokens: 498_406,
      totalTokens: 504_994,
    });
    expect(tokenUsageCacheRatio(summary)).toBeCloseTo(0.9186, 4);
  });

  it("falls back to additive prompt tokens when cached exceeds input", () => {
    const summary = summarizeTokenUsage({
      inputTokens: 100,
      cachedInputTokens: 250,
      outputTokens: 25,
    });

    expect(summary.promptTokens).toBe(350);
    expect(summary.totalTokens).toBe(375);
  });
});
