import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { testEnvironment } from "./test.js";

describe("claude hello probe classification", () => {
  const originalPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = originalPath;
  });

  it("warns when a timed-out probe produced a completed hello result", async () => {
    const mod = await import("./test.js") as Record<string, unknown>;
    const classifyClaudeHelloProbe = mod.classifyClaudeHelloProbe as (
      input: {
        timedOut: boolean;
        exitCode: number | null;
        stdout: string;
        stderr: string;
      },
    ) => { code: string; level: string };

    const result = classifyClaudeHelloProbe({
      timedOut: true,
      exitCode: null,
      stdout: JSON.stringify({ type: "result", result: "hello" }),
      stderr: "",
    });

    expect(result).toMatchObject({
      code: "claude_hello_probe_passed_with_timeout",
      level: "warn",
    });
  });

  it("runs the local claude command hello probe and classifies final text", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "rudder-claude-"));
    const command = path.join(tempDir, "claude");
    await writeFile(
      command,
      [
        "#!/usr/bin/env node",
        "process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'thinking' }] } }) + '\\n');",
        "process.stdout.write(JSON.stringify({ type: 'result', result: 'hello', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 } }) + '\\n');",
      ].join("\n"),
      "utf8",
    );
    await chmod(command, 0o755);
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath ?? ""}`;

    try {
      const result = await testEnvironment({
        orgId: "org-1",
        agentRuntimeType: "claude_local",
        config: { cwd: process.cwd() },
      });

      expect(result.checks).toContainEqual(
        expect.objectContaining({
          code: "claude_hello_probe_passed",
          level: "info",
          detail: "hello",
        }),
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
