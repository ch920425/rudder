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
- `registry.yml` maps contract IDs to owner, domain, docs, plans, code, and
  tests.

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
