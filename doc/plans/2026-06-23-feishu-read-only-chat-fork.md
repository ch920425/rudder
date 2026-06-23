---
title: Feishu Read-Only Chat Fork
date: 2026-06-23
kind: proposal
status: proposed
area: chat
entities:
  - messenger_chat
  - chat_forks
  - feishu_integration
issue:
related_plans:
  - 2026-06-22-chat-fork-conversation-groups.md
supersedes: []
related_code:
  - doc/product/domains/collaboration/chat-messenger-im.md
  - packages/db/src/schema/chat_conversations.ts
  - packages/shared/src/types/chat.ts
  - packages/shared/src/validators/chat.ts
  - server/src/routes/chats.ts
  - server/src/services/chats.ts
  - server/src/services/integrations/feishu/inbound-dispatcher-db.ts
  - server/src/services/integrations/feishu/runtime.ts
  - ui/src/api/chats.ts
  - ui/src/pages/Chat.tsx
  - ui/src/components/MessengerContextSidebar.tsx
commit_refs: []
updated_at: 2026-06-23
---

# Feishu Read-Only Chat Fork

## Overview

Feishu-origin conversations should behave as external-bound records inside
Rudder. The original Feishu chat is readable in Messenger and Chat so operators
can inspect what arrived, see source badges, audit run evidence, and keep the
external context visible. It should not become a normal Rudder conversation
that the operator can freely continue, archive, delete, or mutate.

When the operator wants to continue working from that Feishu context inside
Rudder, they should fork the Feishu-bound conversation. The fork creates a new
ordinary Rudder chat, copies the relevant context, preserves lineage back to the
Feishu source, and intentionally drops the Feishu external binding. Messages
sent after the fork stay in Rudder and are not synchronized back to Feishu.

This keeps the IM bridge auditable without turning Feishu into a two-way
generic chat surface owned by Rudder.

## What Is The Problem?

Current product contracts already separate normal Rudder chat, chat forks, and
Feishu integration behavior:

- `CHAT.LIFECYCLE.001` defines chat as an intake and lightweight run surface,
  not the primary durable work system.
- `CHAT.FORK.001` defines forked conversations as isolated child
  conversations that copy context and preserve lineage.
- `IM.FEISHU.001` defines Feishu as an external IM bridge that binds external
  chat identity to Rudder Messenger, issue, and run records.

The missing product boundary is what happens after a Feishu-bound conversation
is visible in Rudder. If Rudder lets the operator directly continue the bound
chat like an ordinary native chat, the UI implies that:

- Rudder owns the conversation lifecycle, even though Feishu owns the external
  thread.
- local messages may synchronize back to Feishu, even when no reliable outbound
  chat-continuation contract exists.
- archive/delete/rename/composer actions are safe, even though they can make
  the audit trail diverge from the external source of truth.
- future runtime context may mix external-bound IM history with local-only
  operator collaboration without an explicit boundary.

The requirement is to make the boundary explicit: Feishu chat in Rudder is a
read-only external record; normal conversation resumes only after fork.

## What Will Be Changed?

This proposal introduces an external-bound read-only mode for Feishu-origin
chat conversations and defines fork detachment semantics.

1. Feishu-bound conversations become read-only in Rudder's normal chat UI.
   - The conversation and messages remain visible.
   - The composer is disabled or replaced with a fork call-to-action.
   - Local user-message send, assistant send, queue, attachment upload,
     title/metadata mutation, context-link mutation, rename, archive, delete,
     proposal resolution, and issue-conversion actions are blocked for
     Feishu-bound conversations unless explicitly listed as passive read-state
     behavior.
   - Feishu inbound events and Feishu-triggered integration runtime writes
     remain allowed. They are provider-origin IM bridge behavior under
     `IM.FEISHU.001`, not local Rudder continuation.

2. The primary operator action becomes `Fork to continue`.
   - Conversation-level fork is available from the Feishu-bound chat.
   - Message-level fork should use the same message eligibility as
     `CHAT.FORK.001`; if the current fork implementation only supports
     assistant-message fork points, the first implementation may expose only
     `Fork latest` for Feishu-bound chats.
   - The UI copy should make the boundary clear without overexplaining:
     `Fork to continue in Rudder`.

3. Forked conversations are ordinary Rudder chats.
   - The child copies source messages and context links according to
     `CHAT.FORK.001`.
   - The child stores fork lineage back to the Feishu-bound source.
   - The child does not copy Feishu external chat binding metadata.
   - The child does not show the Feishu source badge as its own origin.
   - The child supports normal composer, assistant/runtime, rename, archive,
     delete, and future fork actions.

4. Source metadata is separated into two concepts.
   - `sourceMetadata` on a conversation continues to mean "this conversation is
     externally bound and owned by that source."
   - Fork lineage points back to the Feishu-bound conversation for audit and
     navigation, but it does not make the fork externally bound.
   - If UI wants to show provenance on the fork, it should use wording such as
     `Forked from Feishu chat`, not the same compact source badge that marks an
     active external binding.

5. The API exposes mutability as a typed server-owned field.
   - `ChatConversation.mutability` should return one of:
     - `native_chat`
     - `external_bound_chat`
     - `native_fork_from_external`
   - The server derives this value from trusted conversation state and
     integration chat binding state. Clients must not infer mutability by
     inspecting raw `sourceMetadata.source` or `sourceMetadata.provider`.
   - The UI may use `sourceMetadata` for badges/provenance, but all enablement
     decisions should come from `mutability` and future explicit capabilities.

6. Product contracts should be updated only after explicit approval.
   - A future implementation must update `CHAT.FORK.001` and `IM.FEISHU.001`
     in `doc/product/domains/collaboration/chat-messenger-im.md`.
   - `doc/product/registry.yml` should list the implementation plan and any new
     tests under both contract IDs.
   - This proposal itself does not grant guarded product registry edit
     permission.

## Success Criteria For Change

The change is successful when these statements are true:

- A Feishu-origin conversation can be opened in Messenger and Chat and is
  clearly visible as Feishu-backed.
- The Feishu-bound chat cannot be directly continued from Rudder's composer.
- Local mutation APIs reject board attempts to send user messages, start
  assistant turns, rename, archive, or delete the Feishu-bound conversation.
- Feishu inbound/runtime paths can still append provider-origin messages and
  preserve the external audit trail.
- Feishu-triggered assistant/run replies that belong to the existing IM bridge
  may still persist to the source and send/patch Feishu outbound state.
- `Fork to continue` creates a new native Rudder chat with copied context and
  fork lineage.
- The fork has no active Feishu binding and can be used like any ordinary
  Rudder chat.
- Messages sent in the fork do not create Feishu outbound messages.
- E2E coverage exercises the visible workflow: open Feishu-bound chat, observe
  read-only state, fork it, continue in the fork, and verify the source Feishu
  chat remains unchanged and bound.

## Out Of Scope

- Bidirectional live editing of Feishu chats from Rudder.
- Mirroring local fork messages back to Feishu.
- Detaching or rebinding an existing Feishu-bound conversation without fork.
- Deleting or archiving the external Feishu record from Rudder.
- A full branch graph UI for fork families.
- Multi-provider generalized external-bound chat policy beyond Feishu. The data
  model should leave room for it, but this slice should prove Feishu first.
- Changing Feishu setup-session, credential storage, long-connection, binding
  token, or user-binding flows except where needed to preserve read-only chat
  semantics.

## Non-Functional Requirements

- **Security:** Feishu-bound write APIs must enforce the boundary on the server,
  not only by hiding UI actions. Agent auth and board auth must not bypass
  organization or external-binding checks.
- **Maintainability:** The external-bound check should be centralized enough
  that new chat mutation routes cannot silently forget it.
- **Usability:** The UI should make the next action obvious. A disabled composer
  without a fork path would feel broken.
- **Observability:** Rejected local writes should return a specific conflict or
  validation error that names the external-bound restriction. Fork creation
  should record activity or lineage evidence sufficient for later audit.

## Actors And Allowed Writes

Read-only means "read-only for local Rudder continuation," not "no system may
ever append provider-owned evidence." The implementation must preserve this
actor split:

| Actor / path | Feishu-bound source chat | Native fork from Feishu | Notes |
| --- | --- | --- | --- |
| Board operator using Rudder Chat UI | Read and fork only; local continuation mutations are blocked | Normal native chat permissions | Source chat is an external record; fork is the local collaboration space |
| Board operator using generic chat APIs | Local write attempts return `409 Conflict` | Normal native chat permissions | Server must enforce this even when UI hides controls |
| Agent-auth generic chat API client | Local write attempts return `409 Conflict` unless the endpoint is passive/read-only | Normal native chat permissions under existing auth rules | Agent keys must not bypass external-bound state |
| Feishu inbound dispatcher | May append inbound provider-origin user messages and source metadata | Not applicable unless future provider explicitly targets a fork | This is the external source of truth entering Rudder |
| Feishu-triggered integration runtime | May persist the assistant/status messages required by current IM bridge behavior and may send/patch Feishu outbound state | Not applicable | This preserves `IM.FEISHU.001`; it is not local Rudder operator continuation |
| Native Rudder runtime started from fork | Not allowed to target the Feishu-bound source | Allowed | Fork messages/runs must not create Feishu outbound rows |
| Passive UI state | Read markers, selection, navigation, and display cache updates are allowed | Allowed | These do not mutate source conversation content or external binding |

## Mutability Matrix

Use `409 Conflict` for a local mutation against an existing
`external_bound_chat`. Use existing authorization errors first when the actor
cannot access the organization or conversation at all.

| Operation | `native_chat` | `external_bound_chat` | `native_fork_from_external` |
| --- | --- | --- | --- |
| Read conversation/messages | Allow | Allow | Allow |
| Mark read/unread, select, navigate, cache refresh | Allow | Allow | Allow |
| Create local user message | Allow | Block `409` | Allow |
| Start streaming/non-streaming assistant turn from Rudder UI/API | Allow | Block `409` | Allow |
| Queue/create/claim/edit/cancel/steer local chat follow-up | Allow | Block `409` | Allow |
| Upload local attachments or attach local files to a new local message | Allow | Block `409` | Allow |
| Rename/update title, regenerate title, update primary issue/project/context links | Allow | Block `409` | Allow |
| Archive/delete chat | Allow | Block `409` | Allow |
| Resolve operation/issue/automation proposals inside chat | Allow | Block `409` unless the proposal belongs to the Feishu IM bridge and is handled by that bridge path | Allow |
| Convert chat to issue or create issue from chat UI action | Allow | Block `409`; use fork first if operator wants local work creation | Allow |
| Fork latest/from eligible message | Allow | Allow | Allow |
| Feishu inbound append | Not applicable | Allow through integration path only | Not applicable |
| Feishu-triggered assistant/status persistence and outbound send/patch | Not applicable | Allow through integration runtime only | Not applicable |
| Local native fork message outbound to Feishu | Not applicable | Not applicable | Never |

This table is intentionally stricter than hiding the composer. It covers
secondary mutation paths such as title regeneration, queued follow-ups, proposal
resolution, context mutation, and issue conversion so the external-bound state
does not leak through a less common route.

## User Experience Walkthrough

1. A Feishu user sends a message to the Rudder Feishu bot.
2. Rudder verifies and deduplicates the event, binds the external chat to a
   Rudder conversation, appends the inbound message, and shows the conversation
   in Messenger with the compact `Feishu` source badge.
3. The operator opens the conversation in Rudder.
4. The message history is visible. The composer area shows a read-only state
   with the main action `Fork to continue in Rudder`.
5. The operator clicks `Fork to continue`.
6. Rudder creates a new native chat:
   - `forkedFromConversationId` points to the Feishu-bound source.
   - `forkRootConversationId` follows the existing fork contract.
   - copied messages/context follow `CHAT.FORK.001`.
   - external Feishu binding metadata is not copied as an active binding.
7. Rudder navigates to the fork.
8. The operator sends normal Rudder messages or starts a runtime-backed
   assistant turn in the fork.
9. The original Feishu-bound conversation remains read-only and externally
   bound. The fork's local-only messages do not appear in Feishu outbound state.
10. When the operator returns to the original Feishu-bound conversation, it
    remains visible as the source record with the active Feishu badge. When the
    operator views the fork, the composer is enabled and any provenance marker
    is phrased as `Forked from Feishu chat`, not as an active Feishu badge.

## Implementation

### Product Or Technical Architecture Changes

The core architectural change is a conversation mutability classification:

```text
native_chat
  normal Rudder-owned conversation; local operator and runtime mutations are
  allowed under existing chat contracts.

external_bound_chat
  external provider owns the source thread; Rudder can ingest provider-origin
  messages and record integration runtime output, but local operator
  continuation requires fork.

native_fork_from_external
  ordinary Rudder-owned fork with lineage to an external-bound source; local
  continuation is allowed and external provider sync is disabled.
```

The first implementation can derive `external_bound_chat` from existing
server-owned binding state and hydrated source metadata:

```ts
sourceMetadata.source === "agent_integration"
  && sourceMetadata.provider === "feishu"
```

The derivation should live in a shared server/helper layer, not in UI code. The
API should expose the derived `mutability` field to clients. If more
external-bound providers are added later, this should become a provider-neutral
typed helper instead of repeated provider-specific JSON inspection.

### Breaking Change

This is a product behavior change for Feishu-bound conversations:

- Any existing ability to locally type into a Feishu-bound Rudder chat should be
  removed.
- Existing Feishu-bound records remain readable and bound.
- Existing ordinary chat forks remain ordinary chats.

No database migration is required if the implementation reuses existing
`sourceMetadata` and fork lineage. A migration may be justified later if the
team wants a provider-neutral `externalBindingState` column.

### Design

Recommended server-side guard:

1. Add a shared `isExternalBoundConversation` helper near chat service or
   shared chat metadata utilities. It should be server-owned and backed by
   trusted conversation/integration binding state.
2. Apply it to local board/agent mutation routes:
   - `POST /api/chats/:id/messages`
   - `POST /api/chats/:id/messages/stream`
   - queue/start assistant paths for the conversation
   - rename/update routes
   - title regeneration
   - archive/delete routes
   - context-link and primary-issue/project mutation routes
   - proposal resolution and issue/automation conversion routes
   - attachment/message mutation routes where applicable
3. Exempt trusted provider-ingestion paths that append Feishu-origin messages
   through integration runtime/dispatcher internals.
4. In `forkConversation`, ensure the child conversation does not copy active
   external binding metadata. Keep lineage fields and optional system event
   text as provenance.

Recommended UI behavior:

1. Detect the read-only state from typed conversation metadata returned by the
   API: `conversation.mutability === "external_bound_chat"`. Do not use ad hoc
   UI-side provider JSON inspection for enablement.
2. In the Chat page:
   - show history normally.
   - hide or disable normal send controls.
   - show `Fork to continue in Rudder`.
   - keep `Fork latest` available in the conversation actions.
   - hide direct archive/delete/rename actions for Feishu-bound chats.
3. In Messenger:
   - keep the compact `Feishu` badge on the source conversation.
   - keep fork actions discoverable from the row action menu.
   - after fork, navigate to the child native chat and refresh fork-family
     grouping.

### Security

No new remote API dependency is needed for this boundary. The risk is
authorization and side-effect confusion:

- local board/agent writes must not mutate Feishu-bound conversation state
  through generic chat endpoints.
- fork writes must remain organization-scoped and board-operator scoped as in
  `CHAT.FORK.001`.
- source metadata from Feishu must not be trusted from arbitrary client input;
  it should be written only by integration-owned server paths.
- cross-organization access must fail before mutability-specific details are
  returned, so a caller cannot use Feishu-bound errors to infer another
  organization's external chat metadata.

## What Is Your Testing Plan (QA)?

### Goal

Prove that Feishu-bound conversations are readable external records, that local
continuation is blocked until fork, and that forked chats are native Rudder
conversations detached from Feishu outbound sync.

### Prerequisites

- Existing Feishu integration test fixtures or mocked Feishu inbound events.
- Existing chat fork schema/API/UI behavior from
  `2026-06-22-chat-fork-conversation-groups.md`.
- A test helper that creates a Feishu-bound chat with representative
  `sourceMetadata`.

### Test Scenarios / Cases

1. Server mutation guard:
   - create a Feishu-bound chat.
   - attempt local `POST /messages`, streaming send, rename/update,
     archive/delete, and attachment mutation where supported.
   - expect `409 Conflict` and no persisted local user message or activity
     that implies a local continuation succeeded.

2. Provider write exemption:
   - process a mocked Feishu inbound event.
   - expect the inbound message to persist on the Feishu-bound conversation.
   - expect dedup, source metadata, and outbound/audit behavior from
     `IM.FEISHU.001` to remain intact.

3. Fork detachment:
   - fork the Feishu-bound chat.
   - expect copied context and fork lineage.
   - expect the child conversation to lack active Feishu binding metadata.
   - send a native Rudder message in the child.
   - expect no Feishu outbound row for that child message.

4. Cross-organization negative case:
   - create a Feishu-bound chat in organization A.
   - attempt read, fork, local write, and metadata mutation as organization B.
   - expect existing authorization/not-found behavior before any
     external-bound-specific error.
   - expect no leaked source metadata, lineage, message body, or mutability
     details.

5. UI read-only state:
   - render/open a Feishu-bound chat.
   - expect source badge and message history.
   - expect normal composer send to be unavailable.
   - expect `Fork to continue in Rudder`.
   - click fork and verify navigation to a native chat with composer enabled.

6. E2E workflow:
   - seed or create a Feishu-bound conversation through test helpers.
   - open it in Messenger/Chat.
   - assert read-only UI.
   - fork it.
   - send a normal message in the fork.
   - read back API state: source remains Feishu-bound; child is native and has
     the new message; no Feishu outbound sync occurred for the child message.

### Expected Results

- Feishu-bound source chats stay auditable and externally owned.
- Forks preserve enough context to continue work in Rudder.
- The visible UI does not create ambiguity about whether a local Rudder message
  will be sent to Feishu.

### Pass / Fail

To be filled during implementation verification.

## Documentation Changes

If this proposal is approved and implemented, update:

- `doc/product/domains/collaboration/chat-messenger-im.md`
  - `IM.FEISHU.001`: add the read-only external-bound chat rule, allowed
    provider-origin writes, and fork-to-continue rule.
  - `CHAT.FORK.001`: add external-bound fork detachment semantics.
- `doc/product/registry.yml`
  - add this plan and implementation tests to the related plan/test lists for
    `IM.FEISHU.001` and `CHAT.FORK.001`.
- Public or contributor docs only if Feishu setup/onboarding copy currently
  implies direct Rudder-side continuation in the Feishu-bound chat.

The guarded product registry must not be edited until the user explicitly
approves the product contract delta.

### Draft Product Contract Delta

The future guarded product doc update should include these semantic deltas:

- `IM.FEISHU.001`:
  - Feishu-bound Rudder conversations are external-bound read-only records for
    local Rudder continuation.
  - Local board/agent chat writes, local assistant starts, local title/context
    mutations, archive/delete, proposal resolution, and issue conversion are
    rejected on the Feishu-bound source conversation.
  - Feishu inbound dispatch and Feishu-triggered integration runtime
    assistant/status/outbound writes remain allowed as IM bridge behavior.
  - Operators who want to continue in Rudder must fork the Feishu-bound
    conversation.
- `CHAT.FORK.001`:
  - Forking from an external-bound conversation creates a native Rudder chat.
  - The fork preserves lineage to the source and copies eligible context, but
    it does not inherit active external binding metadata.
  - The fork may show provenance such as `Forked from Feishu chat`, but it must
    not show the same active Feishu source badge or sync local fork messages
    back to Feishu.

## Open Issues

1. Should Feishu-bound chats allow manual rename for local Messenger
   organization, or should title remain entirely provider/inbound-derived? The
   stricter first slice should block rename to avoid implying ownership.
2. Should fork provenance appear as a subtle `Forked from Feishu` marker on the
   child chat, or is fork lineage/navigation enough? The marker is useful but
   must not reuse the same badge semantics as active Feishu binding.
3. Should message-level fork be available for Feishu-bound user messages, or
   should the first slice expose only conversation-level `Fork latest`? Existing
   `CHAT.FORK.001` currently emphasizes assistant-response message fork points.
4. What exact status code should local write rejection use? `409 Conflict`
   fits a valid chat in a non-mutable state; `422` fits unsupported operation.
   Pick one and keep it consistent across mutation endpoints.
   This proposal recommends `409 Conflict`.
5. Before implementation, split or reconcile any unrelated dirty guarded
   product-doc or code changes in the shared worktree so the proposal and the
   future implementation are not accidentally committed together.
