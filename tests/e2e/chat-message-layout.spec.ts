import { expect, test } from "@playwright/test";
import { createE2EChatAgent } from "./support/chat-agent";
import { E2E_CODEX_STUB } from "./support/e2e-env";

test.describe("Chat message layout", () => {
  test("keeps the user bubble compact and places message actions below it", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Layout-Chat-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json();
    const chatAgent = await createE2EChatAgent(page.request, organization.id, {
      name: "Layout Agent",
      command: E2E_CODEX_STUB,
    });

    await page.goto("/");
    await page.evaluate((orgId) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/chat?agentId=${chatAgent.id}`);

    const composer = page.locator(".rudder-mdxeditor-content").first();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill("你好");
    await page.getByRole("button", { name: "Send" }).click();

    const bubble = page.getByTestId("chat-user-message-bubble").filter({ hasText: "你好" }).last();
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    await bubble.hover();

    const toolbar = page.getByTestId("chat-user-message-toolbar").last();
    await expect(toolbar).toBeVisible();
    await expect(toolbar).not.toContainText("ago");
    await expect(toolbar).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M/);

    const bubbleBox = await bubble.boundingBox();
    const toolbarBox = await toolbar.boundingBox();

    expect(bubbleBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(bubbleBox!.width).toBeLessThan(160);
    expect(toolbarBox!.y).toBeGreaterThanOrEqual(bubbleBox!.y + bubbleBox!.height - 1);
  });
});
