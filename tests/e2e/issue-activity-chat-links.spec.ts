import { expect, test } from "@playwright/test";

const ORG_NAME = `Issue-Activity-${Date.now()}`;

test.describe("Issue activity", () => {
  test("hides low-signal updates and names assignment changes", async ({ page }) => {
    await page.goto("/");

    const orgRes = await page.request.post("/api/orgs", {
      data: { name: `${ORG_NAME}-Details` },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json();

    const agentRes = await page.request.post(`/api/orgs/${organization.id}/agents`, {
      data: {
        name: "Builder",
        role: "engineer",
        title: "Build agent",
        agentRuntimeType: "process",
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agentPayload = await agentRes.json();
    const agent = agentPayload.agent;

    const issueRes = await page.request.post(`/api/orgs/${organization.id}/issues`, {
      data: {
        title: "Activity behavior issue",
        description: "Initial description.",
        status: "todo",
        priority: "medium",
      },
    });
    expect(issueRes.ok()).toBe(true);
    const issue = await issueRes.json();

    const assignRes = await page.request.patch(`/api/issues/${issue.id}`, {
      data: { assigneeAgentId: agent.id, assigneeUserId: null },
    });
    expect(assignRes.ok()).toBe(true);

    const descriptionRes = await page.request.patch(`/api/issues/${issue.id}`, {
      data: { description: "Description-only update should not render as activity." },
    });
    expect(descriptionRes.ok()).toBe(true);

    const createDocumentRes = await page.request.put(`/api/issues/${issue.id}/documents/note`, {
      data: { title: "Activity note", format: "markdown", body: "# First revision" },
    });
    expect(createDocumentRes.ok()).toBe(true);
    const updateDocumentRes = await page.request.put(`/api/issues/${issue.id}/documents/note`, {
      data: { title: "Activity note", format: "markdown", body: "# Second revision" },
    });
    expect(updateDocumentRes.ok()).toBe(true);

    await page.goto(`/issues/${issue.identifier ?? issue.id}`);
    const activity = page.getByRole("region", { name: "Activity" });
    await expect(activity).toBeVisible();
    await expect(activity.getByText("assigned the issue to Builder", { exact: false })).toBeVisible();
    await expect(activity.getByText("updated the description", { exact: false })).toHaveCount(0);
    await expect(activity.getByText("updated a document note", { exact: false })).toHaveCount(0);
  });

  test("shows chat conversations that created or linked an issue", async ({ page }) => {
    await page.goto("/");

    const orgRes = await page.request.post("/api/orgs", {
      data: { name: ORG_NAME },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json();

    const linkedIssueRes = await page.request.post(`/api/orgs/${organization.id}/issues`, {
      data: {
        title: "Issue linked from chat",
        description: "Track chat-linked issue activity.",
        status: "todo",
        priority: "medium",
      },
    });
    expect(linkedIssueRes.ok()).toBe(true);
    const linkedIssue = await linkedIssueRes.json();

    const linkedChatRes = await page.request.post(`/api/orgs/${organization.id}/chats`, {
      data: {
        title: "Debug thread",
        contextLinks: [{ entityType: "issue", entityId: linkedIssue.id }],
      },
    });
    expect(linkedChatRes.ok()).toBe(true);

    const conversionChatRes = await page.request.post(`/api/orgs/${organization.id}/chats`, {
      data: { title: "Customer escalation" },
    });
    expect(conversionChatRes.ok()).toBe(true);
    const conversionChat = await conversionChatRes.json();

    const convertedIssueRes = await page.request.post(`/api/chats/${conversionChat.id}/convert-to-issue`, {
      data: {
        proposal: {
          title: "Issue converted from chat",
          description: "Track issue conversion activity.",
          priority: "medium",
        },
      },
    });
    expect(convertedIssueRes.ok()).toBe(true);
    const convertedPayload = await convertedIssueRes.json();
    const convertedIssue = convertedPayload.issue;

    await page.goto(`/issues/${linkedIssue.identifier ?? linkedIssue.id}`);
    await expect(page.getByRole("region", { name: "Activity" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Debug thread" })).toBeVisible();
    await expect(page.getByText("with this issue linked", { exact: false })).toBeVisible();

    await page.goto(`/issues/${convertedIssue.identifier ?? convertedIssue.id}`);
    await expect(page.getByRole("region", { name: "Activity" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Customer escalation" })).toBeVisible();
    await expect(page.getByText("created this issue from", { exact: false })).toBeVisible();
  });
});
