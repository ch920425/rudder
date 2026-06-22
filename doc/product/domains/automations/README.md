---
title: Automations Domain
domain: automations
status: active
coverage: detailed
contract_ids: []
related_code:
  - server/src/routes/automations.ts
  - server/src/services/automations.ts
  - server/src/services/automations.scheduler.ts
  - server/src/services/automation-chat-output.ts
related_tests:
  - server/src/__tests__/automations-service.test.ts
  - server/src/__tests__/automations-routes.test.ts
  - server/src/__tests__/automations-e2e.test.ts
edit_policy: user_confirmed_only
---

# Automations Domain

## Owns

- Automation definition, ownership, status, and configuration.
- Trigger semantics for schedule, API, webhook, and manual dispatch.
- Automation run records, concurrency, catch-up, and idempotency.
- Output routing to tracked issues or per-run chat conversations.

## Does Not Own

- Heartbeat execution internals. See `RUN.*`.
- Issue state once an output issue exists. See `ISSUE.*`.
- Chat message lifecycle once chat output is created. See `CHAT.*`.

## Contract Index

- `AUTOMATION.DEFINITION.001`: automations define repeatable agent work and its
  owner/context.
- `AUTOMATION.TRIGGER.001`: triggers decide when and why automation work is
  dispatched.
- `AUTOMATION.RUN.001`: automation runs preserve dispatch state, concurrency,
  idempotency, and terminal result.
- `AUTOMATION.OUTPUT.001`: output mode chooses tracked issue or per-run chat
  audit path.
