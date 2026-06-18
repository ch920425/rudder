import type { ChatMessage, HeartbeatRun } from "@rudderhq/shared";
import { describe, expect, it } from "vitest";
import { buildRunChatContext } from "./AgentDetail.chat-context";

function run(overrides: Partial<HeartbeatRun>): HeartbeatRun {
  return {
    id: "run-current",
    orgId: "org-1",
    agentId: "agent-1",
    invocationSource: "chat",
    triggerDetail: "chat_assistant_reply",
    status: "succeeded",
    startedAt: null,
    finishedAt: null,
    error: null,
    wakeupRequestId: null,
    exitCode: null,
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
      scene: "chat",
      conversationId: "chat-1",
      userMessageId: "user-current",
      chatTurnId: "turn-current",
    },
    createdAt: new Date("2026-06-17T10:00:00.000Z"),
    updatedAt: new Date("2026-06-17T10:01:00.000Z"),
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-1",
    orgId: "org-1",
    conversationId: "chat-1",
    role: "assistant",
    kind: "message",
    status: "completed",
    body: "Reply body",
    structuredPayload: null,
    approvalId: null,
    approval: null,
    attachments: [],
    runId: null,
    replyingAgentId: "agent-1",
    chatTurnId: "turn-current",
    turnVariant: 0,
    supersededAt: null,
    createdAt: new Date("2026-06-17T10:00:30.000Z"),
    updatedAt: new Date("2026-06-17T10:00:30.000Z"),
    ...overrides,
  };
}

describe("buildRunChatContext", () => {
  it("links a chat run back to the original user input and aggregates conversation replies", () => {
    const context = buildRunChatContext(run({}), [
      message({
        id: "user-current",
        role: "user",
        body: "Please list all enabled skills.",
        runId: null,
        replyingAgentId: null,
        chatTurnId: "turn-current",
        createdAt: new Date("2026-06-17T10:00:00.000Z"),
      }),
      message({
        id: "assistant-current",
        body: "Here is the full list.",
        runId: "run-current",
        chatTurnId: "turn-current",
        createdAt: new Date("2026-06-17T10:01:00.000Z"),
      }),
      message({
        id: "user-next",
        role: "user",
        body: "Group them by source.",
        runId: null,
        replyingAgentId: null,
        chatTurnId: "turn-next",
        createdAt: new Date("2026-06-17T10:05:00.000Z"),
      }),
      message({
        id: "assistant-next",
        body: "Grouped by source.",
        runId: "run-next",
        chatTurnId: "turn-next",
        createdAt: new Date("2026-06-17T10:06:00.000Z"),
      }),
    ]);

    expect(context.conversationId).toBe("chat-1");
    expect(context.userMessage?.body).toBe("Please list all enabled skills.");
    expect(context.currentReply?.id).toBe("assistant-current");
    expect(context.replies.map((reply) => reply.id)).toEqual(["assistant-current", "assistant-next"]);
  });

  it("falls back to the turn user message when the run snapshot lacks a user message id", () => {
    const context = buildRunChatContext(run({
      contextSnapshot: {
        scene: "chat",
        conversationId: "chat-1",
        chatTurnId: "turn-current",
      },
    }), [
      message({
        id: "user-current",
        role: "user",
        body: "What changed?",
        runId: null,
        replyingAgentId: null,
        chatTurnId: "turn-current",
      }),
      message({
        id: "assistant-current",
        body: "The detail page now has context.",
        runId: "run-current",
        chatTurnId: "turn-current",
      }),
    ]);

    expect(context.userMessage?.id).toBe("user-current");
  });

  it("keeps the original user input and reply for a superseded chat branch", () => {
    const supersededAt = new Date("2026-06-17T10:10:00.000Z");
    const context = buildRunChatContext(run({}), [
      message({
        id: "user-current",
        role: "user",
        body: "Original prompt before edit.",
        runId: null,
        replyingAgentId: null,
        chatTurnId: "turn-current",
        supersededAt,
        createdAt: new Date("2026-06-17T10:00:00.000Z"),
      }),
      message({
        id: "assistant-current",
        body: "Reply generated for the original prompt.",
        runId: "run-current",
        chatTurnId: "turn-current",
        supersededAt,
        createdAt: new Date("2026-06-17T10:01:00.000Z"),
      }),
      message({
        id: "user-edited",
        role: "user",
        body: "Edited prompt.",
        runId: null,
        replyingAgentId: null,
        chatTurnId: "turn-edited",
        createdAt: new Date("2026-06-17T10:11:00.000Z"),
      }),
      message({
        id: "assistant-edited",
        body: "Reply generated for the edited prompt.",
        runId: "run-edited",
        chatTurnId: "turn-edited",
        createdAt: new Date("2026-06-17T10:12:00.000Z"),
      }),
    ]);

    expect(context.userMessage?.body).toBe("Original prompt before edit.");
    expect(context.currentReply?.body).toBe("Reply generated for the original prompt.");
    expect(context.replies.map((reply) => reply.id)).toEqual(["assistant-current", "assistant-edited"]);
    expect(context.replies[0]?.isSuperseded).toBe(true);
  });
});
