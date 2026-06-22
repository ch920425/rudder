---
title: Plugins Domain
domain: plugins
status: active
coverage: detailed
contract_ids: []
related_code:
  - server/src/routes/plugins.ts
  - server/src/routes/plugins.operations-routes.ts
  - server/src/services/plugin-registry.ts
  - server/src/services/plugin-lifecycle.ts
  - server/src/services/plugin-worker-manager.ts
  - server/src/services/plugin-capability-validator.ts
  - server/src/services/plugin-job-scheduler.ts
  - server/src/services/plugin-tool-dispatcher.ts
related_tests:
  - server/src/__tests__/plugin-job-scheduler.test.ts
  - server/src/__tests__/plugin-worker-manager.test.ts
  - server/src/__tests__/plugin-package-resolution.test.ts
  - tests/e2e/linear-plugin-import.spec.ts
edit_policy: user_confirmed_only
---

# Plugins Domain

Scope note:

- Plugins are implemented extension surfaces and are documented here so their
  current behavior does not regress.
- Plugin contracts document implemented extension-surface guardrails. Archived
  V1 or target specs are historical context and do not override these current
  product contracts.

## Owns

- Installed plugin lifecycle, manifests, config, workers, capabilities, jobs,
  webhooks, logs, UI slots, state, and plugin-owned tool dispatch.
- The boundary between core Rudder invariants and additive plugin capability.

## Does Not Own

- Core issue, approval, checkout, budget, or auth invariants.
- Project workspace path semantics, except where plugins consume workspace
  metadata through host APIs.

## Contract Index

- `PLUGIN.LIFECYCLE.001`: plugins install, activate, run, update, and uninstall
  through host-managed lifecycle boundaries.
- `PLUGIN.CAPABILITY.001`: plugins declare capabilities and cannot override core
  invariants or tools by name collision.
- `PLUGIN.JOBS.WEBHOOKS.001`: plugin jobs and webhooks are observable,
  namespaced execution paths.
