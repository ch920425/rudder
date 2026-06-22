---
title: Chat Messenger And IM Integration
domain: collaboration
status: active
coverage: detailed
contract_ids:
  - CHAT.LIFECYCLE.001
  - CHAT.RICH.REFERENCE.RENDERING.001
  - MESSENGER.ATTENTION.001
  - IM.FEISHU.001
related_code:
  - packages/db/src/schema/chat_conversations.ts
  - packages/db/src/schema/chat_messages.ts
  - packages/db/src/schema/chat_generations.ts
  - packages/db/src/schema/agent_integrations.ts
  - packages/shared/src/project-mentions.ts
  - server/src/routes/chats.ts
  - server/src/services/chats.ts
  - server/src/services/chat-agent-runs.ts
  - server/src/services/messenger.ts
  - server/src/routes/integrations.ts
  - server/src/services/integrations/agent-integrations.ts
  - server/src/services/integrations/feishu/inbound-dispatcher.ts
  - server/src/services/integrations/feishu/inbound-dispatcher-db.ts
  - server/src/services/integrations/feishu/inbound-normalizer.ts
  - server/src/services/integrations/feishu/event-verifier.ts
  - ui/src/index.css
  - ui/src/components/MarkdownBody.tsx
  - ui/src/components/MilkdownMarkdownEditor.tsx
  - ui/src/pages/Chat.tsx
  - ui/src/pages/Messenger.tsx
  - ui/src/pages/AgentDetail.integrations.tsx
related_tests:
  - server/src/__tests__/chat-routes.test.ts
  - server/src/__tests__/chat-assistant.test.ts
  - server/src/__tests__/messenger-service.test.ts
  - server/src/__tests__/agent-integration-routes.test.ts
  - server/src/__tests__/agent-integration-inbound-dispatcher.test.ts
  - server/src/__tests__/agent-integration-feishu-db-dispatcher.test.ts
  - server/src/__tests__/agent-integration-feishu-inbound-normalizer.test.ts
  - ui/src/lib/index-css.test.ts
  - ui/src/components/MilkdownMarkdownEditor.test.ts
  - ui/src/components/MarkdownBody.test.tsx
  - tests/e2e/messenger-contract.spec.ts
  - tests/e2e/chat-rich-references.spec.ts
  - tests/e2e/agent-detail-feishu-integration.spec.ts
edit_policy: user_confirmed_only
---

# Chat Messenger And IM Integration

## CHAT.LIFECYCLE.001

Why:

- Chat is where humans clarify intent, run lightweight assistant turns, draft
  issue/automation proposals, and attach context before work becomes durable
  tracked execution.

Product model:

- A chat conversation belongs to an organization and may link to issues,
  projects, resources, approvals, or automation runs.
- Messages have role, status, body, attachments, rich references, structured
  payloads, and optional run attribution.
- Chat-native assistant turns that invoke runtimes are Agent Runs under
  `RUN.CHAT.AGENT.001`.
- Durable tracked work remains issue-centric unless the configured flow is
  explicitly chat-native, such as automation `chat_output`.

Flow:

1. User creates or opens chat.
2. Composer may include attachments, mentions, rich references, selected agent,
   selected skills, and structured proposal payloads.
3. Server persists user message and context links.
4. If a runtime assistant is invoked, Rudder creates a chat Agent Run and
   streams/persists assistant messages.
5. Chat can convert or propose conversion into issue/automation/approval work.

Invariants:

- Chat messages must remain tied to their conversation and organization.
- Chat proposals/structured payloads must not be confused with plain user
  instructions or automation run input.
- Agent attribution is visible enough to navigate from message to run/agent.

Evidence:

- Chat E2E covers rich references, skill picker, attachments, draft
  persistence, and attribution navigation.
- Chat assistant tests cover runtime-backed turns.

## CHAT.RICH.REFERENCE.RENDERING.001

Why:

- Chat and issue work rely on compact markdown tokens for issue, automation,
  project, library, and skill references. Operators scan these tokens inline
  while drafting, reviewing comments, reading descriptions, and inspecting
  documents.
- Small vertical shifts make references feel broken even when the link target
  is correct. The stable product contract is a shared baseline and icon rhythm,
  not repeated per-surface nudging.

Product model:

- Rich references render as text-first inline tokens with a compact leading
  icon, canonical title/code text, and normal inline wrapping behavior.
- Composer/editor surfaces and read-only markdown surfaces share the same
  visual grammar for the same reference type.
- Composer tokens may use single-line truncation for very long labels, but
  short or ordinary labels remain visible without unnecessary abbreviation.

Flow:

1. A user inserts or views a markdown reference in chat, an issue comment
   editor, issue description, rendered issue/comment body, or Library document.
2. The renderer chooses the reference type icon and label from the resolved
   entity, preferring human titles over opaque ids when available.
3. The token is displayed inline with the surrounding text and remains
   selectable/copyable as part of the editor or rendered body.

Invariants:

- Rich-reference icons and labels must share a stable text baseline across
  composer, issue comment editor, issue description, rendered markdown, and
  Library document surfaces.
- Do not add one-off vertical offsets for a single surface unless visual proof
  shows the shared token contract is wrong for that whole class of tokens.
- New reference kinds must join the same token grammar instead of inventing
  separate pill, badge, or icon alignment behavior.
- Human-readable entity labels take precedence over raw ids in user-facing
  tokens. Raw ids are acceptable only as fallback or secondary disambiguation.
- Truncation in editors is only for labels long enough to threaten the current
  line; ordinary labels should not be shortened.

Evidence:

- CSS contract tests lock the composer token icon alignment and truncation
  behavior.
- Markdown editor/body tests cover special markdown rendering consistency.
- Chat rich-reference E2E covers real chat insertion and rendering behavior.

## MESSENGER.ATTENTION.001

Why:

- Messenger is the board communication shell. It must help the operator see
  what needs attention across chats, issue threads, approvals, failed runs, and
  automation output without moving ownership out of those domains.

Product model:

- Messenger thread directory includes chat threads and domain-derived attention
  threads such as issue, approval, failed run, and automation-created work.
- Threads support read/unread state, previews, pin/archive/delete where the
  underlying thread type supports it, custom groups, and stable navigation.
- Issue thread entries derive from issue comments/activity and read markers.

Flow:

1. Domain event or message creates/updates a Messenger-relevant thread.
2. Messenger service computes preview, ordering, unread state, group membership,
   and attention badge state.
3. Opening a thread clears relevant read markers when appropriate.
4. Actions such as pin/archive/delete route to the owning chat/thread behavior.

Invariants:

- Messenger must cite or route to owning domain contracts; it must not redefine
  issue, approval, run, or automation state.
- Unread/attention counts must be organization-scoped and user-scoped.

Evidence:

- Messenger contract E2E covers ordering, previews, read state, groups,
  redirects, empty state, pin/archive/delete, issue notifications, approvals,
  and automation-created issue attention.

## IM.FEISHU.001

Why:

- IM integration lets external chat become Rudder work without losing audit
  trail. Feishu inbound messages must land in Messenger, bind external chat
  identity, optionally create issues/runs, and send outbound status/reply
  messages.

Product model:

- Agent integration belongs to one organization and one agent.
- Provider state includes Feishu app identity, region, bot open id,
  credentials/status, setup URL metadata, binding tokens, chat bindings, user
  bindings, inbound audit/dedup, and outbound messages.
- Group messages require explicit bot addressing unless provider policy says
  otherwise.

Inbound flow:

1. Feishu callback/mock/long-connection event is verified and normalized.
2. Active integration is resolved by provider/app/org/bot identity.
3. Dedup is inserted before expensive side effects.
4. Sender binding is checked; if missing, Rudder returns/sends binding-token
   instructions.
5. External chat is bound to a Rudder Messenger conversation.
6. Inbound text is appended to chat and, when command/routing rules apply,
   issue and run work is created/enqueued.
7. Outbound placeholder/status is recorded and sent to Feishu.

Outbound flow:

1. Assistant/run result creates a Rudder chat message.
2. Integration runtime patches or sends the corresponding Feishu outbound
   message.
3. Outbound table records provider, external chat id, text, status, and linked
   Rudder message/run/conversation.

Invariants:

- Dedup must run before chat binding, issue creation, run enqueue, or outbound
  writes.
- External Feishu chat id maps to exactly one active Rudder conversation per
  integration binding.
- IM messages remain auditable in Rudder even when the external send fails.

Evidence:

- Feishu route tests cover org scoping and callback verification.
- Inbound dispatcher tests cover dedup, binding, issue/run enqueue, and
  outbound response.
- Agent Detail Feishu E2E covers setup launcher surface.
