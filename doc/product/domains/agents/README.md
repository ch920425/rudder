---
title: Agents Domain
domain: agents
status: active
coverage: seed
contract_ids: []
related_code:
  - server/src/services/agent-run-context.ts
  - server/src/services/agent-instructions.ts
  - server/src/services/runtime-kernel/heartbeat.execute.ts
related_tests:
  - server/src/__tests__/agent-instructions-service.test.ts
  - server/src/__tests__/agent-run-context.test.ts
edit_policy: user_confirmed_only
---

# Agents Domain

## Owns

- Durable agent identity, role, capability, runtime config, and instruction
  loading.
- Enabled skill resolution for a runtime invocation.
- Stable instruction and dynamic run-context separation.

## Does Not Own

- Heartbeat admission or execution lifecycle. See `RUN.*`.
- Issue assignment/reviewer routing. See `ROUTING.*`.
- Project resource ownership. See library-and-context.

## Contract Index

- `AGENT.INSTRUCTIONS.001`: stable instructions, runtime skills, workspace
  context, project resources, automations, and startup context are loaded in a
  bounded runtime context.
