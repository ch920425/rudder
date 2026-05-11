// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatEmptyStatePromptOptions,
  EMPTY_STATE_PROMPT_GROUPS,
  OPEN_TASK_PRIORITY_PROMPT,
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

vi.mock("@/components/transcript/RunTranscriptView", () => ({
  RunTranscriptView: () => null,
}));

vi.mock("@/components/MarkdownEditor", () => ({
  MarkdownEditor: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
});

function render(element: ReactNode) {
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
    root.render(element);
  });
  return container;
}

function turnChatIntoIssueGroup() {
  const group = EMPTY_STATE_PROMPT_GROUPS.find((candidate) => candidate.label === "Turn a chat into an issue");
  if (!group) throw new Error("Missing Turn a chat into an issue prompt group");
  return group;
}

describe("Chat empty-state prompt examples", () => {
  it("includes the open-task priority prompt under issue examples", () => {
    expect(turnChatIntoIssueGroup().examples).toContain(OPEN_TASK_PRIORITY_PROMPT);
  });

  it("selects the priority prompt without using a submit button", () => {
    const onExampleSelect = vi.fn();
    const container = render(
      <ChatEmptyStatePromptOptions
        group={turnChatIntoIssueGroup()}
        optionsId="chat-empty-state-prompt-options"
        entered
        originX="50%"
        onExampleSelect={onExampleSelect}
      />,
    );

    const priorityPromptButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === OPEN_TASK_PRIORITY_PROMPT);

    expect(priorityPromptButton).toBeTruthy();
    expect(priorityPromptButton?.getAttribute("type")).toBe("button");

    act(() => {
      priorityPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onExampleSelect).toHaveBeenCalledWith(OPEN_TASK_PRIORITY_PROMPT);
  });
});
