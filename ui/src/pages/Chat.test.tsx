// @vitest-environment node

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessage } from "@rudderhq/shared";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/context/ThemeContext";
import { ChatSystemMessageBody, computeDisplayedChatMessages } from "./Chat";

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

function renderSystemMessageBody(message: ChatMessage) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <ChatSystemMessageBody message={message} skillReferences={[]} />
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
