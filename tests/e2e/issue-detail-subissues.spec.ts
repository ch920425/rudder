import { expect, test } from "@playwright/test";

const ORG_NAME = `Issue-Detail-Subissues-${Date.now()}`;

test.describe("Issue detail sub-issues", () => {
  test("renders sub-issues inline above documents and creates child issues in place", async ({ page }) => {
    await page.goto("/");

    const orgRes = await page.request.post("/api/orgs", {
      data: { name: ORG_NAME },
    });
    expect(orgRes.ok()).toBe(true);
    const organization = await orgRes.json();

    const parentRes = await page.request.post(`/api/orgs/${organization.id}/issues`, {
      data: {
        title: "Parent issue container",
        status: "todo",
        priority: "medium",
      },
    });
    expect(parentRes.ok()).toBe(true);
    const parentIssue = await parentRes.json();

    const issueRes = await page.request.post(`/api/orgs/${organization.id}/issues`, {
      data: {
        title: "Parent issue for inline child creation",
        description: "Sub-issues should live in the main body layout.",
        status: "todo",
        priority: "medium",
        parentId: parentIssue.id,
      },
    });
    expect(issueRes.ok()).toBe(true);
    const issue = await issueRes.json();

    const existingChildRes = await page.request.post(`/api/orgs/${organization.id}/issues`, {
      data: {
        title: "Existing child issue",
        status: "todo",
        priority: "medium",
        parentId: issue.id,
      },
    });
    expect(existingChildRes.ok()).toBe(true);

    await page.goto(`/issues/${issue.identifier ?? issue.id}`);

    const subIssuesSection = page.getByLabel("Sub-issues");

    await expect(page.getByRole("tab", { name: "Sub-issues" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add sub-issue" })).toBeVisible();
    await expect(subIssuesSection.getByText("Sub-issues", { exact: true })).toBeVisible();
    await expect(subIssuesSection.getByText("Existing child issue", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change status for Existing child issue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New document" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Chat" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Activity" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Activity" })).toBeVisible();

    const propertiesPanel = page.getByRole("region", { name: "Issue properties" });
    await expect(propertiesPanel.getByText("Parent", { exact: true })).toBeVisible();
    await expect(propertiesPanel.getByRole("link", { name: "Parent issue container" })).toHaveAttribute(
      "href",
      new RegExp(`/issues/${parentIssue.identifier ?? parentIssue.id}$`),
    );
    await expect(propertiesPanel.getByText("Sub-issues", { exact: true })).toBeVisible();
    await expect(propertiesPanel.getByText("Existing child issue", { exact: true })).toBeVisible();

    await propertiesPanel.getByRole("button", { name: "Add" }).click();
    await expect(propertiesPanel.getByPlaceholder("Sub-issue title")).toBeVisible();
    await propertiesPanel.getByPlaceholder("Sub-issue title").fill("Sidebar child issue");
    await propertiesPanel.getByRole("button", { name: "Create", exact: true }).click();
    await expect(propertiesPanel.getByText("Sidebar child issue", { exact: true })).toBeVisible();

    const subIssuesBox = await page.getByLabel("Sub-issues").boundingBox();
    const documentsBox = await page.getByRole("button", { name: "New document" }).boundingBox();
    expect(subIssuesBox).not.toBeNull();
    expect(documentsBox).not.toBeNull();
    expect((subIssuesBox?.y ?? 0)).toBeLessThan(documentsBox?.y ?? 0);

    await page.getByRole("button", { name: "Change status for Existing child issue" }).click();
    await expect(page).toHaveURL(new RegExp(`${issue.identifier ?? issue.id}$`));
    await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${issue.identifier ?? issue.id}$`));

    await page.getByRole("button", { name: "Add sub-issue" }).click();
    await expect(subIssuesSection.getByPlaceholder("Add sub-issue title")).toBeVisible();

    await subIssuesSection.getByPlaceholder("Add sub-issue title").fill("Inline child issue");
    await subIssuesSection.getByRole("button", { name: "Create", exact: true }).click();

    await expect(subIssuesSection.getByText("Inline child issue", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Add sub-issue title")).toHaveCount(0);
    await expect(subIssuesSection.locator("a").nth(0)).toContainText("Existing child issue");
    await expect(subIssuesSection.locator("a").nth(1)).toContainText("Sidebar child issue");
    await expect(subIssuesSection.locator("a").nth(2)).toContainText("Inline child issue");

    const childIssuesRes = await page.request.get(
      `/api/orgs/${organization.id}/issues?parentId=${encodeURIComponent(issue.id)}`,
    );
    expect(childIssuesRes.ok()).toBe(true);
    const childIssues = await childIssuesRes.json();
    expect(childIssues).toHaveLength(3);
    expect(childIssues.map((child: { title: string }) => child.title).sort()).toEqual([
      "Existing child issue",
      "Inline child issue",
      "Sidebar child issue",
    ]);
    expect(childIssues.every((child: { parentId: string }) => child.parentId === issue.id)).toBe(true);
    expect(childIssues.find((child: { title: string; status: string }) => child.title === "Existing child issue")?.status).toBe("done");

    await page.getByRole("button", { name: "Add sub-issue" }).click();
    await subIssuesSection.getByPlaceholder("Add sub-issue title").fill("Cancel me");
    await subIssuesSection.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByPlaceholder("Add sub-issue title")).toHaveCount(0);

    await expect(page.getByText("created the issue")).toBeVisible();
    await expect(page.locator('[contenteditable="true"]').last()).toBeVisible();
  });
});
