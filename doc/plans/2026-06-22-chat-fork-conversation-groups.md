---
title: Chat Fork Conversation Groups
date: 2026-06-22
kind: implementation
status: in_progress
area: chat
entities:
  - messenger_chat
  - chat_forks
  - messenger_custom_groups
issue:
related_plans: []
supersedes: []
related_code:
  - doc/product/domains/collaboration/chat-messenger-im.md
  - packages/db/src/schema/chat_conversations.ts
  - packages/db/src/schema/chat_messages.ts
  - packages/db/src/schema/messenger_custom_groups.ts
  - packages/shared/src/types/chat.ts
  - packages/shared/src/validators/chat.ts
  - server/src/routes/chats.ts
  - server/src/services/chats.ts
  - server/src/services/messenger.ts
  - ui/src/api/chats.ts
  - ui/src/pages/Chat.tsx
  - ui/src/components/MessengerContextSidebar.tsx
  - tests/e2e/messenger-contract.spec.ts
updated_at: 2026-06-22
---

# Chat Fork Conversation Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` or
> equivalent task-by-task execution. This plan is being executed in the current
> Codex session because the user explicitly approved the proposal and asked to
> proceed.

**Goal:** Add a Chat fork workflow that creates an isolated child conversation
from a selected message or latest context and automatically keeps the fork
family together in a Messenger custom group.

**Architecture:** Forking is a server-side atomic workflow: validate the source
conversation and optional source message, create a child chat with lineage
metadata, copy eligible context links, insert a lightweight system event, and
ensure the source plus child thread keys are in one user-scoped Messenger custom
group. The UI exposes `Fork latest` at the conversation level and `Fork from
here` on messages, then navigates to the child conversation after the API
returns.

**Tech Stack:** PostgreSQL + Drizzle schema/migrations, Express REST API,
`@rudderhq/shared` validators/types, React + TanStack Query, Vitest, Playwright.

---

## Problem

Rudder Chat currently supports a single linear conversation. When an operator
wants to explore a different angle on the same topic, continuing in the same
thread pollutes context and makes later work harder to trust. Creating a new
chat manually avoids context pollution but loses the relationship to the
original topic and scatters related branches across Messenger.

Rudder already has user-scoped Messenger custom groups. The product fit is not
"copy a chat and leave it loose"; it is "create an isolated branch and preserve
the branch family as one navigable topic group."

## Scope

In scope:

- Add conversation lineage fields to `chat_conversations`.
- Add `POST /api/chats/:id/fork`.
- Support fork from latest context and fork from a specific message.
- Copy eligible historical messages up to the fork point into the child
  conversation as independent message rows.
- Copy chat context links to the child conversation.
- Add a system event in the child that points back to the source conversation
  and optional source message.
- Create or reuse one Messenger custom group per fork family for the current
  board user.
- Add Chat and Messenger UI actions for forking.
- Add focused service/route/UI tests and an E2E workflow test.
- Update the guarded product contract in `doc/product/domains/collaboration`.

Out of scope:

- Visual branch graph or tree navigation.
- Merge branches back together.
- Forking active streaming generations.
- Forking queued messages.
- Copying binary attachments to new asset records. Historical messages can
  render without copied attachments in this first slice.
- Multi-user shared fork groups. Messenger custom groups are currently
  user-scoped, so auto grouping follows the same model.

## Product Decisions

### Fork lineage

Each forked child conversation stores:

- `forkedFromConversationId`: immediate parent conversation.
- `forkedFromMessageId`: message used as the fork point, or `null` for latest.
- `forkRootConversationId`: root of the fork family. For the first fork, this
  is the source conversation id. For nested forks, this is inherited from the
  source's root.

This supports both direct parent navigation and grouping all descendants under
one family.

### Fork group behavior

Forking automatically ensures one Messenger custom group for the current board
user:

```text
First fork from source:
  create group named after the source title
  add chat:<sourceId>
  add chat:<childId>

Later fork from any member of the family:
  reuse an existing group that contains chat:<forkRootConversationId> when
  available
  otherwise create the group and add chat:<rootId>
  add chat:<sourceId>
  add chat:<childId>
```

The rule is "ensure a fork family group exists", not "create a new group for
every fork." Messenger custom group entries are unique per thread, so if the
root conversation already belongs to a manual custom group for that operator,
that group becomes the fork-family anchor and the fork children are appended to
it.

### Message copy semantics

The first implementation copies source messages up to and including the fork
message as inert context. The copied rows preserve role, kind, status, body, and
timestamps, but they do not retain live runtime, approval, structured payload,
or edit-variant links. The child conversation lineage and the system event
preserve where the branch came from.

Reasoning:

- It keeps runtime context simple because existing chat agent logic already
  reads messages from one conversation.
- It avoids broad runtime prompt changes for inherited-context overlays.
- It preserves branch isolation; future messages in parent or child do not
  affect the other branch.

### Fork guards

- Source conversation must be in the same organization the actor can access.
- Optional source message must belong to the source conversation.
- Forking a source with an active generation returns `409` unless the client
  later adds explicit cancellation support.
- Forking excludes superseded messages and queue state.

## Implementation Tasks

### Task 1: Data Model And Shared Contract

Files:

- Modify `packages/db/src/schema/chat_conversations.ts`.
- Add migration under `packages/db/src/migrations/`.
- Modify `packages/shared/src/types/chat.ts`.
- Modify `packages/shared/src/validators/chat.ts`.
- Modify shared exports if the new schema/type is not automatically exported.

Steps:

1. Add nullable columns:
   - `forked_from_conversation_id uuid references chat_conversations(id) on delete set null`
   - `forked_from_message_id uuid references chat_messages(id) on delete set null`
   - `fork_root_conversation_id uuid references chat_conversations(id) on delete set null`
2. Add indexes on `fork_root_conversation_id` and
   `forked_from_conversation_id`.
3. Add shared `forkChatConversationSchema` with optional
   `sourceMessageId: uuid | null` and optional `title: string`.
4. Extend `ChatConversation` with fork lineage fields.

### Task 2: Server Fork Workflow

Files:

- Modify `server/src/services/chats.ts`.
- Modify `server/src/routes/chats.ts`.
- Use existing helpers from `server/src/services/messenger.ts`.

Steps:

1. Add a failing server test that creates a source chat with messages, forks
   from the first user message, and asserts:
   - child conversation has source/root/message lineage.
   - child contains only messages up to the fork point plus one system event.
   - child context links match the source.
2. Add a failing server test for nested fork grouping:
   - fork root -> child.
   - fork child -> grandchild.
   - custom groups include root, child, and grandchild in one group.
3. Implement `forkConversation(input)` in `chatService`.
4. Add `POST /chats/:id/fork`.
5. Ensure activity logging records a chat fork event.

### Task 3: Client API And Chat UI

Files:

- Modify `ui/src/api/chats.ts`.
- Modify or extract from `ui/src/pages/Chat.tsx`.
- Update existing Chat tests or add a focused test file.

Steps:

1. Add `chatsApi.fork(chatId, data)`.
2. Add conversation action `Fork latest`.
3. Add message action `Fork from here`.
4. On success:
   - update chat list/detail cache.
   - invalidate Messenger custom groups.
   - navigate to `/messenger/chat/:childId`.
5. Show error toast on `409` active-generation conflicts and other failures.

### Task 4: Messenger Surface

Files:

- Modify `ui/src/components/MessengerContextSidebar.tsx`.
- Update `ui/src/components/MessengerContextSidebar.actions.test.tsx`.

Steps:

1. Add `Fork` to chat thread row action menu.
2. Call the same API and navigate to the returned child.
3. Refresh custom groups so the auto-created family group appears without a
   full page reload.

### Task 5: Product Contract And E2E

Files:

- Modify `doc/product/domains/collaboration/chat-messenger-im.md` after this
  approved plan.
- Add or extend `tests/e2e/messenger-contract.spec.ts` or a focused Chat E2E
  spec.

Steps:

1. Add `CHAT.FORK.001` to the collaboration product contract.
2. E2E: seed or create a chat, fork it, assert navigation to a new chat and
   assert the Messenger custom group contains source and fork.
3. E2E edge: fork from a middle message and assert later source messages do not
   appear in the fork.

## Success Criteria

- Operator can fork the current chat from latest context.
- Operator can fork from a specific message.
- Forked conversations do not receive later source context.
- The first fork creates one Messenger group containing source and child.
- Nested forks reuse the fork family group instead of creating scattered groups.
- API enforces organization access and rejects invalid source message ids.
- Tests cover service/route behavior, UI action behavior, and E2E workflow.

## Validation

Required before handoff:

- Focused server tests for fork creation and fork family grouping.
- Focused UI tests for action visibility and API invocation.
- Relevant E2E test for the visible workflow.
- `pnpm -r typecheck` or a narrower package typecheck if full repo is blocked
  by unrelated dirty work.
- `pnpm product-logic:check` because this changes product behavior and the
  product contract.
- Browser verification of the fork flow if a local dev server can run cleanly.
- Spawned reviewer gate with functional, adversarial, and heuristic lenses.

## Open Issues

- Attachment copy is intentionally deferred. Forked history may not duplicate
  attachment records in this first slice.
- A future branch graph could use the lineage fields but is not needed for V1.
- The dirty worktree contains broad unrelated plugin/doc changes; the fork
  implementation must stage and commit only task-owned files.
