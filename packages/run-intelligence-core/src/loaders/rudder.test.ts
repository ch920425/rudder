import type { HeartbeatRun, HeartbeatRunEvent } from "@rudderhq/shared";
import { describe, expect, it } from "vitest";
import { observedRunFromFilesystem } from "./rudder.js";

function makeRun(overrides: Partial<HeartbeatRun> = {}): HeartbeatRun {
  return {
    id: "run-chat-1",
    orgId: "org-1",
    agentId: "agent-1",
    invocationSource: "chat",
    triggerDetail: "chat_assistant_reply_stream",
    status: "succeeded",
    startedAt: new Date("2026-06-17T09:00:00.000Z"),
    finishedAt: new Date("2026-06-17T09:01:00.000Z"),
    error: null,
    wakeupRequestId: null,
    exitCode: 0,
    signal: null,
    usageJson: null,
    resultJson: null,
    sessionIdBefore: null,
    sessionIdAfter: null,
    logStore: null,
    logRef: null,
    logBytes: null,
    logSha256: null,
    logCompressed: false,
    stdoutExcerpt: null,
    stderrExcerpt: null,
    errorCode: null,
    externalRunId: null,
    chatConversationId: "chat-1",
    processPid: null,
    processStartedAt: null,
    retryOfRunId: null,
    processLossRetryCount: 0,
    contextSnapshot: {
      userMessageId: "msg-user-1",
      assistantMessageId: "msg-assistant-1",
    },
    createdAt: new Date("2026-06-17T09:00:00.000Z"),
    updatedAt: new Date("2026-06-17T09:01:00.000Z"),
    ...overrides,
  };
}

function makeTranscriptEvent(
  seq: number,
  payload: Record<string, unknown>,
  overrides: Partial<HeartbeatRunEvent> = {},
): HeartbeatRunEvent {
  return {
    id: seq,
    orgId: "org-1",
    runId: "run-chat-1",
    agentId: "agent-1",
    seq,
    eventType: "transcript.entry",
    stream: "system",
    level: "info",
    color: null,
    message: "chat transcript entry",
    payload,
    createdAt: new Date(`2026-06-17T09:00:${String(seq).padStart(2, "0")}.000Z`),
    ...overrides,
  };
}

const bundle = {
  agentRuntimeType: "codex_local",
  agentConfigRevisionId: null,
  agentConfigRevisionCreatedAt: null,
  agentConfigFingerprint: null,
  runtimeConfigFingerprint: null,
};

describe("observedRunFromFilesystem", () => {
  it("hydrates chat run transcripts from transcript.entry events when no run log exists", () => {
    const detail = observedRunFromFilesystem({
      run: makeRun(),
      agentName: "Chat Agent",
      bundle,
      events: [
        makeTranscriptEvent(1, {
          kind: "assistant",
          ts: "2026-06-17T09:00:01.000Z",
          text: "I will inspect this.",
        }),
        makeTranscriptEvent(2, {
          kind: "tool_call",
          ts: "2026-06-17T09:00:02.000Z",
          name: "exec_command",
          input: { cmd: "pnpm test" },
          toolUseId: "tool-1",
        }),
        makeTranscriptEvent(3, {
          kind: "tool_result",
          ts: "2026-06-17T09:00:03.000Z",
          toolUseId: "tool-1",
          toolName: "exec_command",
          content: "passed",
          isError: false,
        }),
      ],
      logContent: "",
    });

    expect(detail.logChunks).toEqual([]);
    expect(detail.transcript).toEqual([
      { kind: "assistant", ts: "2026-06-17T09:00:01.000Z", text: "I will inspect this." },
      {
        kind: "tool_call",
        ts: "2026-06-17T09:00:02.000Z",
        name: "exec_command",
        input: { cmd: "pnpm test" },
        toolUseId: "tool-1",
      },
      {
        kind: "tool_result",
        ts: "2026-06-17T09:00:03.000Z",
        toolUseId: "tool-1",
        toolName: "exec_command",
        content: "passed",
        isError: false,
      },
    ]);
  });

  it("keeps log-derived transcripts as the source of truth when run logs are present", () => {
    const detail = observedRunFromFilesystem({
      run: makeRun({ invocationSource: "on_demand", triggerDetail: "manual" }),
      agentName: "Run Agent",
      bundle: { ...bundle, agentRuntimeType: "process" },
      events: [
        makeTranscriptEvent(1, {
          kind: "assistant",
          ts: "2026-06-17T09:00:01.000Z",
          text: "event transcript",
        }),
      ],
      logContent: JSON.stringify({
        ts: "2026-06-17T09:00:01.000Z",
        stream: "system",
        chunk: "log transcript",
      }),
    });

    expect(detail.transcript).toEqual([
      { kind: "system", ts: "2026-06-17T09:00:01.000Z", text: "log transcript" },
    ]);
  });
});
