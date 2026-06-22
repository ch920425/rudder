import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareManagedCodexHome } from "./codex-home.js";

describe("managed Codex home config sync", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function prepareWithSharedConfig(
    configToml: string,
    isolationSurface?: Parameters<typeof prepareManagedCodexHome>[4],
  ) {
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
      isolationSurface,
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

  it("strips inherited MCP servers and writes only managed MCP servers", async () => {
    const { config, logs } = await prepareWithSharedConfig([
      'model = "gpt-5.5"',
      "",
      "[mcp_servers.linear]",
      'url = "https://mcp.linear.app/mcp"',
      "",
      "[mcp_servers.slack]",
      'command = "/tmp/slack-mcp"',
      "",
    ].join("\n"), {
      disabledSkillPaths: [],
      managedMcpServers: {
        context7: {
          command: "/Users/example/.local/bin/context7-mcp-stdio",
          startup_timeout_sec: 20,
        },
        exa: {
          url: "https://mcp.exa.ai/mcp",
        },
      },
    });

    expect(config).toContain('model = "gpt-5.5"');
    expect(config).not.toContain("[mcp_servers.linear]");
    expect(config).not.toContain("https://mcp.linear.app/mcp");
    expect(config).not.toContain("[mcp_servers.slack]");
    expect(config).toContain("[mcp_servers.context7]");
    expect(config).toContain('command = "/Users/example/.local/bin/context7-mcp-stdio"');
    expect(config).toContain("startup_timeout_sec = 20");
    expect(config).toContain("[mcp_servers.exa]");
    expect(config).toContain('url = "https://mcp.exa.ai/mcp"');
    expect(logs.join("\n")).toContain("Removed 2 inherited Codex plugin/MCP configuration tables");
    expect(logs.join("\n")).toContain("Enabled 2 managed Codex MCP servers");
  });

  it("supports nested managed MCP env tables without rendering invalid values", async () => {
    const { config } = await prepareWithSharedConfig("", {
      disabledSkillPaths: [],
      managedMcpServers: {
        demo: {
          command: "/bin/demo",
          args: ["--serve"],
          env: {
            SAFE_FLAG: "1",
            INVALID_OBJECT: { nope: true },
          },
          invalid: { deep: { nope: true } },
        },
        "invalid.server": {
          command: "/bin/nope",
        },
      },
    });

    expect(config).toContain("[mcp_servers.demo]");
    expect(config).toContain('args = ["--serve"]');
    expect(config).toContain("[mcp_servers.demo.env]");
    expect(config).toContain('SAFE_FLAG = "1"');
    expect(config).not.toContain("INVALID_OBJECT");
    expect(config).not.toContain("invalid.server");
    expect(config).not.toContain("/bin/nope");
  });
});
