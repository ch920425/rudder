---
title: Work Routing Domain
domain: work-routing
status: active
coverage: seed
contract_ids: []
related_code:
  - server/src/routes/issues.mutations.ts
  - server/src/services/issue-assignment-wakeup.ts
  - server/src/services/issue-review-wakeup.ts
related_tests:
  - server/src/__tests__/issues-checkout-wakeup.test.ts
  - tests/e2e/issues-reviewer-routing.spec.ts
edit_policy: user_confirmed_only
---

# Work Routing Domain

## Owns

- Assignee and reviewer eligibility.
- Atomic checkout and checked-out ownership.
- Wakeup eligibility for assignment, review, checkout, and mentions.
- Who should act next.

## Does Not Own

- Issue state semantics. See `ISSUE.STATE.001`.
- Heartbeat execution. See `RUN.*`.
- Review decisions and learning outcomes. See review-feedback-learning.
- Comment thread semantics. See collaboration.

## Contract Index

- `ROUTING.ASSIGNMENT.001`: assignment changes wake the assignee when work is
  actionable.
- `ROUTING.CHECKOUT.001`: checkout establishes active assignee ownership and
  avoids self-waking the same run.
- `ROUTING.REVIEWER.001`: reviewable issue states route to reviewer agents.
- `ROUTING.ATTENTION.001`: mentions and timer preflight route attention without
  duplicate or hidden work. Timer preflight's detailed admission flow is owned
  by `RUN.PREFLIGHT.001`.
