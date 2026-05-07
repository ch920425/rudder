import { expect, test } from "@playwright/test";
import { createE2EChatAgent } from "./support/chat-agent";
import { E2E_CODEX_ERROR_STUB } from "./support/e2e-env";

const ORG_NAME = `Err-Chat-${Date.now()}`;

test.describe("Chat error toasts", () => {
  test("shows the real runtime error instead of a Node stack frame", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: ORG_NAME,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json();
    const chatAgent = await createE2EChatAgent(page.request, organization.id, {
      name: "Error Agent",
      command: E2E_CODEX_ERROR_STUB,
    });

    await page.goto("/");
    await page.evaluate((orgId) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/chat?agentId=${chatAgent.id}`);

    const composer = page.locator(".rudder-mdxeditor-content").first();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill("Why did this fail?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Failed to send message")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Missing optional dependency @openai/codex-darwin-arm64", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("file:///stub/codex.js:100")).toHaveCount(0);
  });
});
