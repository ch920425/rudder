---
title: Heartbeat Wakeups
domain: execution
status: active
coverage: seed
contract_ids:
  - RUN.WAKEUP.001
related_code:
  - server/src/services/runtime-kernel/heartbeat.wakeup.ts
  - server/src/services/runtime-kernel/heartbeat.recovery.ts
  - server/src/services/runtime-kernel/heartbeat.ts
related_tests:
  - server/src/__tests__/heartbeat-paused-wakeups.test.ts
  - server/src/__tests__/heartbeat-run-concurrency.test.ts
edit_policy: user_confirmed_only
---

# Heartbeat Wakeups

## RUN.WAKEUP.001

Behavior:

- `heartbeat.wakeup(agentId, opts)` is the central entrypoint for timer,
  assignment, review, on-demand, and automation wakes.
- Wakeup context is enriched and hydrated before queueing so issue, task,
  comment, and resume context are available to the run.
- Terminated and pending-approval agents are not invokable.
- Paused agents receive deferred wakeup requests instead of immediate runs.
- Timer wakes respect heartbeat enablement and timer preflight.
- Non-timer wakes respect demand wake policy.
- Same-scope queued/running wakes coalesce when safe; comment mention follow-up
  wakes may queue behind a running same-scope run instead of being swallowed.
- Queued runs are started through `startNextQueuedRunForAgent`, respecting
  `maxConcurrentRuns`.

Invariant:

- Wakeup requests must leave durable `agent_wakeup_requests` records for queued,
  skipped, deferred, or coalesced outcomes.
- Budget-blocked wakes must not start runs.
- Pending deferred wakeups must not create duplicate runs for the same task
  scope.

Rationale:

- Rudder needs one admission surface so timer, issue, review, chat, and
  automation triggers do not race into hidden duplicate agent work.

Related code:

- `server/src/services/runtime-kernel/heartbeat.wakeup.ts`
- `server/src/services/runtime-kernel/heartbeat.recovery.ts`
- `server/src/services/runtime-kernel/heartbeat.ts`

Related tests:

- `server/src/__tests__/heartbeat-paused-wakeups.test.ts`
- `server/src/__tests__/heartbeat-run-concurrency.test.ts`
