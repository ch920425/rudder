---
title: Ownership And Assignment
domain: work-routing
status: active
coverage: seed
contract_ids:
  - ROUTING.ASSIGNMENT.001
related_code:
  - server/src/routes/issues.mutations.ts
  - server/src/services/issue-assignment-wakeup.ts
  - server/src/services/issues.ts
related_tests:
  - server/src/__tests__/issues-checkout-wakeup.test.ts
  - tests/e2e/issues-inline-assignee.spec.ts
edit_policy: user_confirmed_only
---

# Ownership And Assignment

## ROUTING.ASSIGNMENT.001

Behavior:

- Creating an issue may assign it to the creating agent when no explicit
  assignee is provided.
- Assignment to an agent wakes the assignee when the issue is not `backlog`.
- Assignment wake context includes issue id, title, description, status,
  priority, wake source, wake reason, and mutation source.
- Assignee and reviewer principals must belong to the same organization and
  cannot be pending approval or terminated.
- Agents returning an issue to its creator have a limited route that does not
  require the same board assignment permission as arbitrary reassignment.

Invariant:

- Assignment must not cross organization boundaries.
- Backlog issues must not wake assignees just because they have an assignee.

Rationale:

- Assignment is next-action routing. It should wake the right agent only when
  work is actionable and the principal is valid.

Related code:

- `server/src/routes/issues.mutations.ts`
- `server/src/services/issue-assignment-wakeup.ts`
- `server/src/services/issues.ts`

Related tests:

- `server/src/__tests__/issues-checkout-wakeup.test.ts`
- `tests/e2e/issues-inline-assignee.spec.ts`
