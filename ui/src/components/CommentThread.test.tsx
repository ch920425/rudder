// @vitest-environment node

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CommentThread } from "./CommentThread";

vi.mock("./MarkdownEditor", () => ({
  MarkdownEditor: () => <div>Markdown editor</div>,
}));

vi.mock("./MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/plugins/slots", () => ({
  PluginSlotOutlet: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, title }: { children: ReactNode; title?: string }) => (
    <button title={title}>{children}</button>
  ),
}));

vi.mock("./transcript/useLiveRunTranscripts", () => ({
  useLiveRunTranscripts: () => ({
    transcriptByRun: new Map(),
    hasOutputForRun: () => false,
  }),
}));

describe("CommentThread", () => {
  it("offers a general file attachment control for comments", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CommentThread
          comments={[]}
          onAdd={async () => undefined}
          imageUploadHandler={async () => "/api/attachments/attachment-1/content"}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("application/pdf");
    expect(html).toContain("text/csv");
    expect(html).toContain('title="Attach file"');
  });

  it("uses the operator nickname for board-authored comments", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CommentThread
          comments={[
            {
              id: "comment-1",
              issueId: "issue-1",
              orgId: "org-1",
              authorUserId: "user-1",
              authorAgentId: null,
              body: "Looks good.",
              createdAt: new Date("2026-05-07T00:00:00.000Z"),
              updatedAt: new Date("2026-05-07T00:00:00.000Z"),
            },
          ]}
          onAdd={async () => undefined}
          operatorDisplayName="Zee"
        />
      </MemoryRouter>,
    );

    expect(html).toContain("Zee");
    expect(html).not.toContain("You");
  });

  it("falls back to You for board-authored comments without a nickname", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CommentThread
          comments={[
            {
              id: "comment-1",
              issueId: "issue-1",
              orgId: "org-1",
              authorUserId: "user-1",
              authorAgentId: null,
              body: "Looks good.",
              createdAt: new Date("2026-05-07T00:00:00.000Z"),
              updatedAt: new Date("2026-05-07T00:00:00.000Z"),
            },
          ]}
          onAdd={async () => undefined}
          operatorDisplayName="   "
        />
      </MemoryRouter>,
    );

    expect(html).toContain("You");
  });
});
