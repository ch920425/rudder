---
title: Library And Context Domain
domain: library-and-context
status: active
coverage: detailed
contract_ids: []
related_code:
  - server/src/services/resource-catalog.ts
  - server/src/services/library-entries.ts
  - server/src/services/organization-workspace-browser.ts
  - server/src/services/agent-run-context.ts
related_tests:
  - server/src/__tests__/library-path-markdown.test.ts
  - server/src/__tests__/organization-workspace-browser.test.ts
  - server/src/__tests__/agent-run-context.test.ts
edit_policy: user_confirmed_only
---

# Library And Context Domain

## Owns

- Library files and stable markdown/file references.
- Organization resources and project context resources.
- Protected workspace paths and mentionable file eligibility.
- Project and execution workspace policy when it affects agent context.

## Does Not Own

- Agent instruction order. See `AGENT.INSTRUCTIONS.001`.
- Run admission/execution. See `RUN.*`.
- Project identity. See `ORG.PROJECT.001`.

## Contract Index

- `CONTEXT.RESOURCES.001`: project resources are curated context admitted into
  agent runs.
- `LIBRARY.FILES.001`: Library files are durable, referenceable artifacts with
  protected path boundaries.
- `WORKSPACE.PROJECT.001`: project workspaces choose the cwd/context available
  to project and issue runs.
- `WORKSPACE.RUN.001`: execution workspaces preserve run isolation and cleanup
  semantics.
- `WORKSPACE.BACKUP.001`: organization workspace backup versions are browseable,
  restorable, deletable, and downloadable by the board operator.
- `DOCUMENT.WORKPRODUCT.001`: documents and work products preserve reviewable
  output artifacts and revision history.
