import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverPiModels,
  ensurePiModelConfiguredAndAvailable,
  listPiModels,
  resetPiModelsCacheForTests,
} from "./models.js";

describe("pi models", () => {
  afterEach(() => {
    delete process.env.RUDDER_PI_COMMAND;
    resetPiModelsCacheForTests();
  });

  it("returns an empty list when discovery command is unavailable", async () => {
    process.env.RUDDER_PI_COMMAND = "__paperclip_missing_pi_command__";
    await expect(listPiModels()).resolves.toEqual([]);
  });

  it("rejects when model is missing", async () => {
    await expect(
      ensurePiModelConfiguredAndAvailable({ model: "" }),
    ).rejects.toThrow("Pi requires `agentRuntimeConfig.model`");
  });

  it("rejects when model is not in provider/model format", async () => {
    await expect(
      ensurePiModelConfiguredAndAvailable({ model: "deepseek-chat" }),
    ).rejects.toThrow("Pi requires `agentRuntimeConfig.model`");
  });

  it("allows custom provider/model when discovery cannot run", async () => {
    process.env.RUDDER_PI_COMMAND = "__paperclip_missing_pi_command__";
    await expect(
      ensurePiModelConfiguredAndAvailable({
        model: "xai/grok-4",
      }),
    ).resolves.toEqual([]);
  });

  it("discovers models when Pi prints its table to stderr", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "rudder-pi-models-"));
    const command = path.join(tempDir, "pi-fixture.mjs");
    await writeFile(
      command,
      [
        "#!/usr/bin/env node",
        "process.stderr.write('provider   model                       context  max-out  thinking  images\\n');",
        "process.stderr.write('anthropic  claude-3-5-haiku-20241022   200K     8.2K     no        yes\\n');",
        "process.stderr.write('opencode   deepseek-v4-flash-free      128K     8K       no        no\\n');",
      ].join("\n"),
      "utf8",
    );
    await chmod(command, 0o755);

    try {
      const models = await discoverPiModels({
        command,
        cwd: process.cwd(),
        env: {},
      });

      expect(models.map((entry) => entry.id)).toEqual([
        "anthropic/claude-3-5-haiku-20241022",
        "opencode/deepseek-v4-flash-free",
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("allows configured provider/model values that are not in discovered suggestions", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "rudder-pi-models-"));
    const command = path.join(tempDir, "pi-fixture.mjs");
    await writeFile(
      command,
      [
        "#!/usr/bin/env node",
        "process.stderr.write('provider   model                       context  max-out  thinking  images\\n');",
        "process.stderr.write('kimi-coding  kimi-for-coding            128K     8K       no        no\\n');",
      ].join("\n"),
      "utf8",
    );
    await chmod(command, 0o755);

    try {
      await expect(
        ensurePiModelConfiguredAndAvailable({
          model: "deepseek/deepseek-chat",
          command,
          cwd: process.cwd(),
          env: {},
        }),
      ).resolves.toEqual([
        { id: "kimi-coding/kimi-for-coding", label: "kimi-coding/kimi-for-coding" },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
