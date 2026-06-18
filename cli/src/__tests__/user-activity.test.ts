import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../program.js";

describe("user activity command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests the user activity ledger with agent-friendly JSON output", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        items: [
          {
            id: "activity-item-1",
            kind: "chat_message",
            occurredAt: "2026-06-18T01:00:00.000Z",
            userId: "local-board",
            actor: { type: "user", id: "local-board", displayName: null },
            summary: "User message in chat: Planning",
            excerpt: "Please implement the activity ledger.",
            source: {
              type: "chat",
              id: "chat-1",
              link: "chat://chat-1",
              provenance: {
                table: "chat_messages",
                id: "activity-item-1",
                orgId: "org-1",
              },
            },
            related: [{ type: "chat", id: "chat-1", label: "Planning" }],
          },
        ],
        nextCursor: "next-page",
      }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(runCli([
      process.execPath,
      "rudder",
      "user",
      "activity",
      "--user",
      "me",
      "--since",
      "2026-06-18T00:00:00.000Z",
      "--include",
      "chat,comments",
      "--agent-id",
      "agent-1",
      "--project-id",
      "project-1",
      "--issue-id",
      "issue-1",
      "--limit",
      "25",
      "--cursor",
      "cursor-1",
      "--org-id",
      "org-1",
      "--api-base",
      "http://localhost:3100",
      "--api-key",
      "token-1",
      "--json",
    ])).resolves.toBe(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestedUrl = new URL(url);
    expect(requestedUrl.pathname).toBe("/api/orgs/org-1/users/me/activity-ledger");
    expect(requestedUrl.searchParams.get("since")).toBe("2026-06-18T00:00:00.000Z");
    expect(requestedUrl.searchParams.get("include")).toBe("chat,comments");
    expect(requestedUrl.searchParams.get("agentId")).toBe("agent-1");
    expect(requestedUrl.searchParams.get("projectId")).toBe("project-1");
    expect(requestedUrl.searchParams.get("issueId")).toBe("issue-1");
    expect(requestedUrl.searchParams.get("limit")).toBe("25");
    expect(requestedUrl.searchParams.get("cursor")).toBe("cursor-1");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer token-1");

    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(JSON.parse(output)).toEqual({
      items: [
        expect.objectContaining({
          kind: "chat_message",
          source: expect.objectContaining({
            provenance: expect.objectContaining({ table: "chat_messages" }),
          }),
        }),
      ],
      nextCursor: "next-page",
    });
  });
});
