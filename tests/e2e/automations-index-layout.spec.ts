import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_BASE_URL } from "./support/e2e-env";

async function selectOrganization(page: Page, orgId: string) {
  await page.goto(E2E_BASE_URL);
  await page.evaluate((selectedOrgId) => {
    window.localStorage.setItem("rudder.selectedOrganizationId", selectedOrgId);
  }, orgId);
}

test.describe("Automations index layout", () => {
  test("places the create action in the workspace header", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const orgRes = await page.request.post(`${E2E_BASE_URL}/api/orgs`, {
      data: {
        name: `Automations-Index-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = (await orgRes.json()) as { id: string; issuePrefix: string };

    await selectOrganization(page, organization.id);
    await page.goto(`${E2E_BASE_URL}/${organization.issuePrefix}/automations`);

    const headerActions = page.getByTestId("workspace-main-header-actions");
    const createButton = headerActions.getByRole("button", { name: "Create automation" });
    const emptyState = page.getByText("No automations yet. Use Create automation to define the first recurring workflow.");

    await expect(headerActions).toBeVisible();
    await expect(createButton).toBeVisible();
    await expect(emptyState).toBeVisible();

    const headerActionsBox = await headerActions.boundingBox();
    const createButtonBox = await createButton.boundingBox();
    const emptyStateBox = await emptyState.boundingBox();

    expect(headerActionsBox).not.toBeNull();
    expect(createButtonBox).not.toBeNull();
    expect(emptyStateBox).not.toBeNull();
    expect(createButtonBox!.x).toBeGreaterThanOrEqual(headerActionsBox!.x - 2);
    expect(createButtonBox!.y).toBeGreaterThanOrEqual(headerActionsBox!.y - 2);
    expect(createButtonBox!.y + createButtonBox!.height).toBeLessThanOrEqual(headerActionsBox!.y + headerActionsBox!.height + 2);
    expect(createButtonBox!.y + createButtonBox!.height).toBeLessThan(emptyStateBox!.y);

    await createButton.click();
    await expect(page.getByPlaceholder("Automation title")).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath("automations-index-layout.png"),
      fullPage: true,
    });
  });

  test("keeps composer selectors scrollable above the dialog footer", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const orgRes = await page.request.post(`${E2E_BASE_URL}/api/orgs`, {
      data: {
        name: `Automations-Composer-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = (await orgRes.json()) as { id: string; issuePrefix: string };

    const agentResponses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        page.request.post(`${E2E_BASE_URL}/api/orgs/${organization.id}/agents`, {
          data: {
            name: `Auto Agent ${String(index).padStart(2, "0")}`,
            role: "engineer",
            agentRuntimeType: "codex_local",
            agentRuntimeConfig: {
              model: "gpt-5.4",
            },
          },
        }),
      ),
    );
    for (const response of agentResponses) expect(response.ok()).toBe(true);
    const projectResponses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        page.request.post(`${E2E_BASE_URL}/api/orgs/${organization.id}/projects`, {
          data: {
            name: `Auto Project ${String(index).padStart(2, "0")}`,
            description: "Project used to verify automation composer selectors.",
          },
        }),
      ),
    );
    for (const response of projectResponses) expect(response.ok()).toBe(true);

    await selectOrganization(page, organization.id);
    await page.goto(`${E2E_BASE_URL}/${organization.issuePrefix}/automations`);

    const createButton = page.getByTestId("workspace-main-header-actions").getByRole("button", { name: "Create automation" });
    await createButton.click();
    await page.getByPlaceholder("Automation title").fill("Composer selector interaction");

    const assigneePill = page.getByTestId("automation-composer-assignee-pill");
    const projectPill = page.getByTestId("automation-composer-project-pill");

    await assigneePill.locator(":scope > button").click();
    await assertOpenSelectorScrolls(page, "top");
    await page.getByRole("button", { name: /Auto Agent 00/ }).click();
    await expect(assigneePill).toContainText("Auto Agent 00");
    await expect.poll(() => directChildSvgCount(assigneePill)).toBe(0);

    if ((await page.locator('[data-slot="popover-content"][data-state="open"]').count()) === 0) {
      await projectPill.locator(":scope > button").click();
    }
    await assertOpenSelectorScrolls(page, "top");
    await page.getByRole("button", { name: "Auto Project 00" }).click();
    await expect(projectPill).toContainText("Auto Project 00");
    await expect.poll(() => directChildSvgCount(projectPill)).toBe(0);

    await page.screenshot({
      path: testInfo.outputPath("automations-composer-selectors.png"),
      fullPage: true,
    });
  });
});

async function assertOpenSelectorScrolls(page: Page, expectedSide: string) {
  const content = page.locator('[data-slot="popover-content"][data-state="open"]').last();
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute("data-side", expectedSide);
  await expect(content).toHaveCSS("z-index", "70");

  const scroller = content.locator(".overflow-y-auto");
  const box = await scroller.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => scroller.evaluate((element) => Math.round(element.scrollTop))).toBeGreaterThan(0);
}

async function directChildSvgCount(locator: Locator) {
  return locator.evaluate((element) => Array.from(element.children).filter((child) => child.tagName.toLowerCase() === "svg").length);
}
