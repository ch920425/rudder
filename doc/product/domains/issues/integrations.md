---
title: Issue Integrations
domain: issues
status: active
coverage: seed
contract_ids: []
related_code:
  - server/src/routes/issues.mutations.ts
  - server/src/services/runtime-kernel/heartbeat.release.ts
related_tests:
  - tests/e2e/issue-passive-followup.spec.ts
edit_policy: user_confirmed_only
---

# Issue Integrations

This file is an index of cross-domain contracts used by issue workflows. It is
not an owning source for the referenced behavior.

- `ROUTING.ASSIGNMENT.001`: assignee wakeup on issue create/update/checkout.
- `ROUTING.REVIEWER.001`: reviewer wakeup on reviewable state changes.
- `ROUTING.ATTENTION.001`: mention/comment wake eligibility.
- `RUN.ADMISSION.001`: issue execution lock, deferred wakeups, passive
  close-out, and promotion after release.
