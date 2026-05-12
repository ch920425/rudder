// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChatConversation, ChatMessage, Project } from "@rudderhq/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/context/ThemeContext";
import { Chat } from "./Chat";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PREVIEW_IMAGE_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='320' viewBox='0 0 480 320'%3E%3Crect width='480' height='320' fill='%232f80ed'/%3E%3Ctext x='240' y='168' fill='white' font-size='34' font-family='Arial' text-anchor='middle'%3EPreview%3C/text%3E%3C/svg%3E";

const mockState = vi.hoisted(() => ({
  conversationId: "chat-1",
  conversations: [] as ChatConversation[],
  messagesByChatId: {} as Record<string, ChatMessage[]>,
  projects: [] as Project[],
  invalidateQueries: vi.fn(),
  markRead: vi.fn(),
  mutations: [] as unknown[],
  navigate: vi.fn(),
  pushToast: vi.fn(),
  setBreadcrumbs: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled = true }: { queryKey: readonly unknown[]; enabled?: boolean }) => {
    if (!enabled) return { data: undefined, isPending: false, isLoading: false, error: null };
    if (queryKey[0] === "chats" && queryKey[2] === "active") {
      return { data: mockState.conversations, isPending: false, isLoading: false, error: null };
    }
    if (queryKey[0] === "chats" && queryKey[1] === "detail") {
      return {
        data: mockState.conversations.find((chat) => chat.id === queryKey[2]) ?? null,
        isPending: false,
        isLoading: false,
        error: null,
      };
    }
    if (queryKey[0] === "chats" && queryKey[1] === "messages") {
      return {
        data: mockState.messagesByChatId[String(queryKey[2])] ?? [],
        isPending: false,
        isLoading: false,
        error: null,
      };
    }
    if (queryKey[0] === "agents") {
      return {
        data: [{ id: "agent-1", name: "Wesley", role: "engineer", title: "Founding Engineer", status: "active", icon: null }],
        isPending: false,
        isLoading: false,
        error: null,
      };
    }
    if (queryKey[0] === "projects") {
      return { data: mockState.projects, isPending: false, isLoading: false, error: null };
    }
    if (queryKey[0] === "instance") {
      return { data: { nickname: "" }, isPending: false, isLoading: false, error: null };
    }
    return { data: [], isPending: false, isLoading: false, error: null };
  },
  useMutation: () => ({
    isPending: false,
    mutate: (variables: unknown) => {
      mockState.mutations.push(variables);
      mockState.markRead(variables);
    },
  }),
  useQueryClient: () => ({
    invalidateQueries: mockState.invalidateQueries,
    setQueryData: vi.fn(),
  }),
}));

vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: `/messenger/chat/${mockState.conversationId}`, search: "", hash: "", key: "chat" }),
  useNavigate: () => mockState.navigate,
  useParams: () => ({ conversationId: mockState.conversationId }),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("@/context/OrganizationContext", () => ({
  useOrganization: () => ({
    selectedOrganizationId: "org-1",
    selectedOrganization: { id: "org-1", name: "Rudder", urlKey: "RUD" },
  }),
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockState.setBreadcrumbs }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ pushToast: mockState.pushToast }),
}));

vi.mock("@/context/SidebarContext", () => ({
  useSidebar: () => ({ isMobile: false }),
}));

vi.mock("@/context/I18nContext", () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, string>) => values?.name ?? key }),
}));

vi.mock("@/context/ChatGenerationContext", () => ({
  useChatGenerations: () => ({
    abortChatStream: vi.fn(),
    sendInFlightByChatId: {},
    setChatSendInFlight: vi.fn(),
    setStreamAbortController: vi.fn(),
    setStreamDraftForChat: vi.fn(),
    streamDrafts: {},
  }),
}));

vi.mock("@/components/MarkdownEditor", async () => {
  const React = await import("react");
  return {
    MarkdownEditor: React.forwardRef((_props: unknown, ref) => {
      React.useImperativeHandle(ref, () => ({ focus: vi.fn() }));
      return <div data-testid="mock-markdown-editor" />;
    }),
  };
});

let cleanupFn: (() => void) | null = null;
let storageState: Record<string, string> = {};

function chat(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: "chat-1",
    orgId: "org-1",
    status: "active",
    title: "Pending proposal chat",
    summary: null,
    latestReplyPreview: null,
    preferredAgentId: "agent-1",
    routedAgentId: null,
    primaryIssueId: null,
    primaryIssue: null,
    issueCreationMode: "manual_approval",
    planMode: false,
    createdByUserId: null,
    lastMessageAt: new Date("2026-05-12T09:00:00.000Z"),
    lastReadAt: null,
    isPinned: false,
    isUnread: false,
    unreadCount: 0,
    needsAttention: false,
    resolvedAt: null,
    contextLinks: [],
    chatRuntime: {
      sourceType: "agent",
      sourceLabel: "Wesley",
      runtimeAgentId: "agent-1",
      agentRuntimeType: "codex",
      model: null,
      available: true,
      error: null,
    },
    createdAt: new Date("2026-05-12T09:00:00.000Z"),
    updatedAt: new Date("2026-05-12T09:00:00.000Z"),
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "10000000-0000-4000-8000-000000000010",
    orgId: "org-1",
    urlKey: "rudder-mkt",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Rudder mkt",
    description: null,
    status: "planned",
    leadAgentId: null,
    targetDate: null,
    color: "#82b366",
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      configured: false,
      scope: "none",
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "",
      effectiveLocalFolder: "",
      origin: "local_folder",
    },
    resources: [],
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date("2026-05-12T09:00:00.000Z"),
    updatedAt: new Date("2026-05-12T09:00:00.000Z"),
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message-1",
    orgId: "org-1",
    conversationId: "chat-1",
    role: "user",
    kind: "message",
    status: "completed",
    body: "Attached image",
    structuredPayload: null,
    approvalId: null,
    approval: null,
    attachments: [],
    transcript: [],
    replyingAgentId: null,
    chatTurnId: null,
    turnVariant: 0,
    supersededAt: null,
    createdAt: new Date("2026-05-12T09:01:00.000Z"),
    updatedAt: new Date("2026-05-12T09:01:00.000Z"),
    ...overrides,
  };
}

function pendingIssueProposal(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return message({
    id: "proposal-1",
    role: "assistant",
    kind: "issue_proposal",
    body: "Please review this proposal.",
    structuredPayload: {
      issueProposal: {
        title: "Fix attachment preview",
        priority: "medium",
        description: "Move the preview dialog outside the composer.",
      },
    },
    approvalId: "approval-1",
    approval: {
      id: "approval-1",
      orgId: "org-1",
      type: "chat_issue_creation",
      requestedByAgentId: "agent-1",
      requestedByUserId: null,
      status: "pending",
      payload: {},
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: new Date("2026-05-12T09:02:00.000Z"),
      updatedAt: new Date("2026-05-12T09:02:00.000Z"),
    },
    createdAt: new Date("2026-05-12T09:02:00.000Z"),
    updatedAt: new Date("2026-05-12T09:02:00.000Z"),
    ...overrides,
  });
}

function imageMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return message({
    id: "image-message-1",
    attachments: [
      {
        id: "attachment-1",
        orgId: "org-1",
        conversationId: "chat-1",
        messageId: "image-message-1",
        assetId: "asset-1",
        provider: "local_disk",
        objectKey: "asset-1",
        contentPath: PREVIEW_IMAGE_SRC,
        contentType: "image/svg+xml",
        byteSize: 68,
        sha256: "sha256",
        originalFilename: "proposal-screenshot.png",
        createdByAgentId: null,
        createdByUserId: "local-board",
        createdAt: new Date("2026-05-12T09:01:00.000Z"),
        updatedAt: new Date("2026-05-12T09:01:00.000Z"),
      },
    ],
    ...overrides,
  });
}

function installLocalStorageMock() {
  storageState = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storageState[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storageState[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete storageState[key];
    }),
    clear: vi.fn(() => {
      storageState = {};
    }),
  });
}

function renderChat() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanupFn = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  const render = (targetRoot: Root) => {
    targetRoot.render(
      <ThemeProvider>
        <Chat />
      </ThemeProvider>,
    );
  };

  act(() => {
    render(root);
  });

  return {
    container,
    rerender: () => act(() => render(root)),
  };
}

beforeEach(() => {
  installLocalStorageMock();
  mockState.conversationId = "chat-1";
  mockState.conversations = [
    chat({ id: "chat-1", title: "Pending proposal chat" }),
    chat({ id: "chat-2", title: "Other chat", lastMessageAt: new Date("2026-05-12T09:10:00.000Z") }),
  ];
  mockState.projects = [
    project(),
    project({
      id: "10000000-0000-4000-8000-000000000011",
      urlKey: "launch",
      name: "Launch Ops",
      color: "#2f80ed",
    }),
  ];
  mockState.messagesByChatId = {
    "chat-1": [imageMessage(), pendingIssueProposal()],
    "chat-2": [message({ id: "other-message-1", conversationId: "chat-2", body: "Other chat" })],
  };
  mockState.invalidateQueries.mockReset();
  mockState.markRead.mockReset();
  mockState.mutations = [];
  mockState.navigate.mockReset();
  mockState.pushToast.mockReset();
  mockState.setBreadcrumbs.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Chat attachment previews", () => {
  it("opens message image previews while a pending proposal hides the composer and clears on conversation change", () => {
    const { container, rerender } = renderChat();

    expect(container.querySelector("[data-testid='proposal-review-block']")).not.toBeNull();
    expect(container.querySelector("[data-testid='chat-composer-toolbar']")).toBeNull();

    const imageButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='chat-image-attachment'] button",
    );
    expect(imageButton).not.toBeNull();

    act(() => {
      imageButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const preview = document.body.querySelector("[data-testid='chat-image-preview-dialog']");
    expect(preview).not.toBeNull();
    expect(preview?.querySelector("img")?.getAttribute("alt")).toBe("proposal-screenshot.png");

    mockState.conversationId = "chat-2";
    rerender();

    expect(document.body.querySelector("[data-testid='chat-image-preview-dialog']")).toBeNull();
  });
});

describe("Chat project context selector", () => {
  it("keeps the project selector editable after a conversation already has project context", () => {
    mockState.conversations = [
      chat({
        id: "chat-1",
        contextLinks: [
          {
            id: "context-project-1",
            orgId: "org-1",
            conversationId: "chat-1",
            entityType: "project",
            entityId: "10000000-0000-4000-8000-000000000010",
            metadata: null,
            entity: {
              type: "project",
              id: "10000000-0000-4000-8000-000000000010",
              label: "Rudder mkt",
              subtitle: null,
              identifier: null,
              status: "active",
              href: "/projects/10000000-0000-4000-8000-000000000010",
            },
            createdAt: new Date("2026-05-12T09:00:00.000Z"),
            updatedAt: new Date("2026-05-12T09:00:00.000Z"),
          },
        ],
      }),
    ];
    mockState.messagesByChatId = { "chat-1": [] };

    const { container } = renderChat();

    const projectSelector = container.querySelector<HTMLButtonElement>("[data-testid='chat-project-selector']");
    expect(projectSelector).not.toBeNull();
    expect(projectSelector?.textContent).toContain("Rudder mkt");

    act(() => {
      projectSelector?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const launchProjectOption = [...document.body.querySelectorAll<HTMLButtonElement>("[data-chat-composer-menu-item]")]
      .find((button) => button.textContent?.includes("Launch Ops"));
    expect(launchProjectOption).not.toBeNull();

    act(() => {
      launchProjectOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(projectSelector?.textContent).toContain("Launch Ops");
    expect(mockState.mutations).toContainEqual({
      chatId: "chat-1",
      projectId: "10000000-0000-4000-8000-000000000011",
      previousProjectId: "10000000-0000-4000-8000-000000000010",
    });
  });
});
