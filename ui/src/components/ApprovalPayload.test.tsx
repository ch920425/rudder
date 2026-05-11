// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent, Project } from "@rudderhq/shared";
import { ThemeProvider } from "../context/ThemeContext";
import { ApprovalPayloadRenderer } from "./ApprovalPayload";

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }) => (open ? <div data-testid="mock-dialog-root">{children}</div> : null),
  DialogContent: ({
    children,
    showCloseButton: _showCloseButton,
    ...props
  }: {
    children: ReactNode;
    showCloseButton?: boolean;
  }) => <div data-slot="dialog-content" {...props}>{children}</div>,
  DialogClose: ({
    children,
    ...props
  }: {
    children: ReactNode;
  }) => <button data-slot="dialog-close" {...props}>{children}</button>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
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

const reviewerAgent = {
  id: "agent-2",
  name: "CTO",
  role: "cto",
  title: "Chief Technology Officer",
  icon: null,
} as Agent;

function renderChatIssueApproval(payload: Record<string, unknown>, context = {}) {
  return renderToStaticMarkup(
    <ThemeProvider>
      <ApprovalPayloadRenderer type="chat_issue_creation" payload={payload} context={context} />
    </ThemeProvider>,
  );
}

function renderChatIssueApprovalDom(payload: Record<string, unknown>, context = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanupFn = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  act(() => {
    root.render(
      <ThemeProvider>
        <ApprovalPayloadRenderer type="chat_issue_creation" payload={payload} context={context} />
      </ThemeProvider>,
    );
  });
  return container;
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
          reviewerAgentId: reviewerAgent.id,
        },
      },
      { projects: [project], agents: [agent, reviewerAgent], chatConversation: { id: "chat-1", title: "Messenger intake" } },
    );

    expect(html).toContain("Agent proposed a new issue from chat");
    expect(html).toContain("Messenger intake");
    expect(html).toContain('href="/messenger/chat/chat-1"');
    expect(html).toContain("Project Atlas");
    expect(html).toContain("Wesley");
    expect(html).toContain("CTO");
    expect(html).toContain("<h2");
    expect(html).toContain("Review Summary");
    expect(html).toContain("<strong>markdown</strong>");
    expect(html).toContain('src="/api/assets/approval-screenshot/content"');
    expect(html).not.toContain("project-1");
    expect(html).not.toContain("agent-1");
  });

  it("does not open inline image preview from issue approval descriptions", () => {
    const container = renderChatIssueApprovalDom({
      chatConversationId: "chat-1",
      proposedIssue: {
        title: "Fix issue approval UI",
        description: "![Approval screenshot](/api/assets/approval-screenshot/content)",
        priority: "medium",
      },
    });

    const image = container.querySelector("img");
    expect(image).toBeTruthy();

    act(() => {
      image?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    expect(document.body.querySelector('[data-testid="markdown-body-image-preview-dialog"]')).toBeNull();
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
