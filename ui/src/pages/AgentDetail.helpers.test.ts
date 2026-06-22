import { describe, expect, it } from "vitest";
import { readInvocationAgentInstructionStack } from "./AgentDetail.helpers";

describe("readInvocationAgentInstructionStack", () => {
  it("prefers the explicit full instruction stack over the legacy prompt", () => {
    expect(readInvocationAgentInstructionStack({
      prompt: "Follow the heartbeat.",
      agentInstructionStack: "# Rudder Agent Operating Contract\n\n# SOUL.md",
    })).toBe("# Rudder Agent Operating Contract\n\n# SOUL.md");
  });

  it("falls back to prompt for older adapter invoke events", () => {
    expect(readInvocationAgentInstructionStack({
      prompt: "Legacy invocation prompt",
    })).toBe("Legacy invocation prompt");
  });
});
