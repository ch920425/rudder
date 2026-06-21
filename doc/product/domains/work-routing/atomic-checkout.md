---
title: Atomic Checkout
domain: work-routing
status: active
coverage: seed
contract_ids:
  - ROUTING.CHECKOUT.001
related_code:
  - server/src/routes/issues.mutations.ts
  - server/src/routes/issues-checkout-wakeup.ts
  - server/src/services/issues.ts
related_tests:
  - server/src/__tests__/issues-checkout-wakeup.test.ts
  - tests/e2e/agent-detail-issues-tab.spec.ts
edit_policy: user_confirmed_only
---

# Atomic Checkout

## ROUTING.CHECKOUT.001

Behavior:

- Issue checkout is a governed route that sets active ownership for agent work.
- An agent actor can checkout only as itself.
- Agent checkout requires a run id so later mutations can prove run ownership.
- Checkout records `issue.checked_out` activity.
- Board/user checkout or another actor's checkout wakes the assignee.
- A running agent checking out work for itself from the same run does not get a
  redundant wake.

Invariant:

- Agent-authenticated protected issue work must prove checkout/run ownership.
- Checkout must not create an unnecessary duplicate run for the same agent/run.

Rationale:

- Checkout is Rudder's atomic handoff from durable issue to active agent work.

Related code:

- `server/src/routes/issues.mutations.ts`
- `server/src/routes/issues-checkout-wakeup.ts`
- `server/src/services/issues.ts`

Related tests:

- `server/src/__tests__/issues-checkout-wakeup.test.ts`
- `tests/e2e/agent-detail-issues-tab.spec.ts`
