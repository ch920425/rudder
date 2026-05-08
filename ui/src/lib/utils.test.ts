import { describe, expect, it } from "vitest";

import { formatTokens } from "./utils";

describe("formatTokens", () => {
  it("uses billion units for billion-scale token counts", () => {
    expect(formatTokens(1_535_400_000)).toBe("1.5B");
    expect(formatTokens(1_000_000_000)).toBe("1.0B");
  });

  it("keeps existing million, thousand, and raw count formatting", () => {
    expect(formatTokens(999_900_000)).toBe("999.9M");
    expect(formatTokens(1_535_400)).toBe("1.5M");
    expect(formatTokens(1_200)).toBe("1.2k");
    expect(formatTokens(999)).toBe("999");
  });
});
