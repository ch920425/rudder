import { describe, expect, it } from "vitest";
import { getIssueScopeFilters, isFollowingIssue } from "./issue-scope-filters";

describe("getIssueScopeFilters", () => {
  it("maps assigned scope to the current user's assignee filter", () => {
    expect(getIssueScopeFilters("assigned", "user-123")).toEqual({
      assigneeUserId: "me",
      includeAutomationExecutions: true,
    });
  });

  it("does not apply assigned filtering without a current user", () => {
    expect(getIssueScopeFilters("assigned", null)).toEqual({
      includeAutomationExecutions: true,
    });
  });

  it("maps reviewing scope to the current user's reviewer filter", () => {
    expect(getIssueScopeFilters("reviewing", "user-123")).toEqual({
      includeAutomationExecutions: true,
      reviewerUserId: "me",
    });
  });

  it("includes automation execution issues for ordinary board scopes", () => {
    expect(getIssueScopeFilters("recent", "user-123")).toEqual({
      includeAutomationExecutions: true,
    });
    expect(getIssueScopeFilters("", "user-123")).toEqual({
      includeAutomationExecutions: true,
    });
  });
});


describe("isFollowingIssue", () => {
  it("returns true when the current user created the issue", () => {
    expect(isFollowingIssue({ createdByUserId: "user-123", assigneeUserId: null, reviewerUserId: null }, "user-123")).toBe(true);
  });

  it("returns true when the current user is assigned the issue", () => {
    expect(isFollowingIssue({ createdByUserId: null, assigneeUserId: "user-123", reviewerUserId: null }, "user-123")).toBe(true);
  });

  it("returns true when the current user is the reviewer", () => {
    expect(isFollowingIssue({ createdByUserId: null, assigneeUserId: null, reviewerUserId: "user-123" }, "user-123")).toBe(true);
  });

  it("returns false for unrelated issues or missing user context", () => {
    expect(isFollowingIssue({ createdByUserId: "user-456", assigneeUserId: "user-789", reviewerUserId: null }, "user-123")).toBe(false);
    expect(isFollowingIssue({ createdByUserId: "user-123", assigneeUserId: null, reviewerUserId: null }, null)).toBe(false);
  });
});
