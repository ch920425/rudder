import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  RUDDER_AGENT_HEARTBEAT_INSTRUCTION,
  RUDDER_AGENT_OPERATING_CONTRACT,
  selectPromptTemplate,
} from "./server-utils.js";

describe("server-utils prompt contracts", () => {
  it("keeps non-assignee comment mention wakes scoped to the comment unless explicitly delegated", () => {
    const issue = {
      id: "issue-575",
      title: "Improve agent instruction behavior",
      status: "in_progress",
      priority: "medium",
      description: "Harden comment-triggered agent behavior.",
      assigneeAgentId: "other-agent",
      assigneeUserId: null,
    };
    const comment = {
      id: "comment-575",
      authorKind: "user",
      authorLabel: "Zeeland",
      body: "I was asking a question, not asking you to change code.",
    };
    const context = {
      wakeReason: "issue_comment_mentioned",
      wakeSource: "comment.mention",
      issue,
      comment,
    };

    const rendered = renderTemplate(selectPromptTemplate(undefined, context), {
      agent: { id: "agent-575", name: "Wesley" },
      context,
      issue,
      comment,
    });

    expect(rendered).toContain("You were mentioned in a comment and your attention is needed.");
    expect(rendered).toContain("If the issue is not assigned to you, including user-owned or unassigned issues");
    expect(rendered).toContain("strictly respond to the comment's content");
    expect(rendered).toContain("instead of broadening the wake into issue execution");
    expect(rendered).toContain("handle only the narrow action explicitly requested by the comment");
  });

  it("injects the non-assignee comment wake boundary into shared runtime instructions", () => {
    expect(RUDDER_AGENT_OPERATING_CONTRACT).toContain("If a comment wakes you on an issue not assigned to you");
    expect(RUDDER_AGENT_OPERATING_CONTRACT).toContain("including user-owned or unassigned issues");
    expect(RUDDER_AGENT_OPERATING_CONTRACT).toContain("strictly respond to the comment's content");
    expect(RUDDER_AGENT_OPERATING_CONTRACT).toContain("handle only the narrow action the comment explicitly requests");
    expect(RUDDER_AGENT_HEARTBEAT_INSTRUCTION).toContain("If the issue is not assigned to you");
    expect(RUDDER_AGENT_HEARTBEAT_INSTRUCTION).toContain("including user-owned or unassigned issues");
    expect(RUDDER_AGENT_HEARTBEAT_INSTRUCTION).toContain("respond to the comment itself instead of executing the whole issue");
  });

  it("uses the assignee comment prompt for issue reopen comment wakes", () => {
    const issue = {
      id: "issue-685",
      title: "Resume issue from comment",
      status: "todo",
      priority: "medium",
      description: "A closed issue was reopened by a comment.",
    };
    const comment = {
      id: "comment-685",
      authorKind: "user",
      authorLabel: "Zeeland",
      body: "This still needs the reopen path covered.",
    };
    const context = {
      wakeReason: "issue_reopened_via_comment",
      issue,
      comment,
    };

    const rendered = renderTemplate(selectPromptTemplate(undefined, context), {
      agent: { id: "agent-685", name: "Wesley" },
      context,
      issue,
      comment,
    });

    expect(rendered).toContain("There is a new comment on an issue you own.");
    expect(rendered).toContain("Resume issue from comment");
    expect(rendered).toContain("From: Zeeland (user)");
    expect(rendered).toContain("This still needs the reopen path covered.");
    expect(rendered).not.toContain("Continue your Rudder work.");
  });
});
