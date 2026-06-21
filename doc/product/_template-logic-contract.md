---
title: Product Logic Contract Template
domain: replace-with-domain
status: draft
coverage: logic_contract
spec_depth: logic_contract
contract_ids:
  - DOMAIN.AREA.001
related_code: []
related_tests: []
related_plans: []
edit_policy: user_confirmed_only
---

# Contract Title

## DOMAIN.AREA.001

## Contract Summary

State the current product behavior protected by this contract and the work loop
or actor that depends on it.

## Intent / User Job

Explain the job this behavior lets an operator, reviewer, assignee agent,
runtime agent, CLI user, or automation complete.

## Why / Design Reasoning

Explain the current design reason, key tradeoff, and rejected alternatives.
Link historical proposals in Traceability instead of copying full debate here.

## Actors / Objects / State

List the actors, domain objects, state fields, runtime context, and persisted
records that matter to the contract.

## Entry Points / Inputs

List the user actions, API calls, wake reasons, runtime scenes, scheduled jobs,
comments, commands, or config fields that enter this logic.

## Product Logic Flow

Describe the current behavior as product semantics. Include ordering and
cross-boundary handoffs when those are part of the contract.

## Decision Table

| Case | Conditions | Product result | Must not happen | Evidence |
| --- | --- | --- | --- | --- |
| Default | Trigger and state | Expected state/action | Forbidden drift | Code/test/log/UI evidence |

Include skipped, deferred, ignored, excluded, and error cases when they affect
the product contract.

## Actor-Visible Input

Describe exactly what the primary actor sees. For runtime contracts, this is
agent-visible prompt/context/env input. For UI contracts, this is the visible
screen state and interaction input. For CLI/API contracts, this is the command,
request, response, or error surface.

## Operator-Visible Output

Describe what a human operator or reviewer can see: issue state, comments, chat
messages, run transcript, logs, UI surfaces, CLI output, or visible errors.

## Persisted Evidence

Describe the records that prove the behavior after the run: context snapshots,
run metadata, prompt metrics, command notes, wakeup records, activity, comments,
or other durable fields.

## Canonical Scenarios

1. Scenario name:
   - Trigger:
   - Expected state/action:
   - Visible output:
   - Evidence:

Include two to four representative cases, including at least one negative or
exclusion case when the logic has important branch behavior.

## Invariants / Non-Goals

List behavior that must remain true and behavior this contract deliberately
does not promise.

## Drift Boundaries

List changes that require updating this contract, and changes that are only
implementation details.

## Traceability

Related plans:

- `doc/plans/...`

Related code:

- `path/to/file.ts`

Related tests:

- `path/to/test.ts`

Known gaps:

- Any partial coverage or pending follow-up.
