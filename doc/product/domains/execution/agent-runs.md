---
title: Agent Runs
domain: execution
status: active
coverage: seed
contract_ids:
  - RUN.AGENT.UNIFICATION.001
  - RUN.CHAT.AGENT.001
  - RUN.EXECUTION.001
related_code:
  - server/src/services/runtime-kernel/heartbeat.execute.ts
  - server/src/services/runtime-kernel/model-fallback.ts
related_tests:
  - server/src/__tests__/heartbeat-observability.test.ts
  - server/src/__tests__/heartbeat-process-recovery.test.ts
edit_policy: user_confirmed_only
---

# Agent Runs

## RUN.AGENT.UNIFICATION.001

Why:

- Rudder historically stored executions in `heartbeat_runs`, but the product
  now treats issue, chat, automation, manual, review, and timer work as one
  operator-facing Agent Run model.
- The unified model prevents UI/API surfaces from re-learning old heartbeat
  naming and lets operators filter by scene, target, status, cost, and result.

Product model:

- `heartbeat_runs` remains the persistence table for compatibility.
- Agent Run is the product facade that derives scene, target type, target id,
  conversation id, message id, automation run id, issue id, and workspace
  context from run columns and context snapshots.
- `/agent-runs` and Agent Detail Runs surfaces expose Agent Run terminology even
  when underlying routes still use heartbeat-compatible names.

Flow:

1. A wake, chat turn, automation dispatch, manual run, or review route creates a
   run record.
2. Execution stores scene and target context in the run snapshot.
3. Shared conversion code maps the stored run to the Agent Run shape.
4. Agent Detail and run filters present scene and target facts to the operator.
5. Transcript/result pages link back to the originating target where possible.

Invariants:

- The facade must not erase source-specific identity. A chat run remains tied to
  its conversation/message; an automation run remains tied to its
  `automation_runs` record; an issue run remains tied to issue execution.
- Compatibility naming must not leak into product copy when the UI is describing
  the unified run model.

Evidence:

- Agent run list can filter/display scenes.
- Run detail exposes linked target context.
- Shared type conversion is the single place for facade semantics.

Related code:

- `packages/shared/src/agent-run.ts`
- `server/src/routes/agents.management-routes.ts`
- `ui/src/pages/AgentDetail.runs.tsx`

Related tests:

- `ui/src/pages/AgentDetail.runs.test.ts`
- `tests/e2e/agent-runs-filter-menu.spec.ts`

## RUN.CHAT.AGENT.001

Why:

- Chat is an intake and lightweight execution surface. When a chat assistant
  turn invokes a runtime, it must be inspectable as a run rather than buried
  inside a message stream.

Flow:

1. A user sends a chat message to a runtime-backed agent.
2. Rudder creates an Agent Run with chat scene and conversation target.
3. Only one active run should own a conversation turn at a time.
4. The assistant message stores a reverse link to the run.
5. Agent Detail Run context and Messenger can navigate between run evidence and
   chat transcript.

Invariants:

- A chat-native run is not an issue-backed run unless the workflow explicitly
  converts or proposes tracked issue work.
- Chat run audit must preserve conversation and message identity.

Evidence:

- Chat assistant messages expose run attribution.
- Agent Detail Run context can open the source conversation.

Related code:

- `server/src/services/chat-agent-runs.ts`
- `ui/src/pages/AgentDetail.chat-context.tsx`

Related tests:

- `server/src/__tests__/chat-agent-runs.test.ts`
- `tests/e2e/agent-detail-chat-run-context.spec.ts`

## RUN.EXECUTION.001

Behavior:

- `executeRun(runId)` claims queued runs before execution and exits early for
  non-active runs.
- The run resolves the agent, runtime state, issue context, task session,
  execution workspace, project resources, runtime config, enabled runtime
  skills, and scene context before invoking the adapter.
- Running state is written to the agent and published as a live event.
- Runtime services and execution workspaces are realized before adapter
  invocation when configured.
- Supported local adapters receive a local agent JWT as `RUDDER_API_KEY` when
  the adapter supports it and the secret is available.
- The adapter is invoked through model fallback support so configured fallback
  runtimes/models can attempt execution.
- Final outcome is derived from cancellation, timeout, adapter result, and
  forbidden runtime skill marker detection.

Invariant:

- Adapters do not mutate Rudder DB state directly; the heartbeat executor
  records the result, logs, events, usage, sessions, and run status.
- Agent status must be finalized after a terminal run outcome.

Rationale:

- The execution domain must make agent work inspectable and resumable while
  keeping runtime-specific behavior behind adapter contracts.

Related code:

- `server/src/services/runtime-kernel/heartbeat.execute.ts`
- `server/src/services/runtime-kernel/model-fallback.ts`

Related tests:

- `server/src/__tests__/heartbeat-observability.test.ts`
- `server/src/__tests__/heartbeat-process-recovery.test.ts`
