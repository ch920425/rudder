import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "../../packages/db/node_modules/drizzle-orm/index.js";
import {
  agents,
  chatConversations,
  chatMessages,
  createDb,
  messengerCustomGroupEntries,
  messengerCustomGroups,
} from "../../packages/db/src/index.ts";
import { E2E_DATABASE_URL } from "./support/e2e-env";

const e2eDb = createDb(E2E_DATABASE_URL);

function threadTestId(threadKey: string) {
  return `messenger-thread-${threadKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

test("forks a chat from a selected message and groups the fork family in Messenger", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("rudder.theme", "dark");
  });

  const orgRes = await page.request.post("/api/orgs", {
    data: { name: `Chat-Fork-${Date.now()}` },
  });
  expect(orgRes.ok()).toBe(true);
  const organization = await orgRes.json() as { id: string; issuePrefix: string };

  const sourceConversationId = randomUUID();
  const sourceMessageIds = [randomUUID(), randomUUID(), randomUUID()];
  const agentId = randomUUID();
  await e2eDb.insert(agents).values({
    id: agentId,
    orgId: organization.id,
    name: "Autumn",
    role: "operator_assistant",
    icon: "notionists-neutral",
    status: "idle",
  });
  await e2eDb.insert(chatConversations).values({
    id: sourceConversationId,
    orgId: organization.id,
    title: "Forkable strategy chat",
    issueCreationMode: "manual_approval",
    planMode: false,
    createdByUserId: "local-board",
    lastMessageAt: new Date("2026-06-22T08:03:00.000Z"),
    createdAt: new Date("2026-06-22T08:00:00.000Z"),
    updatedAt: new Date("2026-06-22T08:03:00.000Z"),
  });
  await e2eDb.insert(chatMessages).values([
    {
      id: sourceMessageIds[0],
      orgId: organization.id,
      conversationId: sourceConversationId,
      role: "user",
      kind: "message",
      status: "completed",
      body: "Original premise",
      createdAt: new Date("2026-06-22T08:01:00.000Z"),
      updatedAt: new Date("2026-06-22T08:01:00.000Z"),
    },
    {
      id: sourceMessageIds[1],
      orgId: organization.id,
      conversationId: sourceConversationId,
      role: "assistant",
      kind: "message",
      status: "completed",
      body: "Middle branch point",
      replyingAgentId: agentId,
      createdAt: new Date("2026-06-22T08:02:00.000Z"),
      updatedAt: new Date("2026-06-22T08:02:00.000Z"),
    },
    {
      id: sourceMessageIds[2],
      orgId: organization.id,
      conversationId: sourceConversationId,
      role: "user",
      kind: "message",
      status: "completed",
      body: "Later context that should stay out",
      createdAt: new Date("2026-06-22T08:03:00.000Z"),
      updatedAt: new Date("2026-06-22T08:03:00.000Z"),
    },
  ]);

  await page.goto("/");
  await page.evaluate((orgId) => {
    window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
  }, organization.id);
  await page.goto(`/${organization.issuePrefix}/messenger/chat/${sourceConversationId}`);

  const sourceUser = page.locator(`[data-testid="chat-user-message"][data-message-id="${sourceMessageIds[0]}"]`);
  await expect(sourceUser).toContainText("Original premise", { timeout: 15_000 });
  await sourceUser.hover();
  await expect(sourceUser.getByRole("button", { name: "Fork from here" })).toHaveCount(0);

  const sourceAssistant = page.locator(`[data-testid="chat-assistant-message"][data-message-id="${sourceMessageIds[1]}"]`);
  await expect(sourceAssistant).toContainText("Middle branch point", { timeout: 15_000 });
  await sourceAssistant.hover();
  await expect(sourceAssistant.getByRole("button", { name: "Fork from here" })).toBeVisible();
  const forkResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && response.url().includes(`/api/chats/${sourceConversationId}/fork`),
  );
  await sourceAssistant.getByRole("button", { name: "Fork from here" }).click();
  const forkResponse = await forkResponsePromise;
  expect(forkResponse.ok()).toBe(true);
  const forkedConversation = await forkResponse.json() as {
    id: string;
    lastMessageAt: string | null;
    forkedFromConversationId: string | null;
    forkedFromMessageId: string | null;
    forkRootConversationId: string | null;
  };

  expect(forkedConversation.forkedFromConversationId).toBe(sourceConversationId);
  expect(forkedConversation.forkedFromMessageId).toBe(sourceMessageIds[1]);
  expect(forkedConversation.forkRootConversationId).toBe(sourceConversationId);
  expect(Date.parse(forkedConversation.lastMessageAt ?? "")).toBeGreaterThan(Date.parse("2026-06-22T08:03:00.000Z"));
  await expect(page).toHaveURL(new RegExp(`/messenger/chat/${forkedConversation.id}$`));
  await expect(page.getByTestId("chat-messages-content")).toContainText("Original premise");
  await expect(page.getByTestId("chat-messages-content")).toContainText("Middle branch point");
  await expect(page.getByTestId("chat-assistant-message").filter({ hasText: "Middle branch point" })).toContainText("Autumn");
  await expect(page.getByTestId("chat-messages-content")).not.toContainText("Later context that should stay out");

  const messagesRes = await page.request.get(`/api/chats/${forkedConversation.id}/messages`);
  expect(messagesRes.ok()).toBe(true);
  const forkMessages = await messagesRes.json() as Array<{ role: string; body: string }>;
  expect(forkMessages.map((message) => message.body).slice(0, 2)).toEqual([
    "Original premise",
    "Middle branch point",
  ]);
  expect(forkMessages[2]?.body).toContain("[Forkable strategy chat]");
  expect(forkMessages[2]?.body).toContain(`message ${sourceMessageIds[1]}`);

  await page.goto(`/${organization.issuePrefix}/messenger`);
  await expect(page.getByTestId(threadTestId(`chat:${sourceConversationId}`))).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(threadTestId(`chat:${forkedConversation.id}`))).toBeVisible({ timeout: 15_000 });

  const groups = await e2eDb
    .select()
    .from(messengerCustomGroups)
    .where(eq(messengerCustomGroups.orgId, organization.id));
  expect(groups).toHaveLength(1);
  expect(groups[0]?.name).toContain("Forkable strategy chat");
  const groupEntries = await e2eDb
    .select()
    .from(messengerCustomGroupEntries)
    .where(eq(messengerCustomGroupEntries.groupId, groups[0]!.id));
  expect(new Set(groupEntries.map((entry) => entry.threadKey))).toEqual(new Set([
    `chat:${forkedConversation.id}`,
    `chat:${sourceConversationId}`,
  ]));
});
