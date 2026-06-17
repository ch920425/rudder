import { testEnvironment } from "@rudderhq/agent-runtime-pi-local/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function writeFakePiCommand(
  binDir: string,
  mode: "success" | "auth-required" | "stale-package",
): Promise<void> {
  const commandPath = path.join(binDir, "pi");
  const script =
    mode === "success"
      ? `#!/usr/bin/env node
if (process.argv.includes("--list-models")) {
  console.log("provider  model");
  console.log("openai    gpt-4.1-mini");
  process.exit(0);
}
console.log(JSON.stringify({ type: "session", version: 3, id: "session-1", timestamp: new Date().toISOString(), cwd: process.cwd() }));
console.log(JSON.stringify({ type: "agent_start" }));
console.log(JSON.stringify({ type: "turn_start" }));
console.log(JSON.stringify({
  type: "turn_end",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "hello" }],
    usage: { input: 1, output: 1, cacheRead: 0, cost: { total: 0 } }
  },
  toolResults: []
}));
`
      : mode === "auth-required"
        ? `#!/usr/bin/env node
if (process.argv.includes("--list-models")) {
  console.log("provider  model");
  console.log("kimi-coding  kimi-for-coding");
  process.exit(0);
}
console.error('No API key found for deepseek.');
process.exit(1);
`
      : `#!/usr/bin/env node
if (process.argv.includes("--list-models")) {
  console.error("npm error 404 'pi-driver@*' is not in this registry.");
  process.exit(1);
}
process.exit(1);
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

describe("pi_local environment diagnostics", () => {
  it("passes a hello probe when model discovery and execution succeed", async () => {
    const root = path.join(
      os.tmpdir(),
      `rudder-pi-local-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await writeFakePiCommand(binDir, "success");

    const result = await testEnvironment({
      orgId: "organization-1",
      agentRuntimeType: "pi_local",
      config: {
        command: "pi",
        cwd,
        model: "openai/gpt-4.1-mini",
        env: {
          OPENAI_API_KEY: "test-key",
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    expect(result.status).toBe("pass");
    expect(result.checks.some((check) => check.code === "pi_models_discovered")).toBe(true);
    expect(result.checks.some((check) => check.code === "pi_hello_probe_passed")).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("passes a hello probe when a custom model is not in discovered suggestions", async () => {
    const root = path.join(
      os.tmpdir(),
      `rudder-pi-local-custom-model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await writeFakePiCommand(binDir, "success");

    const result = await testEnvironment({
      orgId: "organization-1",
      agentRuntimeType: "pi_local",
      config: {
        command: "pi",
        cwd,
        model: "deepseek/deepseek-chat",
        env: {
          DEEPSEEK_API_KEY: "test-key",
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    expect(result.status).toBe("pass");
    const customModelCheck = result.checks.find((check) => check.code === "pi_model_not_discovered");
    expect(customModelCheck?.level).toBe("info");
    expect(customModelCheck?.hint).toContain("hello probe");
    expect(result.checks.some((check) => check.code === "pi_hello_probe_passed")).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("surfaces the provider-specific API key when DeepSeek auth is missing", async () => {
    const root = path.join(
      os.tmpdir(),
      `rudder-pi-local-deepseek-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await writeFakePiCommand(binDir, "auth-required");

    const result = await testEnvironment({
      orgId: "organization-1",
      agentRuntimeType: "pi_local",
      config: {
        command: "pi",
        cwd,
        model: "deepseek/deepseek-chat",
        env: {
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    const authCheck = result.checks.find((check) => check.code === "pi_hello_probe_auth_required");
    expect(result.status).toBe("warn");
    expect(authCheck?.level).toBe("warn");
    expect(authCheck?.hint).toContain("DEEPSEEK_API_KEY");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("fails before hello probe when model is not provider/model", async () => {
    const root = path.join(
      os.tmpdir(),
      `rudder-pi-local-invalid-model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await writeFakePiCommand(binDir, "success");

    const result = await testEnvironment({
      orgId: "organization-1",
      agentRuntimeType: "pi_local",
      config: {
        command: "pi",
        cwd,
        model: "deepseek-chat",
        env: {
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.find((check) => check.code === "pi_model_invalid")?.level).toBe("error");
    expect(result.checks.some((check) => check.code === "pi_hello_probe_passed")).toBe(false);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("surfaces stale configured package installs with a targeted hint", async () => {
    const root = path.join(
      os.tmpdir(),
      `rudder-pi-local-stale-package-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "workspace");
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await writeFakePiCommand(binDir, "stale-package");

    const result = await testEnvironment({
      orgId: "organization-1",
      agentRuntimeType: "pi_local",
      config: {
        command: "pi",
        cwd,
        env: {
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      },
    });

    const stalePackageCheck = result.checks.find((check) => check.code === "pi_package_install_failed");
    expect(stalePackageCheck?.level).toBe("warn");
    expect(stalePackageCheck?.hint).toContain("Remove `npm:pi-driver`");
    await fs.rm(root, { recursive: true, force: true });
  });
});
