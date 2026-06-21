---
title: Attention And Wakeup Eligibility
domain: work-routing
status: active
coverage: seed
contract_ids:
  - ROUTING.ATTENTION.001
related_code:
  - server/src/routes/issues.comments-attachments.ts
  - server/src/routes/issues.mutations.ts
  - server/src/services/runtime-kernel/heartbeat.recovery.ts
  - server/src/services/issue-review-wakeup.ts
related_tests:
  - tests/e2e/issue-comment-mentions.spec.ts
  - tests/e2e/issue-comment-mention-boundary.spec.ts
edit_policy: user_confirmed_only
---

# Attention And Wakeup Eligibility

## ROUTING.ATTENTION.001

Behavior:

- A new comment on a non-backlog, non-closed issue may wake the current
  assignee with reason `issue_commented` and wake source `issue.comment`.
- A comment with explicit reopen intent on a closed issue may wake the assignee
  with reason `issue_reopened_via_comment` and wake source
  `issue.comment.reopen`.
- Comments may wake mentioned agents with reason `issue_comment_mentioned` and
  wake source `comment.mention`.
- Comment, reopen, and mention wake context includes issue and comment details.
- Rudder skips self-waking the agent that authored the comment or mention.
- Directed mentions to agents other than the assignee suppress the plain
  assignee comment wake so the directed attention is not duplicated.
- Comment wakeups from the same comment are merged into one enqueue per target
  agent before calling heartbeat wakeup.
- Timer preflight admits runs when the agent has actionable assignee issues
  (`todo`, `in_progress`, `blocked`) or reviewer issues (`in_review`,
  `blocked`) that do not already have a recorded blocked reviewer decision.
- Timer preflight skips when no actionable work exists, and it records
  diagnostics when pending wakeups already exist.

Invariant:

- Attention wakes should expose why the agent woke.
- Timer heartbeats should not wake an agent that will immediately see no
  actionable work.

Rationale:

- Rudder's agent team model depends on waking the right actor for the right
  reason, while keeping hidden or duplicate work out of the loop.

Related code:

- `server/src/routes/issues.comments-attachments.ts`
- `server/src/routes/issues.mutations.ts`
- `server/src/services/runtime-kernel/heartbeat.recovery.ts`
- `server/src/services/issue-review-wakeup.ts`

Related tests:

- `tests/e2e/issue-comment-mentions.spec.ts`
- `tests/e2e/issue-comment-mention-boundary.spec.ts`
