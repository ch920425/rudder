// @vitest-environment jsdom

import type { Agent } from "@rudderhq/shared";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConfigForm } from "./AgentConfigForm";
import { TooltipProvider } from "./ui/tooltip";

type MutationOptions = {
  mutationFn?: (input: unknown) => Promise<unknown>;
  onSuccess?: (result: unknown) => unknown | Promise<unknown>;
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useMutation: (options?: MutationOptions) => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(async (input: unknown) => {
      const result = options?.mutationFn ? await options.mutationFn(input) : undefined;
      await options?.onSuccess?.(result);
      return result;
    }),
    isPending: false,
    data: undefined,
    error: null,
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

vi.mock("./AgentConfigForm.environment", () => ({
  AdapterEnvironmentError: ({ message }: { message: string }) => <div>{message}</div>,
  AdapterEnvironmentResult: ({ label }: { label: string }) => <div>{label}</div>,
  SortableRuntimeProviderCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: ({ value, placeholder }: { value?: string; placeholder?: string }) => (
    <div data-testid="markdown-editor">{value || placeholder}</div>
  ),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
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

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    orgId: "org-1",
    name: "Wesley",
    urlKey: "wesley",
    role: "ceo",
    title: "Operator Assistant",
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: null,
    agentRuntimeType: "codex_local",
    agentRuntimeConfig: { model: "gpt-5.5" },
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: true, canManageSkills: true },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date("2026-06-22T20:52:37.973Z"),
    updatedAt: new Date("2026-06-22T20:52:37.973Z"),
    ...overrides,
  };
}

describe("AgentConfigForm identity", () => {
  it("shows role separately from title in edit mode", () => {
    const container = render(
      <TooltipProvider>
        <AgentConfigForm
          mode="edit"
          agent={agent()}
          onSave={vi.fn()}
          showAdapterTestEnvironmentButton={false}
          hidePromptTemplate
        />
      </TooltipProvider>,
    );

    const roleDisplay = container.querySelector('[data-testid="agent-role-display"]');
    const titleInput = Array.from(container.querySelectorAll("input"))
      .find((input) => input.value === "Operator Assistant");

    expect(container.textContent).toContain("Title");
    expect(titleInput).toBeTruthy();
    expect(container.textContent).toContain("Role");
    expect(roleDisplay?.textContent).toContain("CEO");
    expect(roleDisplay?.textContent).toContain("ceo");
  });
});
