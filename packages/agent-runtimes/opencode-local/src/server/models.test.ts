import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureOpenCodeModelConfiguredAndAvailable,
  listOpenCodeModels,
  resetOpenCodeModelsCacheForTests,
} from "./models.js";

describe("openCode models", () => {
  afterEach(() => {
    delete process.env.RUDDER_OPENCODE_COMMAND;
    resetOpenCodeModelsCacheForTests();
  });

  it("returns an empty list when discovery command is unavailable", async () => {
    process.env.RUDDER_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";
    await expect(listOpenCodeModels()).resolves.toEqual([]);
  });

  it("rejects when model is missing", async () => {
    await expect(
      ensureOpenCodeModelConfiguredAndAvailable({ model: "" }),
    ).rejects.toThrow("OpenCode requires `agentRuntimeConfig.model`");
  });

  it("rejects when model is not in provider/model format", async () => {
    await expect(
      ensureOpenCodeModelConfiguredAndAvailable({ model: "gpt-5" }),
    ).rejects.toThrow("OpenCode requires `agentRuntimeConfig.model`");
  });

  it("allows custom provider/model when discovery cannot run", async () => {
    process.env.RUDDER_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";
    await expect(
      ensureOpenCodeModelConfiguredAndAvailable({
        model: "openai/gpt-5",
      }),
    ).resolves.toEqual([]);
  });

  it("allows configured provider/model values that are not in discovered suggestions", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "rudder-opencode-models-"));
    const command = path.join(tempDir, "opencode-fixture.mjs");
    await writeFile(
      command,
      [
        "#!/usr/bin/env node",
        "process.stdout.write('opencode/deepseek-v4-flash-free\\n');",
      ].join("\n"),
      "utf8",
    );
    await chmod(command, 0o755);

    try {
      await expect(
        ensureOpenCodeModelConfiguredAndAvailable({
          model: "deepseek/deepseek-chat",
          command,
          cwd: process.cwd(),
          env: {},
        }),
      ).resolves.toEqual([
        { id: "opencode/deepseek-v4-flash-free", label: "opencode/deepseek-v4-flash-free" },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
