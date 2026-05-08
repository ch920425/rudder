---
title: Issue activity review fix
date: 2026-05-09
kind: fix-plan
status: completed
area: ui
entities:
  - issue_activity
  - e2e_tests
issue: ZST-72
related_plans: []
supersedes: []
related_code:
  - tests/e2e/issue-activity-chat-links.spec.ts
  - ui/src/pages/IssueDetail.tsx
  - ui/src/context/LiveUpdatesProvider.tsx
commit_refs:
  - fix: improve issue activity signal
updated_at: 2026-05-09
---

# Issue Activity Review Fix

## Goal

Resolve the review feedback for ZST-72 by making the added browser regression test executable, then rerun the focused E2E spec against a working database.

## Steps

1. Inspect the failing E2E setup and current API response shape.
2. Patch the test setup to read the created agent response correctly.
3. Run the focused issue activity E2E spec with an external PostgreSQL URL.
4. Commit only the ZST-72 follow-up files and report validation evidence.

## Validation

- Passed: `RUDDER_E2E_DATABASE_URL=postgres://rudder:rudder@127.0.0.1:55472/rudder pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/issue-activity-chat-links.spec.ts`
