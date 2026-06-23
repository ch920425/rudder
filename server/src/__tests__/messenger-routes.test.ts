import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { messengerRoutes } from "../routes/messenger.js";

const mockMessengerService = vi.hoisted(() => ({
  listCustomGroups: vi.fn(),
  createCustomGroup: vi.fn(),
  createCustomGroupWithEntries: vi.fn(),
  updateCustomGroup: vi.fn(),
  listThreadTitles: vi.fn(),
  listCustomGroupThreadTitles: vi.fn(),
  separateCustomGroup: vi.fn(),
  deleteCustomGroup: vi.fn(),
  reorderCustomGroups: vi.fn(),
  assignThreadToCustomGroup: vi.fn(),
  reorderCustomGroupEntries: vi.fn(),
  removeThreadFromCustomGroups: vi.fn(),
  listThreadSummaries: vi.fn(),
}));

const mockProductIntelligence = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("../services/messenger.js", () => ({
  messengerService: () => mockMessengerService,
}));

vi.mock("../services/product-intelligence.js", () => ({
  productIntelligenceService: () => mockProductIntelligence,
}));

function createApp(actor: Record<string, unknown> = {
  type: "board",
  source: "local_implicit",
  userId: "user-1",
  orgIds: ["org-1"],
}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as typeof req & { actor: Record<string, unknown> }).actor = actor;
    next();
  });
  app.use("/api", messengerRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("Messenger custom group title routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessengerService.createCustomGroupWithEntries.mockResolvedValue({ groups: [] });
    mockMessengerService.updateCustomGroup.mockResolvedValue({
      id: "group-1",
      orgId: "org-1",
      userId: "user-1",
      name: "Generated group",
      icon: "folder::amber",
      sortOrder: 0,
      collapsed: false,
      pinnedAt: null,
      createdAt: new Date("2026-04-11T09:40:00.000Z"),
      updatedAt: new Date("2026-04-11T09:40:00.000Z"),
    });
    mockMessengerService.listThreadTitles.mockResolvedValue(["Planning chat", "Issues"]);
    mockMessengerService.listCustomGroupThreadTitles.mockResolvedValue(["Planning chat", "Issue triage"]);
  });

  it("generates a custom group title during drag merge when requested", async () => {
    mockProductIntelligence.execute.mockResolvedValueOnce({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "Planning and Issues",
    });

    const res = await request(createApp())
      .post("/api/orgs/org-1/messenger/groups/merge")
      .send({
        name: "Planning chat",
        icon: "folder::amber",
        threadKeys: ["chat:chat-1", "issues"],
        autoGenerateName: true,
      });

    expect(res.status).toBe(201);
    expect(mockMessengerService.listThreadTitles).toHaveBeenCalledWith("org-1", "user-1", ["chat:chat-1", "issues"]);
    expect(mockProductIntelligence.execute).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org-1",
      purpose: "lightweight",
      feature: "messenger_group_title",
      prompt: expect.stringContaining("Planning chat"),
    }));
    expect(mockMessengerService.createCustomGroupWithEntries).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "Planning and Issues",
      "folder::amber",
      ["chat:chat-1", "issues"],
    );
  });

  it("falls back to the provided merge name when group title generation fails", async () => {
    mockProductIntelligence.execute.mockRejectedValueOnce(new Error("Fast Intelligence unavailable"));

    const res = await request(createApp())
      .post("/api/orgs/org-1/messenger/groups/merge")
      .send({
        name: "Planning chat",
        icon: "folder::amber",
        threadKeys: ["chat:chat-1", "issues"],
        autoGenerateName: true,
      });

    expect(res.status).toBe(201);
    expect(mockMessengerService.createCustomGroupWithEntries).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "Planning chat",
      "folder::amber",
      ["chat:chat-1", "issues"],
    );
  });

  it("regenerates an existing custom group title from member titles", async () => {
    mockProductIntelligence.execute.mockResolvedValueOnce({
      exitCode: 0,
      signal: null,
      timedOut: false,
      resultJson: { stdout: "Planning Triage" },
    });

    const res = await request(createApp())
      .post("/api/orgs/org-1/messenger/groups/group-1/title/regenerate")
      .send();

    expect(res.status).toBe(200);
    expect(mockMessengerService.listCustomGroupThreadTitles).toHaveBeenCalledWith("org-1", "user-1", "group-1");
    expect(mockMessengerService.updateCustomGroup).toHaveBeenCalledWith("org-1", "user-1", "group-1", {
      name: "Planning Triage",
    });
  });

  it("does not mutate the group when title regeneration returns unusable output", async () => {
    mockProductIntelligence.execute.mockResolvedValueOnce({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "```",
    });

    const res = await request(createApp())
      .post("/api/orgs/org-1/messenger/groups/group-1/title/regenerate")
      .send();

    expect(res.status).toBe(422);
    expect(mockMessengerService.updateCustomGroup).not.toHaveBeenCalled();
  });
});
