---
title: Issue Surface Contracts
domain: issues
status: active
coverage: seed
contract_ids:
  - ISSUE.SURFACE.001
related_code:
  - ui/src/pages/IssueDetail.tsx
  - ui/src/pages/Issues.tsx
related_tests:
  - tests/e2e/issue-detail-toolbar-actions.spec.ts
  - tests/e2e/issue-board-display-properties.spec.ts
edit_policy: user_confirmed_only
---

# Issue Surface Contracts

Domain-local surface files record this domain's visible affordances and state
mapping. They are not page-level specs. Cross-domain pages must be mapped in
`doc/product/surfaces/surface-domain-map.md`.

## ISSUE.SURFACE.001

Behavior:

- Issue list and detail surfaces must expose issue status, priority, title,
  project/goal context, assignee/reviewer slots, and linked evidence.
- Issue status and ownership affordances must reflect invalid or unavailable
  transitions clearly through disabled states or server errors.
- Issue detail may show run evidence, comments, review state, and activity, but
  those semantics remain owned by their domains.
- Failed issue mutations must surface an error; they must not silently discard
  the user's action.

Invariant:

- Issue UI must not redefine run, routing, review, comment, or activity rules as
  local page behavior.

Rationale:

- Issue pages are the operator's main inspection surface, but product logic must
  remain owned by bounded domains to avoid duplicate facts.

Related code:

- `ui/src/pages/IssueDetail.tsx`
- `ui/src/pages/Issues.tsx`

Related tests:

- `tests/e2e/issue-detail-toolbar-actions.spec.ts`
- `tests/e2e/issue-board-display-properties.spec.ts`
