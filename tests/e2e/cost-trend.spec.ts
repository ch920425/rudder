import { expect, test } from "@playwright/test";

function daysAgoUtc(days: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 12, 0, 0, 0));
  return date.toISOString();
}

test.describe("Cost trend chart", () => {
  test("shows token volume and estimated spend on the organization costs page", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Cost-Trend-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { id: string; issuePrefix: string };

    const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Cost Analyst",
        role: "engineer",
        agentRuntimeType: "codex_local",
        agentRuntimeConfig: {
          model: "gpt-5.4",
        },
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agent = await agentRes.json() as { id: string };

    for (const event of [
      { inputTokens: 600, cachedInputTokens: 150, outputTokens: 250, costCents: 123, occurredAt: daysAgoUtc(0) },
      { inputTokens: 300, cachedInputTokens: 50, outputTokens: 450, costCents: 456, occurredAt: daysAgoUtc(0) },
    ]) {
      const eventRes = await page.request.post(`/api/orgs/${organization.id}/cost-events`, {
        data: {
          agentId: agent.id,
          provider: "openai",
          biller: "openai",
          billingType: "metered_api",
          model: "gpt-5.4",
          ...event,
        },
      });
      expect(eventRes.ok()).toBe(true);
    }

    await page.addInitScript((orgId: string) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/costs`, { waitUntil: "domcontentloaded" });

    const chart = page.getByTestId("cost-trend-chart");
    await expect(chart).toBeVisible();
    await expect(chart.getByText("Inference trend")).toBeVisible();
    await expect(chart.getByText("Tokens", { exact: true })).toBeVisible();
    await expect(chart.getByText("1.8k")).toBeVisible();
    await expect(chart.getByText("Estimated spend", { exact: true })).toBeVisible();
    await expect(chart.getByText("$5.79")).toBeVisible();
  });
});
