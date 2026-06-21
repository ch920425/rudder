---
title: Agent Instruction Loading
domain: agents
status: active
coverage: seed
contract_ids:
  - AGENT.INSTRUCTIONS.001
related_code:
  - packages/agent-runtime-utils/src/server-utils.instructions.ts
  - packages/agent-runtime-utils/src/server-utils.prompts.ts
  - packages/agent-runtimes/claude-local/src/server/execute.ts
  - packages/agent-runtimes/codex-local/src/server/execute.ts
  - packages/agent-runtimes/cursor-local/src/server/execute.ts
  - packages/agent-runtimes/gemini-local/src/server/execute.ts
  - packages/agent-runtimes/opencode-local/src/server/execute.ts
  - packages/agent-runtimes/pi-local/src/server/execute.ts
  - server/src/services/agent-run-context.ts
  - server/src/services/agent-instructions.ts
  - server/src/services/agent-startup-context.ts
  - server/src/services/runtime-kernel/heartbeat.execute.ts
  - server/src/services/workspace-runtime.helpers.ts
related_tests:
  - packages/agent-runtime-utils/src/server-utils.test.ts
  - server/src/__tests__/agent-instructions-service.test.ts
  - server/src/__tests__/agent-run-context.test.ts
  - server/src/__tests__/workspace-runtime.test.ts
edit_policy: user_confirmed_only
---

# Agent Instruction Loading

## AGENT.INSTRUCTIONS.001

Behavior:

- `prepareRuntimeConfig` resolves secret-backed runtime config before
  invocation.
- Enabled organization/private/bundled skills are resolved for the specific
  agent and runtime, then exposed as `rudderRuntimeSkills` and
  `rudderSkillSync.desiredSkills` in runtime config.
- `resolveWorkspaceForRun` chooses project workspace, organization workspace,
  task-session cwd, or canonical agent home based on issue/project/session
  context.
- `buildSceneContext` adds heartbeat or chat scene, `rudderWorkspace`,
  workspace hints, project resources, current automations, and startup context.
- Project resources and startup context compile into `resourcesPrompt`,
  `orgResourcesPrompt`, and `rudderResourcesPrompt`.
- Heartbeat execution stores scene/workspace/startup context in the run
  context snapshot before adapter invocation.
- Supported local adapters may receive a local agent JWT so the runtime can act
  as that agent through Rudder APIs.
- Each local runtime adapter calls `prepareAgentInstructionRuntimeContext` and
  `loadAgentInstructionsPrefix` before invoking the provider.
- Final prompt assembly order is: runtime operating contract, configured entry
  instructions, sibling `SOUL.md`, sibling `TOOLS.md`, sibling `MEMORY.md`,
  prepared runtime context sections, `## Current Time`, then runtime heartbeat
  instructions when included.
- Runtime heartbeat instructions are included only for heartbeat scenes that are
  not comment-triggered issue wakes.

Invariant:

- Stable instructions and dynamic run context must stay separate.
- Organization-wide resources are not blindly injected into every run; project
  resources are loaded when project context is resolved.
- Runtime skill loading is scoped to the agent, organization, runtime type, and
  resolved config.
- `## Current Time` stays after durable instructions and runtime context.
- Runtime heartbeat instructions, when present, stay at the end of the assembled
  instruction prefix.

Rationale:

- Agent instruction loading is where Rudder turns durable agent identity plus
  current work context into the runtime-visible operating frame. This must stay
  explicit because stale or overbroad context changes agent behavior.

Loaded sections:

1. Runtime operating contract from shared runtime utilities.
2. Configured entry instructions for the agent/runtime.
3. Sibling durable files in order when present: `SOUL.md`, `TOOLS.md`,
   `MEMORY.md`.
4. Prepared dynamic context sections: workspace facts, project resources,
   organization/Rudder resources, assigned automations, startup context, and
   scene-specific context.
5. `## Current Time`.
6. Runtime heartbeat instructions only when the current scene is a heartbeat
   scene that should receive heartbeat close-out guidance.

Why this order:

- Durable identity and policy must be read before dynamic work context.
- Dynamic context must be explicit and bounded so Project Context Resources do
  not become an unreviewed global memory dump.
- Current time is late because it is runtime fact, not durable instruction.
- Heartbeat instructions are last only for eligible heartbeat scenes so they can
  close the final-action loop without overriding chat/comment-specific prompts.

Related code:

- `packages/agent-runtime-utils/src/server-utils.instructions.ts`
- `packages/agent-runtime-utils/src/server-utils.prompts.ts`
- `packages/agent-runtimes/claude-local/src/server/execute.ts`
- `packages/agent-runtimes/codex-local/src/server/execute.ts`
- `packages/agent-runtimes/cursor-local/src/server/execute.ts`
- `packages/agent-runtimes/gemini-local/src/server/execute.ts`
- `packages/agent-runtimes/opencode-local/src/server/execute.ts`
- `packages/agent-runtimes/pi-local/src/server/execute.ts`
- `server/src/services/agent-run-context.ts`
- `server/src/services/agent-instructions.ts`
- `server/src/services/agent-startup-context.ts`
- `server/src/services/runtime-kernel/heartbeat.execute.ts`
- `server/src/services/workspace-runtime.helpers.ts`

Related tests:

- `packages/agent-runtime-utils/src/server-utils.test.ts`
- `server/src/__tests__/agent-instructions-service.test.ts`
- `server/src/__tests__/agent-run-context.test.ts`
- `server/src/__tests__/workspace-runtime.test.ts`
