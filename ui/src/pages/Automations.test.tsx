// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Automations } from "./Automations";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
const mockSetHeaderActions = vi.fn();

const automation = {
  id: "auto-1",
  orgId: "org-1",
  projectId: "project-1",
  goalId: null,
  parentIssueId: null,
  title: "flomo memo export",
  description: "Export recent memos.",
  assigneeAgentId: "agent-1",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "skip_missed",
  createdByAgentId: null,
  createdByUserId: null,
  updatedByAgentId: null,
  updatedByUserId: null,
  lastTriggeredAt: "2026-05-11T12:35:18",
  lastEnqueuedAt: "2026-05-11T12:35:18",
  createdAt: "2026-05-11T12:00:00",
  updatedAt: "2026-05-11T12:35:18",
  lastRun: {
    id: "run-1",
    orgId: "org-1",
    automationId: "auto-1",
    triggerId: "trigger-1",
    source: "schedule",
    status: "issue_created",
    triggeredAt: "2026-05-11T12:35:18",
    idempotencyKey: null,
    triggerPayload: null,
    linkedIssueId: "issue-1",
    coalescedIntoRunId: null,
    failureReason: null,
    completedAt: "2026-05-11T12:35:20",
    createdAt: "2026-05-11T12:35:18",
    updatedAt: "2026-05-11T12:35:20",
  },
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === "automations") {
      return { data: [automation], isLoading: false, error: null };
    }
    if (queryKey[0] === "agents") {
      return {
        data: [
          {
            id: "agent-1",
            name: "Mira",
            role: "assistant",
            title: "Zeeland Personal Assistant",
            status: "active",
            icon: null,
          },
        ],
      };
    }
    if (queryKey[0] === "projects") {
      return {
        data: [
          {
            id: "project-1",
            name: "uranus",
            description: null,
            color: "#22c55e",
          },
        ],
      };
    }
    return { data: [], isLoading: false, error: null };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../context/OrganizationContext", () => ({
  useOrganization: () => ({ selectedOrganizationId: "org-1" }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({
    setBreadcrumbs: vi.fn(),
    setHeaderActions: mockSetHeaderActions,
  }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

vi.mock("../components/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="Instructions" />,
}));

vi.mock("../components/InlineEntitySelector", () => ({
  InlineEntitySelector: () => <button type="button">Select</button>,
}));

vi.mock("../components/PageSkeleton", () => ({
  PageSkeleton: () => <div>Loading...</div>,
}));

vi.mock("../components/EmptyState", () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("../components/AgentIconPicker", () => ({
  AgentIcon: () => <span aria-hidden="true">icon</span>,
}));

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function renderPage() {
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
    root.render(<Automations />);
  });

  return container;
}

describe("Automations", () => {
  it("renders last run as a fixed timestamp without the run status caption", async () => {
    const container = renderPage();

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("2026-05-11 12:35:18");
    expect(container.textContent).not.toContain("issue created");
  });
});
