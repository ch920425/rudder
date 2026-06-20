import { asString, asStringArray } from "@rudderhq/agent-runtime-utils/server-utils";

const CLAUDE_EXTRA_ARGS_VALUE_FLAGS = new Set([
  "--add-dir",
  "--allowedTools",
  "--allowed-tools",
  "--disallowedTools",
  "--disallowed-tools",
  "--mcp-config",
  "--permission-mode",
  "--plugin-dir",
  "--plugin-url",
  "--setting-sources",
  "--settings",
  "--tools",
]);
const CLAUDE_EXTRA_ARGS_STANDALONE_FLAGS = new Set([
  "--allow-dangerously-skip-permissions",
  "--dangerously-skip-permissions",
  "--no-strict-mcp-config",
  "--strict-mcp-config",
]);
const CLAUDE_EXTRA_ARGS_PREFIXED_FLAGS = [
  "--add-dir=",
  "--allowedTools=",
  "--allowed-tools=",
  "--disallowedTools=",
  "--disallowed-tools=",
  "--mcp-config=",
  "--permission-mode=",
  "--plugin-dir=",
  "--plugin-url=",
  "--setting-sources=",
  "--settings=",
  "--strict-mcp-config=",
  "--tools=",
] as const;
const CLAUDE_PERMISSION_MODES = new Set([
  "acceptEdits",
  "auto",
  "default",
  "dontAsk",
  "plan",
] as const);

export function sanitizeClaudeExtraArgs(args: string[]): { args: string[]; removedFlags: string[] } {
  const sanitized: string[] = [];
  const removedFlags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--permission-mode") {
      removedFlags.add(arg);
      index += 1;
      continue;
    }
    if (CLAUDE_EXTRA_ARGS_VALUE_FLAGS.has(arg)) {
      removedFlags.add(arg);
      index += 1;
      continue;
    }
    if (CLAUDE_EXTRA_ARGS_STANDALONE_FLAGS.has(arg)) {
      removedFlags.add(arg);
      continue;
    }
    if (arg.startsWith("--permission-mode=")) {
      removedFlags.add("--permission-mode");
      continue;
    }
    const matchedPrefix = CLAUDE_EXTRA_ARGS_PREFIXED_FLAGS.find((prefix) => arg.startsWith(prefix));
    if (matchedPrefix) {
      removedFlags.add(matchedPrefix.slice(0, -1));
      continue;
    }
    sanitized.push(arg);
  }

  return { args: sanitized, removedFlags: [...removedFlags].sort() };
}

export function configuredClaudeExtraArgs(config: Record<string, unknown>): string[] {
  const fromExtraArgs = asStringArray(config.extraArgs);
  if (fromExtraArgs.length > 0) return fromExtraArgs;
  return asStringArray(config.args);
}

export function resolveClaudePermissionMode(config: Record<string, unknown>): string {
  const configured = asString(config.permissionMode, "").trim();
  if (configured && CLAUDE_PERMISSION_MODES.has(configured as never)) {
    return configured;
  }

  return "auto";
}
