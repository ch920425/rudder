---
title: Approvals Budgets Activity And Run Intelligence
domain: control-plane
status: active
coverage: detailed
contract_ids:
  - CONTROL.APPROVALS.001
  - CONTROL.BUDGETS.001
  - CONTROL.ACTIVITY.001
  - CONTROL.RUN.INTELLIGENCE.001
related_code:
  - packages/db/src/schema/approvals.ts
  - packages/db/src/schema/approval_comments.ts
  - packages/db/src/schema/issue_approvals.ts
  - packages/db/src/schema/cost_events.ts
  - server/src/services/issue-approvals.ts
  - server/src/services/budgets.ts
  - server/src/services/costs.ts
  - server/src/services/activity.ts
  - server/src/services/run-intelligence.ts
related_tests:
  - server/src/__tests__/approvals-service.test.ts
  - server/src/__tests__/approval-routes-chat-application.test.ts
  - server/src/__tests__/budgets-service.test.ts
  - server/src/__tests__/costs-service.test.ts
  - server/src/__tests__/costs-rollups-service.test.ts
  - server/src/__tests__/activity-service.test.ts
  - tests/e2e/cost-trend.spec.ts
edit_policy: user_confirmed_only
---

# Approvals Budgets Activity And Run Intelligence

## CONTROL.APPROVALS.001

Why:

- Approvals are the product boundary for governed actions. They prevent an
  agent or chat proposal from silently changing high-impact state.

Flow:

1. A proposal creates an approval request with target entity, action payload,
   requester, status, and context.
2. Comments preserve approval discussion.
3. Approver accepts/rejects or requests changes.
4. Approved action is applied through the owning domain service.
5. Activity and chat/issue links preserve the decision and application result.

Invariants:

- Approval application must be idempotent.
- Approval state must remain organization-scoped and tied to the governed
  action it permits.

Evidence:

- `server/src/__tests__/approvals-service.test.ts` covers approval service
  behavior.
- `server/src/__tests__/approval-routes-chat-application.test.ts` covers chat
  approval application paths.

## CONTROL.BUDGETS.001

Why:

- Rudder allows autonomous agent runs, so spend controls must be visible and
  enforce hard stops instead of only reporting after the fact.

Flow:

1. Runtime/result ingestion records cost events and usage metadata.
2. Cost rollups aggregate by organization, agent, project, issue, run, and time
   window where supported.
3. Budget service checks monthly UTC period limits and thresholds.
4. Soft alerts surface spend pressure; hard limits pause or block further work.
5. UI/API readbacks show spend trend and budget state.

Invariants:

- Hard-stop budget behavior must block new hidden work when limit is reached.
- Cost rollups must retain source run/event identity for audit.

Evidence:

- `server/src/__tests__/budgets-service.test.ts`,
  `server/src/__tests__/costs-service.test.ts`, and
  `server/src/__tests__/costs-rollups-service.test.ts` cover budget/cost
  service behavior.
- `tests/e2e/cost-trend.spec.ts` covers visible cost trend behavior.

## CONTROL.ACTIVITY.001

Why:

- Activity is the operator's audit ledger. Mutating actions across issues,
  goals, projects, agents, automations, approvals, and integrations need a
  durable trace.

Flow:

1. Owning domain mutates state.
2. It records activity action, actor, entity, organization, references, and
   summary fields.
3. Activity service can aggregate related chat, issue, run, and approval
   context for timelines and Messenger.

Invariants:

- Activity should describe material product changes, not every internal update.
- Mutating product actions must not be invisible when later agents need to
  reconstruct why state changed.

Evidence:

- `server/src/__tests__/activity-service.test.ts` covers activity aggregation
  and reference behavior.
- Issue, automation, approval, and Messenger tests verify domain-specific
  activity consumers where those flows are visible.

## CONTROL.RUN.INTELLIGENCE.001

Why:

- Run intelligence surfaces help operators understand a run without reading raw
  logs first. They summarize status, transcript, result, cost, skill usage, and
  target context while preserving links to raw evidence.

Flow:

1. Execution records run result, transcript, events, cost, context snapshot, and
   references.
2. Intelligence service builds summaries and derived fields.
3. Run detail/Agent Detail/Dashboard expose the summarized view.
4. Raw transcript/log remains available underneath.

Invariants:

- Summary must not replace raw run evidence.
- Derived insight must remain traceable to run, target, and transcript data.

Evidence:

- `server/src/__tests__/heartbeat-run-summary.test.ts` covers run summary
  behavior.
- `tests/e2e/run-transcript-detail.spec.ts` covers the terminal run transcript
  detail surface.
