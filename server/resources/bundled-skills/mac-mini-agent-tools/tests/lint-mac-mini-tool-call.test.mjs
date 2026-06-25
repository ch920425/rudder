import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluate, evaluateCommand } from "../scripts/lint-mac-mini-tool-call.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const linterPath = resolve(__dirname, "../scripts/lint-mac-mini-tool-call.mjs");
const helper = `node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs"`;

function runHook(payload) {
  return new Promise((resolve) => {
    const child = spawn("node", [linterPath, "--hook"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

test("blocks mac mini helper commands with broken shell quoting before execution", () => {
  const command = `${helper} answer '{"currentDate":"2026-06-22","question":"Use SJ's question."}'`;

  const result = evaluateCommand(command, { toolName: "functions.exec_command" });

  assert.equal(result.allow, false);
  assert.match(result.reason, /invalid shell syntax/);
  assert.match(result.reason, /apostrophes/);
});

test("blocks single-quoted inline JSON for prompt-like commands even when shell syntax is valid", () => {
  const command = `${helper} answer '{"currentDate":"2026-06-22","question":"What changed today?"}'`;

  const result = evaluateCommand(command, { toolName: "exec_command" });

  assert.equal(result.allow, false);
  assert.match(result.reason, /single-quoted inline JSON/);
  assert.match(result.reason, /@file/);
});

test("treats hermes-project as a prompt-like helper alias", () => {
  const command = `${helper} hermes-project '{"prompt":"Mirror this to Discord","discordThread":{"channelName":"general"}}'`;

  const result = evaluateCommand(command, { toolName: "exec_command" });

  assert.equal(result.allow, false);
  assert.match(result.reason, /single-quoted inline JSON/);
});

test("allows @file params and unrelated commands", () => {
  assert.deepEqual(
    evaluateCommand(`${helper} answer @/tmp/mac-mini-answer.json`, { toolName: "exec_command" }),
    { allow: true },
  );
  assert.deepEqual(
    evaluateCommand("rg call-mac-mini-tool.mjs skills/mac-mini-agent-tools", { toolName: "exec_command" }),
    { allow: true },
  );
});

test("understands Codex pre-tool hook payload shape", () => {
  const command = `${helper} gbrain '{"question":"What is SJ's latest note?"}'`;

  const result = evaluate({
    tool_name: "functions.exec_command",
    tool_input: { cmd: command },
  });

  assert.equal(result.allow, false);
});

test("hook mode returns denial JSON and exit code 2", async () => {
  const command = `${helper} ask-kb '{"question":"What is current context?"}'`;
  const result = await runHook({
    tool_name: "exec_command",
    tool_input: { cmd: command },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /single-quoted inline JSON/);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, "deny");
});
