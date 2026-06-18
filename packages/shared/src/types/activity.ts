export interface ActivityEvent {
  id: string;
  orgId: string;
  actorType: "agent" | "user" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  runId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export type UserActivityLedgerKind =
  | "chat_message"
  | "issue_comment"
  | "approval_comment"
  | "activity_event";

export type UserActivityLedgerInclude =
  | "chat"
  | "comments"
  | "issues"
  | "approvals"
  | "activity";

export interface UserActivityLedgerSource {
  type: "chat" | "issue" | "comment" | "approval" | "activity";
  id: string;
  link?: string | null;
  provenance: {
    table: "chat_messages" | "issue_comments" | "approval_comments" | "activity_log";
    id: string;
    orgId: string;
  };
}

export interface UserActivityLedgerRelatedEntity {
  type: "agent" | "chat" | "issue" | "run" | "approval" | "project" | "goal";
  id: string;
  label?: string | null;
}

export interface UserActivityLedgerItem {
  id: string;
  kind: UserActivityLedgerKind;
  occurredAt: string;
  userId: string;
  actor: {
    type: "user";
    id: string;
    displayName?: string | null;
  };
  summary: string;
  excerpt?: string | null;
  source: UserActivityLedgerSource;
  related: UserActivityLedgerRelatedEntity[];
  metadata?: Record<string, unknown>;
}

export interface UserActivityLedgerResponse {
  items: UserActivityLedgerItem[];
  nextCursor: string | null;
}
