---
title: Issue State Machines
domain: issues
status: active
coverage: seed
contract_ids:
  - ISSUE.STATE.001
related_code:
  - server/src/services/issues.helpers.ts
  - server/src/services/issues.ts
  - server/src/routes/issues.mutations.ts
related_tests:
  - server/src/__tests__/issue-lifecycle-routes.test.ts
  - tests/e2e/issue-detail-done-project-edit.spec.ts
edit_policy: user_confirmed_only
---

# Issue State Machines

## ISSUE.STATE.001

Behavior:

- Issue status is the durable work-state signal for the board and agents.
- Reviewable states are `in_review` and `blocked`.
- Reviewer decisions require a comment and are allowed only while the issue is
  `in_review` or `blocked`.
- When an assignee agent tries to complete an issue that has a reviewer, Rudder
  normalizes the status to `in_review` unless the acting agent is the reviewer
  recording an accepted decision.
- Closed issues can be reopened by a comment with explicit reopen intent.

Invariant:

- An agent cannot silently bypass reviewer ownership by marking a reviewed issue
  `done`.
- Review decisions are structured outcomes, not only free-form comments.
- Status changes that materially affect the issue must leave activity evidence.

Rationale:

- Issue state is the operator-facing contract for where work is in the Rudder
  loop. Reviewer gates must remain visible and durable.

Related code:

- `server/src/routes/issues.mutations.ts`
- `server/src/services/issues.helpers.ts`
- `server/src/services/issues.ts`

Related tests:

- `server/src/__tests__/issue-lifecycle-routes.test.ts`
- `tests/e2e/issue-detail-done-project-edit.spec.ts`
