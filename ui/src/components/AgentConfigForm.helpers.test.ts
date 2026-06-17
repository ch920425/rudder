import { describe, expect, it } from "vitest";
import {
  explicitProviderModelError,
  isProviderModelFormat,
  requiresExplicitProviderModel,
  runtimeModelEmptyLabel,
  runtimeModelEmptyMessage,
  runtimeModelSearchPlaceholder,
} from "../lib/runtime-models";
import { defaultCommandForRuntime, defaultConfigForRuntime, defaultModelForRuntime } from "./AgentConfigForm.helpers";

describe("AgentConfigForm runtime defaults", () => {
  it("uses cursor-agent for new Cursor agents", () => {
    expect(defaultCommandForRuntime("cursor")).toBe("cursor-agent");
    expect(defaultConfigForRuntime("cursor")).toMatchObject({
      command: "cursor-agent",
    });
  });

  it("keeps Codex subscription cost estimation disabled by default", () => {
    expect(defaultConfigForRuntime("codex_local")).toMatchObject({
      countSubscriptionUsageAsCost: false,
    });
  });

  it("uses locally runnable default models for OpenCode and Pi", () => {
    expect(defaultModelForRuntime("opencode_local")).toBe("opencode/deepseek-v4-flash-free");
    expect(defaultConfigForRuntime("opencode_local")).toMatchObject({
      model: "opencode/deepseek-v4-flash-free",
    });
    expect(defaultConfigForRuntime("opencode_local")).not.toHaveProperty("dangerouslySkipPermissions");

    expect(defaultModelForRuntime("pi_local")).toBe("kimi-coding/kimi-for-coding");
    expect(defaultConfigForRuntime("pi_local")).toMatchObject({
      model: "kimi-coding/kimi-for-coding",
    });
  });

  it("treats Pi and OpenCode models as explicit custom provider/model inputs", () => {
    expect(requiresExplicitProviderModel("opencode_local")).toBe(true);
    expect(requiresExplicitProviderModel("pi_local")).toBe(true);
    expect(requiresExplicitProviderModel("claude_local")).toBe(false);
    expect(runtimeModelEmptyLabel("pi_local")).toBe("Select or enter provider/model");
    expect(runtimeModelSearchPlaceholder("opencode_local")).toBe("Search or enter provider/model...");
    expect(runtimeModelEmptyMessage("pi_local")).toContain("pi --list-models");
    expect(runtimeModelEmptyMessage("opencode_local")).toContain("opencode models");
    expect(explicitProviderModelError("pi_local")).toContain("provider/model");
    expect(isProviderModelFormat("deepseek/deepseek-chat")).toBe(true);
    expect(isProviderModelFormat("deepseek-chat")).toBe(false);
    expect(isProviderModelFormat("deepseek/")).toBe(false);
  });
});
