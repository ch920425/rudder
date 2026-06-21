---
title: Product Logic Registry
date: 2026-06-21
kind: implementation
status: in_progress
area: planning
entities:
  - product_logic_registry
  - product_contracts
  - agent_workflow
issue:
related_plans:
  - 2026-05-30-heartbeat-inbox-admission.md
  - 2026-06-12-retire-issue-bound-documents.md
supersedes: []
related_code:
  - AGENTS.md
  - doc/DEVELOPING.md
  - doc/product/registry.yml
  - scripts/product-logic-check.mjs
commit_refs: []
updated_at: 2026-06-21
---

# Product Logic Registry

## Overview

This plan adds `doc/product/` as Rudder's Product Logic Registry: a current
product-behavior contract for contributors and agents. The registry is not a
public docs section, not proposal history, and not a copy of implementation
code. It records the product logic, interaction contracts, invariants,
rationale, code anchors, test anchors, and proposal links that must stay aligned
when Rudder changes.

The immediate goal is to stop accidental regressions where a previously shipped
workflow disappears because a later agent only read the current code shape.

## What Is The Problem?

Rudder already has strategic docs (`doc/GOAL.md`, `doc/PRODUCT.md`,
`doc/SPEC-implementation.md`) and many plan docs under `doc/plans/`. Those
documents are useful, but they do not give agents one precise place to check the
current product contract for a workflow before editing code.

The failure mode is:

1. A feature lands through a proposal, implementation, and tests.
2. The current behavior later changes or disappears during an unrelated task.
3. The next agent can find code and old plans, but cannot easily distinguish
   current contract, stale proposal, implementation detail, and historical
   artifact.

This is especially risky for issue-backed agent work because one visible issue
workflow spans issue status, assignment, checkout, reviewer routing, heartbeat
runs, instruction loading, comments, activity, and close-out governance.

## What Will Be Changed?

- Add `doc/product/` as a guarded Product Logic Registry.
- Use bounded product domains as the MECE source-of-truth axis.
- Add contract IDs such as `ISSUE.STATE.001` and `RUN.WAKEUP.001`.
- Add `doc/product/registry.yml` as the machine-readable contract map.
- Seed the highest-risk domains:
  - `issues`
  - `execution`
  - `work-routing`
  - `agents` instruction loading
- Add governance docs that make `doc/product/**` read-only to agents by
  default.
- Add a Phase 1 product-logic checker and CI hook.
- Add PR checklist fields for Product Logic Alignment.

## Success Criteria For Change

- Agents have a single current contract location to read before changing issue,
  execution, routing, or instruction-loading behavior.
- Product facts have one owning domain. Workflow and surface docs cite contract
  IDs instead of reauthoring behavior.
- `pnpm product-logic:check` validates contract IDs, registry mappings, and
  linked paths.
- `doc/product/**` edits require explicit user approval or an approved
  proposal/plan with product doc deltas.
- Handoffs for future product-logic changes can state affected contract IDs,
  docs read, docs changed/deferred, and tests proving the contract.

## Out Of Scope

- Backfilling every Rudder product domain in one pass.
- Replacing `doc/SPEC-implementation.md`, `doc/DESIGN.md`, or `doc/plans/`.
- Enforcing full diff-aware product-contract checks in the first implementation.
- Rewriting existing feature code.

## Non-Functional Requirements

- Maintainability: the registry must be small enough to keep current.
- Auditability: every seeded contract must link to current code and test
  anchors.
- Agent-safety: default editing policy must stop agents from silently changing
  product truth.
- Extensibility: `registry.yml` must support later diff-aware checks.

## User Experience Walkthrough

1. A contributor starts a task that touches issues, runs, routing, or agent
   instructions.
2. They read `doc/product/README.md`, then the relevant domain files.
3. They identify affected contract IDs before editing.
4. If the task restores an existing contract, they update code/tests and cite
   the contract.
5. If the task intentionally changes product logic, they get explicit user
   approval to update `doc/product/**` or stop with a proposed product-logic
   delta.
6. Before handoff, they run `pnpm product-logic:check` and report Product Logic
   Alignment.

## Implementation

### Product Or Technical Architecture Changes

The registry uses this structure:

```text
doc/product/
  README.md
  GOVERNANCE.md
  _taxonomy.md
  _template-domain.md
  _template-contract.md
  registry.yml
  domains/
  workflows/
  surfaces/
```

Only `domains/` owns product facts. `workflows/` and `surfaces/` are composed
views that cite domain contract IDs.

### Breaking Change

No runtime or API breaking changes.

### Design

The Phase 1 checker validates:

- `doc/product/registry.yml` exists.
- Contract IDs are unique across `## CONTRACT.ID` headings.
- Every contract heading exists in the registry.
- Registry path links exist.

Phase 2 can add diff-aware checks that compare touched code paths against
`registry.yml` and require a product-doc delta or approved defer marker.
It should also split the broad `RUN.WAKEUP.001` seed into smaller execution
contracts for timer preflight, paused/budget admission, and coalescing/deferred
promotion once the registry workflow is proven.

## What Is Your Testing Plan (QA)?

### Goal

Prove the registry has structural integrity and can catch stale or malformed
contract mappings.

### Prerequisites

No local app or database is required.

### Test Scenarios / Cases

- Valid fixture registry with one contract passes.
- Duplicate contract headings fail.
- A documented contract missing from `registry.yml` fails.
- A registry path pointing to a missing file fails.
- The real repo registry passes.

### Expected Results

- `node --test scripts/product-logic-check.test.mjs` passes.
- `pnpm product-logic:check` passes.

### Pass / Fail

To be filled during verification.

## Documentation Changes

- Add `doc/product/`.
- Update `AGENTS.md`.
- Update `doc/DEVELOPING.md`.
- Update `.github/PULL_REQUEST_TEMPLATE.md`.
- Update `.github/CODEOWNERS`.

## Open Issues

- Phase 2 diff-aware enforcement should be implemented once the registry covers
  more code paths.
- More domains should be backfilled incrementally when future work touches them.
