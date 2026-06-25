import type { ToolRunContext } from "@rudderhq/plugin-sdk";

const RELAY_MODES = new Set(["metadata_only", "final_only", "progress_and_final"]);

export type DiscordThreadRelay = {
  enabled: boolean;
  provider: "discord";
  guild_id?: string;
  channel_id?: string;
  channel_name?: string;
  thread_id?: string;
  thread_name?: string;
  source_message_id?: string;
  relay_mode: "metadata_only" | "final_only" | "progress_and_final";
  create_thread: boolean;
  include_streams: boolean;
  include_tool_calls: boolean;
  include_answers: boolean;
  include_follow_ups: boolean;
  rudder: {
    org_id: string;
    agent_id: string;
    run_id: string;
    project_id: string;
    request_id: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function booleanField(record: Record<string, unknown>, fallback: boolean, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return fallback;
}

function relayMode(record: Record<string, unknown>): DiscordThreadRelay["relay_mode"] {
  const value = stringField(record, "relayMode", "relay_mode");
  return value && RELAY_MODES.has(value)
    ? value as DiscordThreadRelay["relay_mode"]
    : value
      ? "metadata_only"
      : "progress_and_final";
}

export function normalizeDiscordThreadRelay(
  input: unknown,
  runCtx: ToolRunContext,
  requestId: string | undefined,
): DiscordThreadRelay | undefined {
  const record = asRecord(input);
  if (!record) return undefined;
  if (booleanField(record, true, "enabled") === false) {
    return {
      enabled: false,
      provider: "discord",
      relay_mode: "metadata_only",
      create_thread: false,
      include_streams: false,
      include_tool_calls: false,
      include_answers: false,
      include_follow_ups: false,
      rudder: {
        org_id: runCtx.orgId,
        agent_id: runCtx.agentId,
        run_id: runCtx.runId,
        project_id: runCtx.projectId,
        request_id: requestId ?? null,
      },
    };
  }

  const threadId = stringField(record, "threadId", "thread_id");
  const normalized: DiscordThreadRelay = {
    enabled: true,
    provider: "discord",
    relay_mode: relayMode(record),
    create_thread: booleanField(record, threadId ? false : true, "createThread", "create_thread"),
    include_streams: booleanField(record, true, "includeStreams", "include_streams"),
    include_tool_calls: booleanField(record, true, "includeToolCalls", "include_tool_calls"),
    include_answers: booleanField(record, true, "includeAnswers", "include_answers"),
    include_follow_ups: booleanField(record, true, "includeFollowUps", "include_follow_ups", "includeFollowups", "include_followups"),
    rudder: {
      org_id: runCtx.orgId,
      agent_id: runCtx.agentId,
      run_id: runCtx.runId,
      project_id: runCtx.projectId,
      request_id: requestId ?? null,
    },
  };

  const guildId = stringField(record, "guildId", "guild_id");
  const channelId = stringField(record, "channelId", "channel_id");
  const channelName = stringField(record, "channelName", "channel_name") ?? "general";
  const explicitThreadName = stringField(record, "threadName", "thread_name");
  const threadName = explicitThreadName ?? (threadId ? undefined : `Rudder Hermes ${runCtx.runId.slice(0, 8)}`);
  const sourceMessageId = stringField(record, "sourceMessageId", "source_message_id");

  if (guildId) normalized.guild_id = guildId;
  if (channelId) normalized.channel_id = channelId;
  if (channelName) normalized.channel_name = channelName;
  if (threadId) normalized.thread_id = threadId;
  if (threadName) normalized.thread_name = threadName;
  if (sourceMessageId) normalized.source_message_id = sourceMessageId;

  return normalized;
}
