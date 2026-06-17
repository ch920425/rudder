import { testEnvironment } from "@rudderhq/agent-runtime-opencode-local/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("opencode_local environment diagnostics", () => {
  it("reports a missing working directory as an error when cwd is absolute", async () => {
    const cwd = path.join(
      os.tmpdir(),
      `rudder-opencode-local-cwd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      "workspace",
    );

    await fs.rm(path.dirname(cwd), { recursive: true, force: true });

    const result = await testEnvironment({
      orgId: "organization-1",
      agentRuntimeType: "opencode_local",
      config: {
        command: process.execPath,
        cwd,
      },
    });

    expect(result.checks.some((check) => check.code === "opencode_cwd_invalid")).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(true);
    expect(result.status).toBe("fail");
  });

  it("treats an empty OPENAI_API_KEY override as missing", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-empty-key-"));
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-host-value";

    try {
      const result = await testEnvironment({
        orgId: "organization-1",
        agentRuntimeType: "opencode_local",
        config: {
          command: process.execPath,
          cwd,
          env: {
            OPENAI_API_KEY: "",
          },
        },
      });

      const missingCheck = result.checks.find((check) => check.code === "opencode_openai_api_key_missing");
      expect(missingCheck).toBeTruthy();
      expect(missingCheck?.hint).toContain("empty");
    } finally {
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it("classifies model-not-found probe output as model-unavailable warning", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-probe-cwd-"));
    const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-probe-bin-"));
    const fakeOpencode = path.join(binDir, "opencode");
    const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "models") {
  console.error("ProviderModelNotFoundError: ProviderModelNotFoundError");
  console.error("data: { providerID: \\"openai\\", modelID: \\"gpt-5.3-codex\\", suggestions: [] }");
  process.exit(1);
}
if (args[0] === "run") {
  console.log(JSON.stringify({
    type: "error",
    error: { data: { message: "Model not found: deepseek/deepseek-chat. Did you mean: deepseek-chat?" } },
  }));
  process.exit(1);
}
process.exit(1);
`;

    try {
      await fs.writeFile(fakeOpencode, script, "utf8");
      await fs.chmod(fakeOpencode, 0o755);

      const result = await testEnvironment({
        orgId: "organization-1",
        agentRuntimeType: "opencode_local",
        config: {
          command: fakeOpencode,
          cwd,
          model: "deepseek/deepseek-chat",
        },
      });

      const modelCheck = result.checks.find((check) => check.code === "opencode_hello_probe_model_unavailable");
      expect(modelCheck).toBeTruthy();
      expect(modelCheck?.level).toBe("warn");
      expect(result.status).toBe("warn");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(binDir, { recursive: true, force: true });
    }
  });

  it("classifies hello probe Model not found output as model-unavailable warning", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-model-not-found-cwd-"));
    const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-model-not-found-bin-"));
    const fakeOpencode = path.join(binDir, "opencode");
    const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "models") {
  console.log("opencode/deepseek-v4-flash-free");
  process.exit(0);
}
if (args[0] === "run") {
  console.log(JSON.stringify({
    type: "error",
    sessionID: "session-model-not-found",
    error: { name: "UnknownError", data: { message: "Model not found: deepseek/deepseek-chat. Did you mean: deepseek-chat?" } },
  }));
  process.exit(1);
}
process.exit(1);
`;

    try {
      await fs.writeFile(fakeOpencode, script, "utf8");
      await fs.chmod(fakeOpencode, 0o755);

      const result = await testEnvironment({
        orgId: "organization-1",
        agentRuntimeType: "opencode_local",
        config: {
          command: fakeOpencode,
          cwd,
          model: "deepseek/deepseek-chat",
        },
      });

      const modelCheck = result.checks.find((check) => check.code === "opencode_hello_probe_model_unavailable");
      expect(modelCheck).toBeTruthy();
      expect(modelCheck?.level).toBe("warn");
      expect(modelCheck?.detail).toContain("Model not found: deepseek/deepseek-chat");
      expect(result.status).toBe("warn");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(binDir, { recursive: true, force: true });
    }
  });

  it("allows custom provider/model ids that are not listed by discovery when the hello probe succeeds", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-custom-model-cwd-"));
    const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-opencode-env-custom-model-bin-"));
    const fakeOpencode = path.join(binDir, "opencode");
    const script = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "models") {
  console.log("kimi-coding/kimi-for-coding Kimi");
  process.exit(0);
}
if (args[0] === "run") {
  const model = args[args.indexOf("--model") + 1];
  if (model !== "deepseek/deepseek-chat") {
    console.error("unexpected model " + model);
    process.exit(1);
  }
  console.log(JSON.stringify({
    type: "text",
    sessionID: "session-custom-model",
    part: { text: "hello" },
  }));
  process.exit(0);
}
console.error("unexpected args " + args.join(" "));
process.exit(1);
`;

    try {
      await fs.writeFile(fakeOpencode, script, "utf8");
      await fs.chmod(fakeOpencode, 0o755);

      const result = await testEnvironment({
        orgId: "organization-1",
        agentRuntimeType: "opencode_local",
        config: {
          command: fakeOpencode,
          cwd,
          model: "deepseek/deepseek-chat",
        },
      });

      expect(result.status).toBe("pass");
      expect(result.checks.some((check) => check.code === "opencode_models_discovered")).toBe(true);
      expect(result.checks.some((check) => check.code === "opencode_model_not_listed")).toBe(true);
      expect(result.checks.some((check) => check.code === "opencode_hello_probe_passed")).toBe(true);
      expect(result.checks.some((check) => check.code === "opencode_model_invalid")).toBe(false);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(binDir, { recursive: true, force: true });
    }
  });
});
