// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Project } from "@rudderhq/shared";
import { ThemeProvider } from "../context/ThemeContext";
import { ApprovalPayloadRenderer } from "./ApprovalPayload";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const project = {
  id: "project-1",
  name: "Project Atlas",
} as Project;

const agent = {
  id: "agent-1",
  name: "Wesley",
  role: "engineer",
  title: "Founding Engineer",
  icon: "🛠️",
} as Agent;

function renderChatIssueApproval(payload: Record<string, unknown>, context = {}) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <ApprovalPayloadRenderer type="chat_issue_creation" payload={payload} context={context} />
    </ThemeProvider>,
  );
}

describe("ApprovalPayloadRenderer", () => {
  it("renders chat issue proposal Markdown and readable project/assignee labels", () => {
    const html = renderChatIssueApproval(
      {
        chatConversationId: "chat-1",
        proposedIssue: {
          title: "Fix issue approval UI",
          description: [
            "## Review Summary",
            "",
            "- Render **markdown** in the approval preview.",
            "- Preserve inline image assets.",
            "",
            "![](/api/assets/approval-screenshot/content)",
          ].join("\n"),
          priority: "medium",
          projectId: project.id,
          assigneeAgentId: agent.id,
        },
      },
      { projects: [project], agents: [agent], chatConversation: { id: "chat-1", title: "Messenger intake" } },
    );

    expect(html).toContain("Agent proposed a new issue from chat");
    expect(html).toContain("Messenger intake");
    expect(html).toContain('href="/messenger/chat/chat-1"');
    expect(html).toContain("Project Atlas");
    expect(html).toContain("Wesley");
    expect(html).toContain("<h2");
    expect(html).toContain("Review Summary");
    expect(html).toContain("<strong>markdown</strong>");
    expect(html).toContain('src="/api/assets/approval-screenshot/content"');
    expect(html).not.toContain("project-1");
    expect(html).not.toContain("agent-1");
  });

  it("does not expose raw project or agent ids while context is loading", () => {
    const html = renderChatIssueApproval({
      chatConversationId: "chat-raw-id",
      proposedIssue: {
        title: "Fix issue approval UI",
        description: "Render **markdown**.",
        priority: "medium",
        projectId: "project-raw-id",
        assigneeAgentId: "agent-raw-id",
      },
    });

    expect(html).toContain("Unknown project");
    expect(html).toContain("Unknown agent");
    expect(html).toContain("Chat conversation");
    expect(html).not.toContain("project-raw-id");
    expect(html).not.toContain("agent-raw-id");
    expect(html).not.toContain("chat-raw-id");
  });
});
