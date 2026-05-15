// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue } from "@rudderhq/shared";
import { IssueProperties } from "./IssueProperties";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "auth") {
      return {
        data: { user: { id: "user-1" } },
        isLoading: false,
        error: null,
      };
    }
    if (queryKey[0] === "agents" && queryKey.length === 2) {
      return {
        data: [
          {
            id: "agent-1",
            name: "Ella",
            role: "cto",
            title: "Chief Technology Officer",
            icon: null,
            status: "active",
          },
        ],
        isLoading: false,
        error: null,
      };
    }
    return {
      data: [],
      isLoading: false,
      error: null,
    };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("../context/OrganizationContext", () => ({
  useOrganization: () => ({
    selectedOrganizationId: "org-1",
  }),
}));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: import("react").ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

let cleanupFn: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
});

const baseIssue: Issue = {
  id: "issue-1",
  orgId: "org-1",
  projectId: null,
  projectWorkspaceId: null,
  goalId: null,
  parentId: null,
  title: "Issue with long assignee",
  description: null,
  status: "todo",
  priority: "medium",
  boardOrder: 1000,
  assigneeAgentId: "agent-1",
  assigneeUserId: null,
  reviewerAgentId: null,
  reviewerUserId: null,
  checkoutRunId: null,
  executionRunId: null,
  executionAgentNameKey: null,
  executionLockedAt: null,
  createdByAgentId: null,
  createdByUserId: "user-1",
  issueNumber: 1,
  identifier: "RUD-1",
  requestDepth: 0,
  billingCode: null,
  assigneeAgentRuntimeOverrides: null,
  executionWorkspaceId: null,
  executionWorkspacePreference: null,
  executionWorkspaceSettings: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  hiddenAt: null,
  createdAt: new Date("2026-04-19T08:00:00.000Z"),
  updatedAt: new Date("2026-04-19T08:00:00.000Z"),
};

describe("IssueProperties", () => {
  it("allows long assignee labels to shrink inside the properties panel", () => {
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
      root.render(<IssueProperties issue={baseIssue} onUpdate={vi.fn()} />);
    });

    const label = container.querySelector('[data-slot="assignee-label"][data-kind="agent"]');
    const trigger = label?.closest("button");

    expect(label?.textContent).toContain("Ella");
    expect(label?.textContent).toContain("Chief Technology Officer");
    expect(label?.textContent).not.toContain("Ella (Chief Technology Officer)");
    expect(trigger?.classList.contains("min-w-0")).toBe(true);
    expect(trigger?.classList.contains("max-w-full")).toBe(true);
    expect(label?.classList.contains("min-w-0")).toBe(true);
    expect(label?.querySelector('[data-slot="agent-title-badge"]')).toBeTruthy();
    expect(label?.querySelector('[data-slot="agent-title-badge"] span')?.classList.contains("truncate")).toBe(true);
  });

  it("does not render a workspace property row", () => {
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
      root.render(<IssueProperties issue={baseIssue} onUpdate={vi.fn()} />);
    });

    expect(container.textContent).not.toContain("Workspace");
    expect(container.textContent).not.toContain("Execution workspace");
  });

  it("renders assignee picker agents as two-line menu rows", () => {
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
      root.render(<IssueProperties issue={baseIssue} onUpdate={vi.fn()} inline />);
    });

    const label = container.querySelector('[data-slot="assignee-label"][data-kind="agent"]');
    const trigger = label?.closest("button");

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const menuLabel = container.querySelector('[data-slot="agent-menu-label"]');
    const supportingLabel = container.querySelector('[data-slot="agent-menu-supporting-label"]');
    const scrollRegion = container.querySelector('[data-testid="issue-properties-assignee-scroll"]');

    expect(menuLabel?.textContent).toContain("Ella");
    expect(supportingLabel?.textContent).toBe("Chief Technology Officer");
    expect(menuLabel?.querySelector('[data-slot="agent-title-badge"]')).toBeNull();
    expect(supportingLabel?.classList.contains("truncate")).toBe(true);
    expect(scrollRegion?.classList.contains("scrollbar-auto-hide")).toBe(true);
  });

  it("renders parent and sub-issues in the properties hierarchy section", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const childIssue: Issue = {
      ...baseIssue,
      id: "child-1",
      parentId: "issue-1",
      title: "Follow-up implementation",
      identifier: "RUD-2",
      issueNumber: 2,
    };
    const parentedIssue: Issue = {
      ...baseIssue,
      parentId: "parent-1",
      ancestors: [
        {
          id: "parent-1",
          identifier: "RUD-0",
          title: "Parent task",
          description: null,
          status: "todo",
          priority: "medium",
          assigneeAgentId: null,
          assigneeUserId: null,
          reviewerAgentId: null,
          reviewerUserId: null,
          projectId: null,
          goalId: null,
          project: null,
          goal: null,
        },
      ],
    };

    cleanupFn = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };

    act(() => {
      root.render(
        <IssueProperties
          issue={parentedIssue}
          onUpdate={vi.fn()}
          childIssues={[childIssue]}
          onCreateSubIssue={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Parent");
    expect(container.textContent).toContain("Parent task");
    expect(container.querySelector('a[href="/issues/RUD-0"]')).toBeTruthy();
    expect(container.textContent).toContain("Sub-issues");
    expect(container.textContent).toContain("Follow-up implementation");
    expect(container.textContent).toContain("RUD-2");
    expect(container.querySelector('a[href="/issues/RUD-2"]')).toBeTruthy();
  });

  it("opens the sub-issue composer in a modal from the properties row", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const createSubIssue = vi.fn().mockResolvedValue(undefined);

    cleanupFn = () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    };

    act(() => {
      root.render(
        <IssueProperties
          issue={baseIssue}
          onUpdate={vi.fn()}
          childIssues={[]}
          onCreateSubIssue={createSubIssue}
        />,
      );
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Create sub-issue"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Create sub-issue");

    const input = document.body.querySelector<HTMLInputElement>("#sub-issue-title-issue-1");
    expect(input).toBeTruthy();

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "Split implementation work",
      );
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      input!.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createSubIssue).toHaveBeenCalledWith("Split implementation work");
  });
});
