// @vitest-environment node

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatConversation, ChatMessage } from "@rudderhq/shared";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/context/ThemeContext";
import {
  ChatSystemMessageBody,
  INTERRUPTED_CHAT_CONTINUATION_PROMPT,
  ProposalCard,
  assistantStateLabel,
  canContinueInterruptedChatMessage,
  computeDisplayedChatMessages,
  isChatAgentSelectionLocked,
  isUserVisibleIncomingChatMessage,
  readChatScopedPendingFiles,
  scrollChatMessagesToBottom,
  statusChipClassName,
  updateChatScopedPendingFiles,
  withOptimisticPlanMode,
} from "./Chat";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/chat" }),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams()],
}));

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-1",
    orgId: "org-1",
    conversationId: "chat-1",
    role: "system",
    kind: "system_event",
    status: "completed",
    body: "System event.",
    structuredPayload: null,
    approvalId: null,
    approval: null,
    attachments: [],
    transcript: [],
    replyingAgentId: null,
    chatTurnId: null,
    turnVariant: 0,
    supersededAt: null,
    createdAt: new Date("2026-05-07T00:00:00.000Z"),
    updatedAt: new Date("2026-05-07T00:00:00.000Z"),
    ...overrides,
  };
}

function conversation(overrides: Partial<ChatConversation>): ChatConversation {
  return {
    id: "chat-1",
    orgId: "org-1",
    status: "active",
    title: "Plan mode chat",
    summary: null,
    latestReplyPreview: null,
    preferredAgentId: null,
    routedAgentId: null,
    primaryIssueId: null,
    primaryIssue: null,
    issueCreationMode: "manual_approval",
    planMode: false,
    createdByUserId: null,
    lastMessageAt: null,
    lastReadAt: null,
    isPinned: false,
    isUnread: false,
    unreadCount: 0,
    needsAttention: false,
    resolvedAt: null,
    contextLinks: [],
    chatRuntime: {
      sourceType: "unconfigured",
      sourceLabel: "No chat runtime",
      runtimeAgentId: null,
      agentRuntimeType: null,
      model: null,
      available: false,
      error: null,
    },
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
    updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function renderSystemMessageBody(message: ChatMessage) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <ChatSystemMessageBody message={message} skillReferences={[]} />
    </ThemeProvider>,
  );
}

function renderProposalCard(message: ChatMessage, chat: ChatConversation = conversation({})) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <ProposalCard
        conversation={chat}
        message={message}
        agents={undefined}
        decisionNote=""
        onDecisionNoteChange={vi.fn()}
        onApprovalAction={vi.fn()}
        onResolveOperationProposal={vi.fn()}
        onConvertToIssue={vi.fn()}
        actionPending={false}
        skillReferences={[]}
      />
    </ThemeProvider>,
  );
}

describe("ChatSystemMessageBody", () => {
  it("highlights issue-created identifiers as issue links", () => {
    const html = renderSystemMessageBody(message({
      body: "Created issue ZST-29 from this chat conversation.",
      structuredPayload: {
        eventType: "issue_created",
        issueId: "issue-29",
        issueIdentifier: "ZST-29",
      },
    }));

    expect(html).toContain("Created issue ");
    expect(html).toContain('class="chat-system-issue-link"');
    expect(html).toContain('href="/issues/ZST-29"');
    expect(html).toContain('aria-label="Open issue ZST-29"');
    expect(html).toContain(">ZST-29</a> from this chat conversation.");
  });

  it("keeps normal system messages in markdown rendering", () => {
    const html = renderSystemMessageBody(message({
      body: "Applied **approved** organization change.",
      structuredPayload: {
        eventType: "operation_applied",
      },
    }));

    expect(html).toContain("rudder-markdown");
    expect(html).toContain("<strong>approved</strong>");
    expect(html).not.toContain("chat-system-issue-link");
  });
});

describe("ProposalCard", () => {
  it("keeps assistant rationale outside the structured review card", () => {
    const assistantBody = "结论：不通过，需要修。这个应该作为普通回复正文。";
    const issueTitle = "Fix issue Chat entry";
    const issueDescription = "Only this structured issue description belongs in the review card.";
    const html = renderProposalCard(message({
      role: "assistant",
      kind: "issue_proposal",
      body: assistantBody,
      structuredPayload: {
        title: issueTitle,
        priority: "high",
        description: issueDescription,
      },
    }));

    const reviewBlockIndex = html.indexOf('data-testid="proposal-review-block"');
    expect(reviewBlockIndex).toBeGreaterThan(0);
    expect(html.indexOf(assistantBody)).toBeLessThan(reviewBlockIndex);

    const reviewBlockHtml = html.slice(reviewBlockIndex);
    expect(reviewBlockHtml).toContain(issueTitle);
    expect(reviewBlockHtml).toContain(issueDescription);
    expect(reviewBlockHtml).not.toContain(assistantBody);
  });
});

describe("interrupted chat messages", () => {
  it("labels interrupted assistant messages and exposes continuation intent", () => {
    const interrupted = message({
      role: "assistant",
      kind: "message",
      status: "interrupted",
      body: "Partial preserved reply",
    });

    expect(assistantStateLabel("interrupted")).toBe("Interrupted");
    expect(statusChipClassName("interrupted")).toContain("amber");
    expect(canContinueInterruptedChatMessage(interrupted)).toBe(true);
    expect(INTERRUPTED_CHAT_CONTINUATION_PROMPT).toBe("Continue from the interrupted chat run.");
  });

  it("does not offer continuation for completed or user messages", () => {
    expect(canContinueInterruptedChatMessage(message({ role: "assistant", status: "completed" }))).toBe(false);
    expect(canContinueInterruptedChatMessage(message({ role: "user", status: "interrupted" }))).toBe(false);
  });
});

describe("isUserVisibleIncomingChatMessage", () => {
  it("ignores empty assistant placeholders until visible content appears", () => {
    expect(isUserVisibleIncomingChatMessage(message({
      role: "assistant",
      kind: "message",
      status: "streaming",
      body: "",
    }))).toBe(false);

    expect(isUserVisibleIncomingChatMessage(message({
      role: "assistant",
      kind: "message",
      status: "streaming",
      body: "First visible token",
    }))).toBe(true);
  });

  it("treats structured incoming cards as visible messages", () => {
    expect(isUserVisibleIncomingChatMessage(message({
      role: "assistant",
      kind: "issue_proposal",
      body: "",
    }))).toBe(true);

    expect(isUserVisibleIncomingChatMessage(message({
      role: "user",
      kind: "message",
      body: "User-authored text",
    }))).toBe(false);
  });
});

describe("computeDisplayedChatMessages", () => {
  it("preserves system events created after a previewed turn", () => {
    const messages = [
      message({
        id: "user-1",
        role: "user",
        kind: "message",
        body: "please draft another issue",
        chatTurnId: "turn-1",
        turnVariant: 0,
        createdAt: new Date("2026-05-07T00:00:00.000Z"),
      }),
      message({
        id: "proposal-1",
        role: "assistant",
        kind: "issue_proposal",
        body: "Create a scoped issue.",
        chatTurnId: "turn-1",
        turnVariant: 0,
        createdAt: new Date("2026-05-07T00:00:01.000Z"),
      }),
      message({
        id: "system-1",
        role: "system",
        kind: "system_event",
        body: "Created issue ZST-29 from this chat conversation.",
        structuredPayload: {
          eventType: "issue_created",
          issueId: "issue-29",
          issueIdentifier: "ZST-29",
        },
        chatTurnId: null,
        createdAt: new Date("2026-05-07T00:00:02.000Z"),
      }),
    ];

    expect(computeDisplayedChatMessages(messages, { chatTurnId: "turn-1", turnVariant: 0 }).map((row) => row.id))
      .toEqual(["user-1", "proposal-1", "system-1"]);
  });
});

describe("scrollChatMessagesToBottom", () => {
  it("scrolls the message region to its full height without animation", () => {
    const scrollTo = vi.fn();
    const element = {
      scrollHeight: 1248,
      scrollTo,
    } as unknown as Pick<HTMLElement, "scrollHeight" | "scrollTo">;

    scrollChatMessagesToBottom(element);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1248, behavior: "auto" });
  });
});

describe("chat scoped pending files", () => {
  it("keeps pending attachments scoped by conversation", () => {
    const chatOneFiles = [{ name: "chat-one.png" }];
    const chatTwoFiles = [{ name: "chat-two.txt" }];
    let scopes: Record<string, Array<{ name: string }>> = {};

    scopes = updateChatScopedPendingFiles(scopes, "org-1:chat-1", () => chatOneFiles);
    scopes = updateChatScopedPendingFiles(scopes, "org-1:chat-2", () => chatTwoFiles);

    expect(readChatScopedPendingFiles(scopes, "org-1:chat-1")).toBe(chatOneFiles);
    expect(readChatScopedPendingFiles(scopes, "org-1:chat-2")).toBe(chatTwoFiles);
    expect(readChatScopedPendingFiles(scopes, "org-1:chat-3")).toEqual([]);
  });

  it("clears only the active conversation attachment scope", () => {
    const chatOneFiles = [{ name: "chat-one.png" }];
    const chatTwoFiles = [{ name: "chat-two.txt" }];
    let scopes: Record<string, Array<{ name: string }>> = {
      "org-1:chat-1": chatOneFiles,
      "org-1:chat-2": chatTwoFiles,
    };

    scopes = updateChatScopedPendingFiles(scopes, "org-1:chat-1", () => []);

    expect(readChatScopedPendingFiles(scopes, "org-1:chat-1")).toEqual([]);
    expect(readChatScopedPendingFiles(scopes, "org-1:chat-2")).toBe(chatTwoFiles);
    expect(scopes).not.toHaveProperty("org-1:chat-1");
  });
});

describe("withOptimisticPlanMode", () => {
  it("updates plan mode before the server refetch completes", () => {
    const original = conversation({ planMode: false });

    const optimistic = withOptimisticPlanMode(original, true);

    expect(optimistic).not.toBe(original);
    expect(optimistic.planMode).toBe(true);
    expect(optimistic.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
  });

  it("keeps the same conversation object when plan mode is already current", () => {
    const original = conversation({ planMode: true });

    expect(withOptimisticPlanMode(original, true)).toBe(original);
  });
});

describe("isChatAgentSelectionLocked", () => {
  it("keeps historical unassigned conversations repairable", () => {
    expect(isChatAgentSelectionLocked({
      hasConversation: true,
      preferredAgentId: null,
      hasLastMessageAt: true,
      hasMessages: true,
      hasActiveStream: false,
      hasActiveSendInFlight: false,
    })).toBe(false);
  });

  it("locks historical conversations once a real preferred agent is selected", () => {
    expect(isChatAgentSelectionLocked({
      hasConversation: true,
      preferredAgentId: "agent-1",
      hasLastMessageAt: true,
      hasMessages: true,
      hasActiveStream: false,
      hasActiveSendInFlight: false,
    })).toBe(true);
  });

  it("locks unassigned conversations while a send or stream is active", () => {
    expect(isChatAgentSelectionLocked({
      hasConversation: true,
      preferredAgentId: null,
      hasLastMessageAt: false,
      hasMessages: false,
      hasActiveStream: true,
      hasActiveSendInFlight: false,
    })).toBe(true);
    expect(isChatAgentSelectionLocked({
      hasConversation: true,
      preferredAgentId: null,
      hasLastMessageAt: false,
      hasMessages: false,
      hasActiveStream: false,
      hasActiveSendInFlight: true,
    })).toBe(true);
  });
});
