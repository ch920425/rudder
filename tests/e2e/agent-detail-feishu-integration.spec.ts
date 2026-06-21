import { expect, test, type Page } from "@playwright/test";

test.describe("Agent detail Feishu integration", () => {
  async function createIntegrationFixture(page: Page) {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Agent-Feishu-Launcher-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { id: string; issuePrefix: string };

    const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Ella",
        role: "general",
        agentRuntimeType: "codex_local",
        agentRuntimeConfig: {
          model: "gpt-5.4",
        },
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agent = await agentRes.json() as { id: string };

    await page.goto("/");
    await page.evaluate((orgId) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/agents/${agent.id}/integrations`);

    await expect(page.getByRole("heading", { name: "Ella", exact: true })).toBeVisible();
    await expect(page.getByText("Ella - Rudder")).toBeVisible();

    return { agent, organization };
  }

  test("opens the Feishu one-click bot launcher with the agent name prefilled", async ({ page }) => {
    const { agent, organization } = await createIntegrationFixture(page);

    await page.context().route("https://open.feishu.cn/page/launcher**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Feishu launcher</title><main>Feishu launcher</main>",
      });
    });

    await expect(page.getByText("Create a Feishu bot named")).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Connect" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");

    const launcherUrl = new URL(popup.url());
    expect(launcherUrl.origin).toBe("https://open.feishu.cn");
    expect(launcherUrl.pathname).toBe("/page/launcher");
    expect(launcherUrl.searchParams.get("from")).toBe("sdk");
    expect(launcherUrl.searchParams.get("name")).toBe("Ella - Rudder");
    expect(launcherUrl.searchParams.get("source")).toBe("rudder/agent-integrations");
    expect(launcherUrl.searchParams.get("tp")).toBe("sdk");
    expect(launcherUrl.searchParams.get("agentId")).toBe(agent.id);
    expect(launcherUrl.searchParams.get("orgId")).toBe(organization.id);
    expect(launcherUrl.searchParams.get("transport")).toBe("long_connection");
  });

  test("opens the Lark Global launcher when that region is selected", async ({ page }) => {
    const { agent, organization } = await createIntegrationFixture(page);

    await page.context().route("https://open.larksuite.com/page/launcher**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Lark launcher</title><main>Lark launcher</main>",
      });
    });

    await page.getByRole("button", { name: "Lark Global" }).click();
    await expect(page.getByText("Create a Lark bot named")).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Connect" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");

    const launcherUrl = new URL(popup.url());
    expect(launcherUrl.origin).toBe("https://open.larksuite.com");
    expect(launcherUrl.pathname).toBe("/page/launcher");
    expect(launcherUrl.searchParams.get("name")).toBe("Ella - Rudder");
    expect(launcherUrl.searchParams.get("region")).toBe("lark_global");
    expect(launcherUrl.searchParams.get("agentId")).toBe(agent.id);
    expect(launcherUrl.searchParams.get("orgId")).toBe(organization.id);
  });
});
