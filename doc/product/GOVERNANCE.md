---
title: Product Logic Governance
status: active
coverage: seed
edit_policy: user_confirmed_only
---

# Product Logic Governance

## Default Rule

`doc/product/**` is read-only for agents by default.

An agent may semantically edit `doc/product/**` only when one of these is true:

1. The current user explicitly authorizes product-registry edits in the current
   task.
2. The user approves a proposal or plan that includes a concrete
   `doc/product/**` delta.

An agent-written handoff, PR body, or draft plan is not authorization by itself.

## Product Logic Change

A product logic change is any change that affects:

- user-visible workflow behavior
- agent-visible runtime behavior
- state machines or allowed transitions
- assignee, reviewer, wakeup, checkout, or approval routing
- permissions or organization boundaries
- close-out, recovery, retry, cancellation, or budget behavior
- visible UI interaction contracts
- CLI/API behavior that agents or operators rely on

Implementation-only changes do not need registry edits when they preserve the
same contract.

## Required Alignment

Every product-logic task must report Product Logic Alignment:

- product docs read
- affected contract IDs
- whether `doc/product/**` changed
- whether the change restores an existing contract, changes a contract, or has
  no product logic impact
- tests or E2E coverage proving the contract
- remaining alignment gaps

## No-Permission Path

If code should change a product contract but the agent lacks permission to edit
`doc/product/**`, the agent must stop before final handoff with:

```text
Product logic update blocked pending approval:
- affected contracts:
- proposed product doc delta:
- code already changed or not changed:
- tests needed:
```

## Allowed Regression-Restore Path

If the task restores an existing contract, the agent may update code and tests
without changing `doc/product/**`, but the handoff must cite the restored
contract ID and the proof.

## Deferred Product Doc Update

A deferred product-doc update is allowed only with explicit human approval. It
must include:

- owner
- linked issue or plan
- affected contract IDs
- due date
- reason the doc update is deferred

Do not use defer as a normal shortcut for user-visible behavior changes.
