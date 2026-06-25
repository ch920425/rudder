#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const BLOCK_EXIT = 2;
const MAC_MINI_HELPER = "call-mac-mini-tool.mjs";
const PROMPT_ALIASES = new Set([
  "answer",
  "rigor-answer",
  "intake",
  "vault-intake",
  "ask-kb",
  "gbrain",
  "hermes-project",
]);

export function getToolName(payload) {
  const candidates = [
    payload?.tool_name,
    payload?.toolName,
    payload?.tool,
    payload?.name,
    payload?.tool?.name,
    payload?.tool_use?.name,
    payload?.toolUse?.name,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function getToolInput(payload) {
  return payload?.tool_input ?? payload?.toolInput ?? payload?.input ?? payload?.arguments ?? payload?.args ?? {};
}

export function getCommand(payload) {
  const input = getToolInput(payload);
  const candidates = [
    input?.command,
    input?.cmd,
    input?.shell_command,
    input?.shellCommand,
    input?.script,
    payload?.command,
    payload?.cmd,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) return value.join(" ").trim();
  }
  return "";
}

function isShellTool(toolName) {
  return /^(bash|shell|sh|zsh|exec|exec_command|run_command|terminal)$/i.test(toolName)
    || /(^|[_.:-])(bash|shell|exec|terminal)([_.:-]|$)/i.test(toolName);
}

function containsHelper(command) {
  return command.includes(MAC_MINI_HELPER);
}

function shellSyntaxError(command) {
  const candidates = [
    process.env.SHELL,
    "/bin/zsh",
    "/bin/bash",
  ].filter((value, index, list) => typeof value === "string" && value.trim() && list.indexOf(value) === index);

  for (const shell of candidates) {
    const result = spawnSync(shell, ["-n", "-c", command], {
      encoding: "utf8",
      timeout: 1000,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    if (result.error) continue;
    if (result.status === 0) return null;
    const detail = String(result.stderr || result.stdout || "").trim();
    return detail || `${shell} syntax check failed with status ${result.status}`;
  }

  return null;
}

function commandTailAfterHelper(command) {
  const index = command.indexOf(MAC_MINI_HELPER);
  return index === -1 ? "" : command.slice(index + MAC_MINI_HELPER.length);
}

function hasRiskySingleQuotedPromptJson(command) {
  const tail = commandTailAfterHelper(command);
  const aliasPattern = [...PROMPT_ALIASES].join("|");
  const pattern = new RegExp(String.raw`(?:^|[\s;|&])(?:${aliasPattern})\s+'[\[{]`);
  return pattern.test(tail);
}

export function evaluateCommand(command, { toolName = "shell" } = {}) {
  if (!command || !containsHelper(command)) return { allow: true };
  if (toolName && !isShellTool(toolName)) return { allow: true };

  const syntaxError = shellSyntaxError(command);
  if (syntaxError) {
    return {
      allow: false,
      reason: [
        "Blocked Mac mini gateway call before shell execution: the command has invalid shell syntax.",
        syntaxError,
        "Use the helper with '-' stdin or @file params so apostrophes in questions/transcripts never break quoting.",
      ].join(" "),
    };
  }

  if (hasRiskySingleQuotedPromptJson(command)) {
    return {
      allow: false,
      reason: [
        "Blocked Mac mini gateway call: single-quoted inline JSON is not allowed for prompt-like commands",
        "because user text often contains apostrophes and can fail before the helper reaches the connector.",
        "Use '-' stdin or @file params instead.",
      ].join(" "),
    };
  }

  return { allow: true };
}

export function evaluate(payload) {
  return evaluateCommand(getCommand(payload), { toolName: getToolName(payload) });
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function emitDecision(result, { quietAllow = false } = {}) {
  if (result.allow) {
    if (!quietAllow) console.log(JSON.stringify({ decision: "allow" }));
    return 0;
  }
  const out = { decision: "deny", reason: result.reason };
  console.error(result.reason);
  console.log(JSON.stringify(out));
  return BLOCK_EXIT;
}

async function main() {
  const mode = process.argv[2] ?? "--hook";

  if (mode === "--command") {
    const command = process.argv.slice(3).join(" ");
    process.exit(emitDecision(evaluateCommand(command)));
  }

  if (mode === "--command-stdin") {
    const command = (await readStdin()).trimEnd();
    process.exit(emitDecision(evaluateCommand(command)));
  }

  if (mode !== "--hook") {
    console.error("Usage: lint-mac-mini-tool-call.mjs [--hook|--command <shell-command>|--command-stdin]");
    process.exit(1);
  }

  const raw = await readStdin();
  if (!raw.trim()) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  process.exit(emitDecision(evaluate(payload), { quietAllow: true }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
