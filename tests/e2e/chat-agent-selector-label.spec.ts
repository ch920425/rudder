import { expect, test } from "@playwright/test";
import { createE2EChatAgent, withChatAgent } from "./support/chat-agent";

test.describe("Chat agent selector naming", () => {
  test("starts unassigned, then shows the selected agent as the chat speaker", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Explicit-Agent-Chat-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json();
    const agent = await createE2EChatAgent(page.request, organization.id, { name: "Builder" });

    await page.goto("/");
    await page.evaluate((orgId) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto("/chat");

    const chooseButton = page.getByRole("button", { name: "Choose agent", exact: true });
    await expect(chooseButton).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await chooseButton.click();
    const agentMenuItem = page.getByRole("menuitemradio", { name: /Builder/ });
    await expect(agentMenuItem).toBeVisible();
    await agentMenuItem.click();

    await expect(page.getByRole("button", { name: /Builder/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    const composer = page.locator(".rudder-mdxeditor-content").first();
    await expect(composer).toBeVisible();
    await composer.fill("Route this through Builder");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/chat\/[^/]+$/i, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Builder/ })).toBeVisible();
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("Streaming reply", { timeout: 15_000 });

    await page.goto(withChatAgent("/chat", agent.id));
    await expect(page.getByRole("button", { name: /Builder/ })).toBeVisible({ timeout: 15_000 });
  });
});
