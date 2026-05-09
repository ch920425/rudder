---
title: Messenger pinned thread summary latency fix
date: 2026-05-10
kind: implementation
status: completed
area: chat
entities:
  - messenger_chat
issue: ZST-87
related_plans:
  - 2026-04-09-chat-pin-unread-attention.md
  - 2026-05-01-messenger-thread-organization.md
supersedes: []
related_code:
  - packages/shared/src/types/messenger.ts
  - server/src/services/messenger.ts
  - ui/src/components/MessengerContextSidebar.tsx
  - ui/src/components/MessengerContextSidebar.test.tsx
  - ui/src/pages/Chat.tsx
  - ui/src/lib/inbox.test.ts
  - ui/src/lib/messenger-memory.test.ts
  - server/src/__tests__/messenger-service.test.ts
  - tests/e2e/messenger-contract.spec.ts
commit_refs: []
updated_at: 2026-05-10
---

# Messenger Pinned Thread Summary Latency Fix

## Summary

Make pinned Messenger chats render from `/messenger/threads` data so the `Pinned`
section no longer waits for the heavier `/chats?status=all` sidebar hydration.

## Problem

The Messenger sidebar currently computes pinned grouping from hydrated chat
conversation rows. On cold start, thread summaries can arrive first while the
full chat list is still loading, causing pinned chats to appear late.

## Scope

- Add pinned metadata to chat thread summaries.
- Render and group chat thread rows from summary data when full chat rows are not loaded.
- Keep full chat rows as supplemental data for project grouping and richer context.
- Do not redesign the Messenger sidebar or change pin/unpin persistence semantics.

## Implementation Plan

1. Extend the shared `MessengerThreadSummary` contract with pinned metadata.
2. Populate the pinned fields from chat conversation user state in the Messenger service.
3. Let the sidebar synthesize a lightweight chat row from the thread summary.
4. Restrict the full chat-list fetch to cases that need supplemental context.
5. Add focused server and sidebar regression coverage.

## Success Criteria

- Pinned chat summaries carry `isPinned` from `/messenger/threads`.
- The sidebar renders a `Pinned` section without waiting for `chats?status=all`.
- Pinned/unpinned ordering remains stable inside the thread list.
- Focused server and UI tests pass.

## Validation

- Passed: `pnpm --filter @rudderhq/ui typecheck`
- Passed: `pnpm --filter @rudderhq/server typecheck`
- Passed: `pnpm build`
- Passed: `pnpm exec vitest run ui/src/components/MessengerContextSidebar.test.tsx ui/src/lib/inbox.test.ts ui/src/lib/messenger-memory.test.ts --reporter=dot`
- Blocked by local embedded Postgres init failure: `pnpm test:run`
- Blocked by local embedded Postgres init failure: `pnpm exec vitest run server/src/__tests__/messenger-service.test.ts --testNamePattern "includes chat pinned state" --reporter=dot`
- Blocked by the same local embedded Postgres init failure: `npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/messenger-contract.spec.ts --grep "renders pinned Messenger chats from thread summaries"`

## Open Issues

- Local embedded Postgres initialization exits during bootstrap script before server integration and E2E tests can start. Existing local/default Rudder Postgres clusters and many SysV shared-memory IDs are present.
