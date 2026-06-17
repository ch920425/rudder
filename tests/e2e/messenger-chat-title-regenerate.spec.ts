import { expect, test, type Page } from "@playwright/test";
import { E2E_CODEX_STUB } from "./support/e2e-env";

async function createOrganization(page: Page, name: string) {
  const orgRes = await page.request.post("/api/orgs", {
    data: { name },
  });
  expect(orgRes.ok()).toBe(true);
  return orgRes.json() as Promise<{ id: string; issuePrefix: string }>;
}

async function createChatAgent(page: Page, orgId: string) {
  const agentRes = await page.request.post(`/api/orgs/${orgId}/agents`, {
    data: {
      name: "Messenger Chat Agent",
      role: "engineer",
      agentRuntimeType: "codex_local",
      agentRuntimeConfig: {
        model: "gpt-5.4",
        command: E2E_CODEX_STUB,
      },
    },
  });
  expect(agentRes.ok()).toBe(true);
  return agentRes.json() as Promise<{ id: string }>;
}

async function createChat(page: Page, orgId: string, title: string, preferredAgentId?: string) {
  const chatRes = await page.request.post(`/api/orgs/${orgId}/chats`, {
    data: {
      title,
      preferredAgentId,
      issueCreationMode: "manual_approval",
      planMode: false,
    },
  });
  expect(chatRes.ok()).toBe(true);
  return chatRes.json() as Promise<{ id: string; title: string }>;
}

async function configureFastTitleProfile(page: Page, orgId: string, title = "Generated sidebar title") {
  const profileRes = await page.request.put(`/api/orgs/${orgId}/intelligence-profiles/lightweight`, {
    data: {
      agentRuntimeType: "process",
      agentRuntimeConfig: {
        command: "node",
        args: ["-e", `process.stdout.write(${JSON.stringify(title)})`],
      },
      status: "configured",
    },
  });
  expect(profileRes.ok()).toBe(true);
}

test.describe("Messenger chat title regeneration", () => {
  test("shows title regeneration only when Fast Intelligence is configured", async ({ page }) => {
    const organization = await createOrganization(page, `Chat-Title-Regenerate-${Date.now()}`);
    const chat = await createChat(page, organization.id, "Old planning title");

    await page.goto("/");
    await page.evaluate((orgId) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/messenger/chat/${chat.id}`);
    const threadRow = page.getByTestId(`messenger-thread-chat-${chat.id}`);
    await expect(threadRow).toBeVisible({ timeout: 15_000 });
    await threadRow.hover();
    await threadRow.getByRole("button", { name: "Chat actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Regenerate title" })).toBeHidden();

    await configureFastTitleProfile(page, organization.id);

    await page.reload();
    await expect(threadRow).toBeVisible({ timeout: 15_000 });
    await threadRow.hover();
    await threadRow.getByRole("button", { name: "Chat actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Regenerate title" })).toBeVisible();
  });

  test("regenerates the visible Messenger chat title from the actions menu", async ({ page }) => {
    const organization = await createOrganization(page, `Chat-Title-Regenerate-Click-${Date.now()}`);
    const agent = await createChatAgent(page, organization.id);
    const chat = await createChat(page, organization.id, "Old sidebar title", agent.id);
    const sendRes = await page.request.post(`/api/chats/${chat.id}/messages`, {
      data: {
        body: "Use this migration planning discussion to generate a better sidebar title.",
      },
    });
    expect(sendRes.ok()).toBe(true);
    await configureFastTitleProfile(page, organization.id);

    await page.goto("/");
    await page.evaluate((orgId) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/messenger/chat/${chat.id}`);
    const threadRow = page.getByTestId(`messenger-thread-chat-${chat.id}`);
    await expect(threadRow).toContainText("Old sidebar title", { timeout: 15_000 });
    await threadRow.hover();
    await threadRow.getByRole("button", { name: "Chat actions" }).click();
    const regenerateResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/chats/${chat.id}/title/regenerate`)
        && response.request().method() === "POST",
    );
    await page.getByRole("menuitem", { name: "Regenerate title" }).click();
    expect((await regenerateResponse).ok()).toBe(true);

    await expect(threadRow).toContainText("Generated sidebar title", { timeout: 15_000 });
  });
});
