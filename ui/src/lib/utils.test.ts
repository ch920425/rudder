import { describe, expect, it } from "vitest";

import { formatDateTimeSeconds, formatTokens } from "./utils";

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

describe("formatDateTimeSeconds", () => {
  it("formats local date-time values with fixed seconds", () => {
    expect(formatDateTimeSeconds(new Date(2026, 4, 11, 12, 35, 18))).toBe("2026-05-11 12:35:18");
    expect(formatDateTimeSeconds(new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02 03:04:05");
  });
});
