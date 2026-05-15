import { describe, expect, it } from "vitest";

import { shouldShowRunStderrExcerpt } from "./run-detail-display";

describe("shouldShowRunStderrExcerpt", () => {
  it("does not promote stderr excerpts for successful runs", () => {
    expect(shouldShowRunStderrExcerpt({
      status: "succeeded",
      stderrExcerpt: "2026-05-15 ERROR rmcp::transport::worker: worker quit with fatal",
    })).toBe(false);
  });

  it("shows stderr excerpts for failed and timed-out runs", () => {
    expect(shouldShowRunStderrExcerpt({
      status: "failed",
      stderrExcerpt: "runtime failed",
    })).toBe(true);

    expect(shouldShowRunStderrExcerpt({
      status: "timed_out",
      stderrExcerpt: "runtime stopped responding",
    })).toBe(true);
  });

  it("ignores empty stderr excerpts", () => {
    expect(shouldShowRunStderrExcerpt({
      status: "failed",
      stderrExcerpt: "  ",
    })).toBe(false);
  });
});
