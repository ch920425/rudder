---
title: Product Logic Registry
status: active
coverage: seed
edit_policy: user_confirmed_only
---

# Product Logic Registry

`doc/product/` is Rudder's current product-logic contract.

It records what the product must do, why the behavior exists, where it is
implemented, and how it is tested. It exists to prevent shipped behavior from
being removed or changed accidentally by later agent work.

This registry is not:

- public website documentation
- proposal history
- a database schema reference
- a copy of the code

Use `doc/plans/` for decision history and proposals. Use source and tests for
implementation. Use this registry for the current product behavior contract.

## Authoritative Shape

- `domains/` owns product facts.
- `workflows/` is a composed walkthrough layer. It must cite domain contract IDs
  and must not reauthor business rules.
- `surfaces/` maps pages and UI surfaces to owning domain contracts. It must not
  define behavior independently.
- `registry.yml` maps contract IDs to owner, domain, docs, plans, code, tests,
  and the required documentation depth.

## Contract Depth

Contracts use one of two depths:

- `compact`: a short current-behavior contract for simple or stable product
  facts. Use `_template-contract.md`.
- `logic_contract`: a detailed Product Logic Contract for high-risk behavior
  that crosses product, runtime, workflow, persistence, or UI boundaries. Use
  `_template-logic-contract.md`.

Use `logic_contract` when a contract is agent-visible, user-visible,
state-machine-heavy, or likely to regress during future implementation work.
These documents must explain the current "why", the executable product flow,
decision cases, actor-visible input/output, persisted evidence, and traceability
to code/tests/plans. They are still current-state contracts, not proposal
history or line-by-line code copies.

## Seeded Domains

- `domains/issues/`: issue identity, state, local issue flows, and issue-visible
  slots.
- `domains/execution/`: agent runs, heartbeats, run admission, transcripts,
  results, and close-out execution release.
- `domains/work-routing/`: assignee, reviewer, checkout, wake eligibility, and
  who should act next.
- `domains/agents/`: durable agent identity, runtime config, and instruction
  loading.

## Required Workflow

Before changing product logic:

1. Read `GOVERNANCE.md`.
2. Read the owning domain contract.
3. List affected contract IDs.
4. Decide whether the task restores an existing contract or changes the
   contract.
5. Run `pnpm product-logic:check` before handoff.

If a product logic change requires editing `doc/product/**`, do not edit it
unless the current user explicitly authorizes that edit or has approved a plan
that includes the product doc delta.
