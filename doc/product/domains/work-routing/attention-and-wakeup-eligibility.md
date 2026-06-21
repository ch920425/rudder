---
title: Attention And Wakeup Eligibility
domain: work-routing
status: active
coverage: seed
contract_ids:
  - ROUTING.ATTENTION.001
  - ROUTING.COMMENT.WAKE.001
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

## ROUTING.COMMENT.WAKE.001

Why:

- Issue comments are one of the highest-risk wake sources: over-waking creates
  duplicate agent work, while under-waking leaves human feedback unseen.
- Directed mentions must be precise enough that an operator can ask a specific
  agent a question without reassigning or disturbing the main assignee.

Flow:

1. Comment creation emits issue-local evidence under `ISSUE.COMMENTS.001`.
2. Routing parses explicit wake mentions such as agent links with wake intent.
3. Plain comment wake is considered for the current assignee only when the
   issue is not backlog or closed and when directed mention semantics do not
   suppress it.
4. Reopen comment wake uses `issue_reopened_via_comment`.
5. Mention wake uses `issue_comment_mentioned` and is scoped to the source
   comment by `wakeCommentId`.
6. Self-wakes are skipped so an agent does not immediately wake because of its
   own comment.
7. Per-comment target wakes are merged before heartbeat wakeup is called.

Invariants:

- A mention wake does not automatically reassign the issue.
- Non-assignee mention runs should see the source comment as the reason for the
  wake, not assume full ownership of the issue.
- Comment wake context must include enough issue and comment identity for the
  runtime prompt, run snapshot, activity, and later debugging.

Evidence:

- `agent_wakeup_requests` records source/reason/comment context.
- Mention boundary tests prove non-wake references do not wake agents.
- Comment mention tests prove wake mentions enqueue the intended agent.

Related code:

- `server/src/routes/issues.comments-attachments.ts`
- `server/src/services/runtime-kernel/heartbeat.wakeup.ts`

Related tests:

- `tests/e2e/issue-comment-mentions.spec.ts`
- `tests/e2e/issue-comment-mention-boundary.spec.ts`
