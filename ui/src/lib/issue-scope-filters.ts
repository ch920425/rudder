import type { Issue } from "@rudderhq/shared";

type IssueScope = string;

type IssueScopeFilters = {
  assigneeUserId?: string;
  includeAutomationExecutions?: boolean;
  reviewerUserId?: string;
};

export function getIssueScopeFilters(issueScope: IssueScope, currentUserId: string | null): IssueScopeFilters {
  if (issueScope === "assigned" && currentUserId) {
    return { assigneeUserId: "me", includeAutomationExecutions: true };
  }
  if (issueScope === "reviewing" && currentUserId) {
    return { reviewerUserId: "me", includeAutomationExecutions: true };
  }

  return { includeAutomationExecutions: true };
}

export function isFollowingIssue(issue: Pick<Issue, "createdByUserId" | "assigneeUserId" | "reviewerUserId">, currentUserId: string | null): boolean {
  if (!currentUserId) return false;
  return issue.createdByUserId === currentUserId || issue.assigneeUserId === currentUserId || issue.reviewerUserId === currentUserId;
}
