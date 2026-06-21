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

## Documentation Depth

Product contracts must stay useful as alignment evidence without becoming a
second implementation tree.

Use `spec_depth: compact` for simple product facts whose behavior can be
captured by behavior, invariant, rationale, and traceability bullets.

Use `spec_depth: logic_contract` for contracts where future agents need a
replayable product-logic reference, especially when the behavior is:

- agent-visible or runtime-visible
- user-visible or workflow-critical
- spread across domain state, routing, runtime config, prompt assembly,
  persistence, and UI or transcript surfaces
- dependent on negative cases such as skipped, deferred, ignored, excluded, or
  must-not-happen branches

A Product Logic Contract must explain:

- the current design reason and tradeoff, not only what the code does
- the actors, objects, state, and entry points
- the product-level flow in enough detail to check a real work loop
- decision cases, including negative and deferred cases
- what the agent sees, what the operator sees, and what evidence persists
- canonical scenarios and traceability to code, tests, and plans

Do not duplicate implementation internals unless the detail is part of the
product contract. Keep historical debate and future proposals in `doc/plans/**`
and link them from traceability.

## Required Alignment

Every product-logic task must report Product Logic Alignment:

- product docs read
- affected contract IDs
- whether `doc/product/**` changed
- whether the change restores an existing contract, changes a contract, or has
  no product logic impact
- tests or E2E coverage proving the contract
- remaining alignment gaps

`pnpm product-logic:check` validates registry/doc consistency and required
headings for active `logic_contract` entries. It is a structural completeness
check, not proof that the prose matches runtime behavior.

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
