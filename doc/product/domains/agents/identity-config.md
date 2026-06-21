---
title: Agent Identity And Config
domain: agents
status: active
coverage: detailed
contract_ids:
  - AGENT.IDENTITY.CONFIG.001
  - AGENT.RUNTIME.ADAPTERS.001
related_code:
  - packages/db/src/schema/agents.ts
  - packages/shared/src/types/agent.ts
  - server/src/services/agents.ts
  - server/src/routes/agents.ts
  - server/src/routes/agents.management-routes.ts
  - server/src/agent-runtimes/registry.ts
  - server/src/services/runtime-kernel/heartbeat.execute.ts
related_tests:
  - server/src/__tests__/agent-permissions-routes.test.ts
  - server/src/__tests__/agent-startup-context.test.ts
  - server/src/__tests__/agent-run-context.test.ts
edit_policy: user_confirmed_only
---

# Agent Identity And Config

## AGENT.IDENTITY.CONFIG.001

Why:

- Agents are durable team members, not throwaway runtime processes. Their role,
  capabilities, runtime, skills, budget, reporting line, and permissions define
  what work Rudder may safely route to them.

Product model:

- An agent belongs to one organization.
- Agent identity includes name, role, title, capabilities, status, reporting
  line, runtime type/config, desired skills, budget, and permission/config
  state.
- Pending approval, paused, terminated, or revoked-access states constrain
  whether the agent can be woken or configured.
- Config changes are operator-visible product changes when they alter runtime,
  instruction, skill, budget, or permission behavior.

Flow:

1. Board creates or hires an agent with role and runtime configuration.
2. Server normalizes runtime config, secrets, default instructions, and desired
   skills.
3. Approval or permission policy may gate the final active state.
4. Updates create visible config state so later runs can be traced back to the
   operating frame active at invocation time.
5. Agent Detail exposes config, instructions, skills, integrations, runs, and
   issues from the same durable identity.

Invariants:

- Agent identity and manager relationships do not cross organization boundary.
- Terminated or pending-approval agents are not ordinary invokable agents.
- Runtime config is not only UI preference; it is execution contract.

Evidence:

- Agent management routes enforce org-scoped updates.
- Agent Detail shows the config surface used by operators to inspect an agent.
- Runtime execution stores enough context to reconstruct the agent's operating
  frame for a run.

## AGENT.RUNTIME.ADAPTERS.001

Why:

- Runtime type is a product capability boundary. Codex, Claude, Gemini,
  OpenCode, Pi, Cursor, process, and HTTP-style adapters do not all support the
  same session, skill sync, model discovery, local JWT, transcript, or quota
  behaviors.

Product model:

- The runtime registry maps an agent runtime type to adapter capabilities.
- Adapter capabilities can include execute, test environment, model listing,
  skill listing/sync, local auth token support, session codec, transcript
  parser, and quota/cost metadata.
- Runtime execution must pass a bounded Rudder context to the adapter and then
  persist normalized result evidence back into Rudder.

Flow:

1. Agent config selects a runtime type and config payload.
2. Registry resolves the adapter and capability surface.
3. Runtime config is prepared, secrets are resolved, skills/context are loaded,
   and execution workspace is realized.
4. Adapter executes and returns provider-specific result/transcript/session
   evidence.
5. Rudder normalizes and stores the result under `RUN.RESULT.001`.

Invariants:

- Adapter-specific affordances must not be assumed for all providers.
- Provider parity claims require runtime-specific evidence or a documented
  blocked/substituted proof.

Evidence:

- Runtime registry is the source of adapter capabilities.
- Runtime execution tests prove context assembly and result persistence.

