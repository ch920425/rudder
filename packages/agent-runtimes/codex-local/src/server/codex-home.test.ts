import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareManagedCodexHome } from "./codex-home.js";

describe("managed Codex home config sync", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function prepareWithSharedConfig(configToml: string) {
    const root = await mkdtemp(path.join(os.tmpdir(), "rudder-codex-home-"));
    tempRoots.push(root);

    const sharedCodexHome = path.join(root, "shared-codex-home");
    await mkdir(sharedCodexHome, { recursive: true });
    await writeFile(path.join(sharedCodexHome, "config.toml"), configToml, "utf8");

    const logs: string[] = [];
    const codexHome = await prepareManagedCodexHome(
      {
        CODEX_HOME: sharedCodexHome,
        RUDDER_HOME: path.join(root, "rudder-home"),
        RUDDER_INSTANCE_ID: "prod-local-test",
      },
      async (_stream, chunk) => {
        logs.push(chunk);
      },
      "org-1",
      "agent-1",
    );

    return {
      codexHome,
      config: await readFile(path.join(codexHome, "config.toml"), "utf8"),
      logs,
    };
  }

  it("strips inherited Codex service_tier default values unsupported by current Codex", async () => {
    const { config, logs } = await prepareWithSharedConfig([
      'model = "gpt-5.5"',
      'service_tier = "default"',
      'model_reasoning_effort = "high"',
      "",
    ].join("\n"));

    expect(config).toContain('model = "gpt-5.5"');
    expect(config).toContain('model_reasoning_effort = "high"');
    expect(config).not.toContain("service_tier");
    expect(logs.join("\n")).toContain("Removed 1 unsupported inherited Codex service_tier entry");
  });

  it("preserves Codex service_tier values accepted by current Codex", async () => {
    const { config } = await prepareWithSharedConfig([
      'model = "gpt-5.5"',
      'service_tier = "fast"',
      "",
    ].join("\n"));

    expect(config).toContain('service_tier = "fast"');
  });
});
