import { describe, expect, it } from "vitest";
import { resolveSourceBadge } from "./source-badge";

describe("resolveSourceBadge", () => {
  it("detects Feishu from flat source metadata", () => {
    expect(resolveSourceBadge({ source: "agent_integration", provider: "feishu" })).toEqual({
      key: "feishu",
      label: "Feishu",
    });
  });

  it("detects Feishu from nested source metadata", () => {
    expect(resolveSourceBadge({ integration: { provider: "feishu" } })).toEqual({
      key: "feishu",
      label: "Feishu",
    });
  });

  it("returns null when no supported source is present", () => {
    expect(resolveSourceBadge({ source: "manual" })).toBeNull();
  });
});
