import { expect, test } from "@playwright/test";

test.describe("Product tour", () => {
  test("can be replayed from profile settings", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Product Tour ${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { issuePrefix: string };

    await page.goto(`/${organization.issuePrefix}/dashboard`);
    await page.getByRole("button", { name: "System settings" }).click();

    const modal = page.getByTestId("settings-modal-shell");
    await modal.locator('a[href$="/instance/settings/profile"]').click();
    await expect(modal.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    await expect(modal.getByText("Rudder workspace walkthrough")).toBeVisible();

    await modal.getByRole("button", { name: "Start tour" }).click();

    await expect(modal).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Rudder is the control plane for agent work" })).toBeVisible();
    await expect(page.getByText("Complete your first work loop")).toBeVisible();
    await expect(page.getByText("1 / 5")).toBeVisible();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("dialog", { name: "Start with one task an agent can actually move" })).toBeVisible();
  });
});
