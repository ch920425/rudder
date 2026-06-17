import { describe, expect, it } from "vitest";
import { buildPiLocalConfig } from "./build-config.js";

describe("buildPiLocalConfig", () => {
  it("preserves provider credentials as secret env bindings", () => {
    const config = buildPiLocalConfig({
      agentRuntimeType: "pi_local",
      cwd: "",
      instructionsFilePath: "",
      promptTemplate: "",
      model: "deepseek/deepseek-chat",
      modelFallbacks: [],
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      countSubscriptionUsageAsCost: false,
      dangerouslyBypassSandbox: false,
      command: "pi",
      args: "",
      extraArgs: "",
      envVars: "DEEPSEEK_API_KEY=legacy-plain-value",
      envBindings: {
        DEEPSEEK_API_KEY: {
          type: "secret_ref",
          secretId: "11111111-1111-1111-1111-111111111111",
          version: "latest",
        },
      },
      url: "",
      bootstrapPrompt: "",
      payloadTemplateJson: "",
      workspaceStrategyType: "project_primary",
      workspaceBaseRef: "",
      workspaceBranchTemplate: "",
      worktreeParentDir: "",
      runtimeServicesJson: "",
      maxTurnsPerRun: 300,
      heartbeatEnabled: false,
      intervalSec: 300,
      preflightEnabled: true,
      maxConcurrentRuns: 1,
    });

    expect(config.env).toMatchObject({
      DEEPSEEK_API_KEY: {
        type: "secret_ref",
        secretId: "11111111-1111-1111-1111-111111111111",
        version: "latest",
      },
    });
  });
});
