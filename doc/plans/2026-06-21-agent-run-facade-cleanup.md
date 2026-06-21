---
title: Agent Run facade cleanup
date: 2026-06-21
kind: implementation
status: completed
area: agent_runtimes
entities:
  - agent_runs
  - heartbeat_runs
  - ui_api_clients
issue:
related_plans:
  - 2026-06-20-agent-run-unification-completion.md
  - 2026-06-10-unified-agent-run-architecture.md
  - 2026-05-29-agent-runs-sort-and-trigger-distribution.md
supersedes: []
related_code:
  - ui/src/api/agent-runs.ts
  - ui/src/api/heartbeats.ts
  - ui/src/lib/queryKeys.ts
  - ui/src/pages/AgentDetail.tsx
  - ui/src/pages/AgentDetail.runs.tsx
commit_refs: []
updated_at: 2026-06-21
---

# Agent Run Facade Cleanup

## Goal

Complete the next compatibility-preserving cleanup after the Agent Run
unification slice.

The public/product concept is `Agent Run`. The physical database table and
legacy compatibility endpoints remain `heartbeat_runs` / `/heartbeat-runs`.
This slice moves safe UI and API-client consumers to Agent Run naming so new
product code does not keep depending on the legacy heartbeat-run facade.

## Constraints

- Do not rename the `heartbeat_runs` database table in this slice.
- Do not remove `/heartbeat-runs` compatibility endpoints.
- Do not rewrite historical migrations, historical plan records, or old release
  notes.
- Keep scheduler heartbeat settings and wakeup policy terminology intact where
  "heartbeat" still means the periodic scheduler behavior, not an execution
  record.
- Keep runtime-kernel internals stable unless a narrow rename has no external
  blast radius.

## Target Boundaries

- `ui/src/api/agent-runs.ts`: canonical UI client facade for run list/detail,
  retry/cancel, events/logs, live run lookups, and workspace operation logs.
- `ui/src/api/heartbeats.ts`: compatibility export for older UI imports plus
  scheduler-heartbeat APIs.
- UI query keys use `agent-runs` / `agent-run` for execution records.
- User-facing copy says `agent run` for failed run threads and run history.

## Implementation Order

1. Add the canonical `agentRunsApi` UI client facade and export it.
2. Keep `heartbeatsApi` as a compatibility alias while moving scheduler-specific
   API naming out of the run client.
3. Rewire run consumers in Agent Detail, Dashboard, Inbox, Messenger, Issue
   Detail, transcript/log components, and live-run widgets.
4. Rename retry helper and focused tests from heartbeat-run to agent-run naming.
5. Update user-facing failed-run copy and focused tests.
6. Run focused UI/API tests, typecheck, and build where practical.

## Result

Implemented the Agent Run facade cleanup without renaming the physical
`heartbeat_runs` table or removing `/heartbeat-runs` compatibility routes.

- Added `agentRunsApi` as the canonical UI client for run list/detail,
  retry/cancel, events/logs, live-run lookups, and workspace operation logs.
- Kept `heartbeatsApi` as a compatibility alias and separated scheduler
  heartbeat calls behind `schedulerHeartbeatsApi`.
- Migrated primary UI consumers and query keys to Agent Run naming.
- Preserved route-specific compatibility copy: legacy `/heartbeat-runs/*`
  not-found responses still say `Heartbeat run not found`; `/agent-runs/*`
  responses say `Agent run not found`.
- Updated visible sample/docs copy that described execution records as
  heartbeat runs, while leaving historical docs and scheduler/runtime
  heartbeat terminology intact.
- Added regression coverage for the compatibility alias, route-specific
  not-found copy, and org-wide Agent Run query-key invalidation.

## Validation Plan

- `pnpm test:run ui/src/api/agent-runs.test.ts ui/src/lib/agent-run-retry.test.ts ui/src/pages/AgentDetail.runs.test.ts ui/src/pages/AgentDetail.run-filters.test.ts ui/src/pages/Messenger.test.tsx`
- `pnpm -r typecheck`
- `pnpm build`

## Validation Result

- `pnpm test:run ui/src/api/agent-runs.test.ts ui/src/lib/agent-run-retry.test.ts ui/src/lib/queryKeys.test.ts ui/src/pages/AgentDetail.runs.test.ts ui/src/pages/AgentDetail.run-filters.test.ts ui/src/pages/Messenger.test.tsx ui/src/components/transcript/useLiveRunTranscripts.test.tsx ui/src/lib/settings-prefetch.test.ts ui/src/pages/IssueDetail.test.tsx server/src/__tests__/activity-routes.test.ts server/src/__tests__/heartbeat-run-retry-routes.test.ts server/src/__tests__/run-intelligence-service.test.ts` passed: 12 files, 87 tests.
- `pnpm -r typecheck` passed.
- `pnpm build` passed with existing CSS `::highlight`, large chunk, package
  bin, and peer dependency warnings.
- Reviewer gate: two initial spawned reviewers returned conditional accept;
  their blockers were fixed before final review.
