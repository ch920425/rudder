import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "../../packages/db/node_modules/drizzle-orm/index.js";
import {
  agentIntegrationChatBindings,
  agentIntegrationOutboundMessages,
  agentIntegrations,
  chatConversations,
  chatMessages,
  createDb,
  heartbeatRuns,
  organizationSecrets,
} from "../../packages/db/src/index.ts";
import { E2E_DATABASE_URL } from "./support/e2e-env";

const e2eDb = createDb(E2E_DATABASE_URL);
const CAPTURE_VISUAL_PROOF = process.env.RUDDER_CAPTURE_FEISHU_BADGE_PROOF === "1";
const VISUAL_PROOF_DIR = "/tmp/rudder-feishu-source-badges";

test.afterAll(async () => {
  await (e2eDb as unknown as { $client?: { end: () => Promise<void> } }).$client?.end();
});

test.describe("Feishu source badges", () => {
  test("keeps Feishu-bound chats read-only and forks into a native Rudder chat", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: { name: `Feishu-Chat-Controls-${Date.now()}` },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { id: string; issuePrefix: string };

    const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Feishu Operator",
        role: "engineer",
        agentRuntimeType: "codex_local",
        agentRuntimeConfig: { model: "gpt-5.4" },
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agent = await agentRes.json() as { id: string };

    const conversationId = randomUUID();
    const integrationId = randomUUID();
    const secretId = randomUUID();
    const externalChatId = `oc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    await e2eDb.insert(organizationSecrets).values({
      id: secretId,
      orgId: organization.id,
      name: `Feishu credentials ${secretId}`,
      provider: "local_encrypted",
    });
    await e2eDb.insert(agentIntegrations).values({
      id: integrationId,
      orgId: organization.id,
      agentId: agent.id,
      provider: "feishu",
      status: "active",
      transport: "long_connection",
      providerRegion: "feishu_cn",
      appCredentialSecretId: secretId,
      externalAppId: `cli_${randomUUID().replace(/-/g, "")}`,
      externalBotOpenId: "ou_feishu_chat_controls_bot",
    });
    await e2eDb.insert(chatConversations).values({
      id: conversationId,
      orgId: organization.id,
      title: "/issue Fix Feishu inbox",
      summary: "A Feishu-origin chat that must be forked before local continuation.",
      issueCreationMode: "manual_approval",
      planMode: false,
      preferredAgentId: agent.id,
      lastMessageAt: new Date("2026-06-23T08:30:00.000Z"),
      createdAt: new Date("2026-06-23T08:00:00.000Z"),
      updatedAt: new Date("2026-06-23T08:30:00.000Z"),
    });
    await e2eDb.insert(chatMessages).values({
      id: randomUUID(),
      orgId: organization.id,
      conversationId,
      role: "user",
      kind: "message",
      status: "completed",
      body: "Message from Feishu",
      createdAt: new Date("2026-06-23T08:30:00.000Z"),
      updatedAt: new Date("2026-06-23T08:30:00.000Z"),
    });
    await e2eDb.insert(agentIntegrationChatBindings).values({
      orgId: organization.id,
      integrationId,
      conversationId,
      externalChatId,
      externalChatType: "p2p",
    });

    await page.addInitScript((orgId: string) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/messenger/chat/${conversationId}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Message from Feishu")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chat-external-bound-readonly")).toBeVisible();
    await expect(page.getByTestId("feishu-quick-command")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "editable markdown" })).toHaveCount(0);

    const directSendRes = await page.request.post(`/api/chats/${conversationId}/messages`, {
      data: { body: "Local Rudder continuation should be blocked." },
    });
    expect(directSendRes.status()).toBe(409);
    expect(await directSendRes.json()).toMatchObject({ error: "Fork this Feishu chat to continue in Rudder" });

    await page.getByTestId("chat-actions-trigger").click();
    await expect(page.getByRole("menuitem", { name: "Pin Chat" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Fork latest" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Archive" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    const forkResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/chats/${conversationId}/fork`) && response.request().method() === "POST",
    );
    await page.getByTestId("chat-fork-to-continue").click();
    const forkResponse = await forkResponsePromise;
    expect(forkResponse.status()).toBe(201);
    const forked = await forkResponse.json() as {
      id: string;
      forkedFromConversationId: string | null;
      sourceMetadata: unknown | null;
      mutability: string;
    };
    expect(forked.forkedFromConversationId).toBe(conversationId);
    expect(forked.sourceMetadata).toBeNull();
    expect(forked.mutability).toBe("native_fork_from_external");

    await expect(page).toHaveURL(new RegExp(`/${organization.issuePrefix}/messenger/chat/${forked.id}`));
    await expect(page.getByTestId("chat-external-bound-readonly")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "editable markdown" })).toBeVisible({ timeout: 15_000 });

    const forkSendRes = await page.request.post(`/api/chats/${forked.id}/messages`, {
      data: { body: "Local continuation on the fork is allowed." },
    });
    expect(forkSendRes.status()).not.toBe(409);
    const forkMessagesRes = await page.request.get(`/api/chats/${forked.id}/messages`);
    expect(forkMessagesRes.ok()).toBe(true);
    const forkMessages = await forkMessagesRes.json() as Array<{ body: string }>;
    expect(forkMessages.some((message) => message.body === "Local continuation on the fork is allowed.")).toBe(true);
    const forkOutboundRows = await e2eDb
      .select()
      .from(agentIntegrationOutboundMessages)
      .where(eq(agentIntegrationOutboundMessages.conversationId, forked.id));
    expect(forkOutboundRows).toHaveLength(0);

    const sourceRes = await page.request.get(`/api/chats/${conversationId}`);
    expect(sourceRes.ok()).toBe(true);
    const source = await sourceRes.json() as { mutability: string; sourceMetadata: unknown | null };
    expect(source.mutability).toBe("external_bound_chat");
    expect(source.sourceMetadata).toMatchObject({ source: "agent_integration", provider: "feishu" });
  });

  test("labels Feishu chats in Messenger and Feishu runs in run detail", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: { name: `Feishu-Source-Badges-${Date.now()}` },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { id: string; issuePrefix: string };

    const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Feishu Operator",
        role: "engineer",
        agentRuntimeType: "codex_local",
        agentRuntimeConfig: { model: "gpt-5.4" },
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agent = await agentRes.json() as { id: string };

    const conversationId = randomUUID();
    const integrationId = randomUUID();
    const secretId = randomUUID();
    const runId = randomUUID();
    const externalChatId = `oc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    await e2eDb.insert(organizationSecrets).values({
      id: secretId,
      orgId: organization.id,
      name: `Feishu credentials ${secretId}`,
      provider: "local_encrypted",
    });
    await e2eDb.insert(agentIntegrations).values({
      id: integrationId,
      orgId: organization.id,
      agentId: agent.id,
      provider: "feishu",
      status: "active",
      transport: "long_connection",
      providerRegion: "feishu_cn",
      appCredentialSecretId: secretId,
      externalAppId: `cli_${randomUUID().replace(/-/g, "")}`,
      externalBotOpenId: "ou_feishu_badge_bot",
    });
    await e2eDb.insert(chatConversations).values({
      id: conversationId,
      orgId: organization.id,
      title: "Feishu escalation thread",
      summary: "A Feishu-origin escalation for the operator.",
      issueCreationMode: "manual_approval",
      planMode: false,
      preferredAgentId: agent.id,
      lastMessageAt: new Date("2026-06-23T08:30:00.000Z"),
      createdAt: new Date("2026-06-23T08:00:00.000Z"),
      updatedAt: new Date("2026-06-23T08:30:00.000Z"),
    });
    await e2eDb.insert(agentIntegrationChatBindings).values({
      orgId: organization.id,
      integrationId,
      conversationId,
      externalChatId,
      externalChatType: "p2p",
    });
    await e2eDb.insert(heartbeatRuns).values({
      id: runId,
      orgId: organization.id,
      agentId: agent.id,
      invocationSource: "chat",
      triggerDetail: "chat_assistant_reply",
      status: "succeeded",
      startedAt: new Date("2026-06-23T08:31:00.000Z"),
      finishedAt: new Date("2026-06-23T08:32:00.000Z"),
      chatConversationId: conversationId,
      contextSnapshot: {
        source: "agent_integration",
        provider: "feishu",
        integrationId,
        externalChatId,
        externalChatType: "p2p",
      },
      resultJson: { summary: "Handled the Feishu escalation." },
      createdAt: new Date("2026-06-23T08:31:00.000Z"),
      updatedAt: new Date("2026-06-23T08:32:00.000Z"),
    });

    await page.addInitScript((orgId: string) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/messenger`, { waitUntil: "domcontentloaded" });
    const thread = page.getByTestId(`messenger-thread-chat-${conversationId}`);
    await expect(thread).toBeVisible({ timeout: 15_000 });
    await expect(thread.getByTestId(`messenger-source-badge-chat-${conversationId}`)).toHaveText("Feishu");
    if (CAPTURE_VISUAL_PROOF) {
      await page.screenshot({
        path: path.join(VISUAL_PROOF_DIR, "messenger-feishu-badge.png"),
        fullPage: true,
      });
    }

    await page.goto(`/agents/${agent.id}/runs/${runId}`, { waitUntil: "domcontentloaded" });
    const detailPane = page.getByTestId("agent-runs-detail-pane");
    await expect(detailPane.getByTestId("run-summary-card").getByText("succeeded", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(detailPane.getByText("Source")).toBeVisible();
    await expect(detailPane.getByText("Feishu", { exact: true })).toBeVisible();
    if (CAPTURE_VISUAL_PROOF) {
      await page.screenshot({
        path: path.join(VISUAL_PROOF_DIR, "agent-run-feishu-badge.png"),
        fullPage: true,
      });
    }
  });
});
