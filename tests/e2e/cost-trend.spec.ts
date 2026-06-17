import { expect, test } from "@playwright/test";

function daysAgoUtc(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000 - 60_000);
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

    const secondAgentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Budget Reviewer",
        role: "engineer",
        agentRuntimeType: "codex_local",
        agentRuntimeConfig: {
          model: "gpt-5.4",
        },
      },
    });
    expect(secondAgentRes.ok()).toBe(true);
    const secondAgent = await secondAgentRes.json() as { id: string };

    for (const event of [
      { agentId: agent.id, inputTokens: 600, cachedInputTokens: 150, outputTokens: 250, costCents: 123, occurredAt: daysAgoUtc(0) },
      { agentId: agent.id, inputTokens: 300, cachedInputTokens: 50, outputTokens: 450, costCents: 456, occurredAt: daysAgoUtc(0) },
      { agentId: secondAgent.id, inputTokens: 700, cachedInputTokens: 100, outputTokens: 200, costCents: 234, occurredAt: daysAgoUtc(0) },
    ]) {
      const eventRes = await page.request.post(`/api/orgs/${organization.id}/cost-events`, {
        data: {
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
    await expect(chart.getByText(/Estimated spend\s+\$8\.13/)).toBeVisible();
    await expect(chart.getByText("$8.13")).toBeVisible();

    await chart.getByRole("button", { name: "Agent" }).click();
    await expect(chart.getByText("2 agents")).toBeVisible();
    await expect(chart.getByText("Cost Analyst")).toBeVisible();
    await expect(chart.getByText("Budget Reviewer")).toBeVisible();
  });

  test("auto-aligns the narrow agent comparison chart to recent data", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });

    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Cost-Mobile-Agent-Trend-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { id: string; issuePrefix: string };

    const agents: { id: string }[] = [];
    for (const name of ["Atlas", "Beacon", "Comet", "Delta"]) {
      const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
        data: {
          name,
          role: "engineer",
          agentRuntimeType: "codex_local",
          agentRuntimeConfig: {
            model: "gpt-5.4",
          },
        },
      });
      expect(agentRes.ok()).toBe(true);
      agents.push(await agentRes.json() as { id: string });
    }

    for (const [index, agent] of agents.entries()) {
      const eventRes = await page.request.post(`/api/orgs/${organization.id}/cost-events`, {
        data: {
          agentId: agent.id,
          provider: "openai",
          biller: "openai",
          billingType: "metered_api",
          model: "gpt-5.4",
          inputTokens: 300 + index * 100,
          cachedInputTokens: 50,
          outputTokens: 100 + index * 20,
          costCents: 100 + index,
          occurredAt: daysAgoUtc(0),
        },
      });
      expect(eventRes.ok()).toBe(true);
    }

    await page.addInitScript((orgId: string) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/costs`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Last 30 Days" }).click();

    const chart = page.getByTestId("cost-trend-chart");
    await chart.getByRole("button", { name: "Agent" }).click();
    await expect(chart.getByText("4 agents")).toBeVisible();

    const scrollRegion = chart.getByTestId("cost-trend-chart-scroll");
    await expect.poll(async () =>
      scrollRegion.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeGreaterThan(0);
    await expect.poll(async () =>
      scrollRegion.evaluate((element) => element.scrollLeft),
    ).toBeGreaterThan(0);
    await expect.poll(async () =>
      scrollRegion.evaluate((element) => {
        const regionRect = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll(".dashboard-chart-bar")).some((bar) => {
          const barRect = bar.getBoundingClientRect();
          return barRect.width > 0
            && barRect.height > 0
            && barRect.right > regionRect.left
            && barRect.left < regionRect.right;
        });
      }),
    ).toBe(true);
  });

  test("loads month-to-date costs when token aggregates exceed the Postgres int4 range", async ({ page }) => {
    const orgRes = await page.request.post("/api/orgs", {
      data: {
        name: `Cost-Overflow-${Date.now()}`,
      },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json() as { id: string; issuePrefix: string };

    const projectRes = await page.request.post(`/api/orgs/${organization.id}/projects`, {
      data: {
        name: "large-token-project",
        status: "in_progress",
      },
    });
    expect(projectRes.ok()).toBe(true);
    const project = await projectRes.json() as { id: string; name: string };

    const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Large Token Agent",
        role: "engineer",
        agentRuntimeType: "codex_local",
        agentRuntimeConfig: {
          model: "gpt-5.4",
        },
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agent = await agentRes.json() as { id: string };

    for (const costCents of [101, 202, 303]) {
      const eventRes = await page.request.post(`/api/orgs/${organization.id}/cost-events`, {
        data: {
          agentId: agent.id,
          projectId: project.id,
          provider: "openai",
          biller: "openai",
          billingType: "metered_api",
          model: "gpt-5.4",
          inputTokens: 900_000_000,
          cachedInputTokens: 0,
          outputTokens: 1_000,
          costCents,
          occurredAt: daysAgoUtc(0),
        },
      });
      expect(eventRes.ok()).toBe(true);
    }

    await page.addInitScript((orgId: string) => {
      window.localStorage.setItem("rudder.selectedOrganizationId", orgId);
    }, organization.id);

    await page.goto(`/${organization.issuePrefix}/costs`, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Internal server error")).toHaveCount(0);
    await expect(page.getByTestId("cost-trend-chart")).toBeVisible();
    await expect(page.getByText(/2\.7B tokens across request-scoped events/)).toBeVisible();
    await expect(page.getByTestId("workspace-main-card").getByText("large-token-project", { exact: true })).toBeVisible();
  });
});
