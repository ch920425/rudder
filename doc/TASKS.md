# Issue-Centered Work Model

This document explains how task tracking works in Rudder V1 from the use cases
that matter most: creating durable work, letting an agent execute one thing at a
time, routing review, and keeping the board able to intervene.

For the full V1 contract, see [SPEC-implementation.md](./SPEC-implementation.md).
For command examples, see [CLI.md](./CLI.md).

## Core Use Cases

### 1. Turn intent into work

A board operator, chat conversation, automation, or agent creates an issue.
The issue captures the request, owner, reviewer, project/goal context, labels,
workspace preference, and expected output.

Why this exists: Rudder should not leave important work trapped in a transient
chat thread or one long-running prompt. Durable work lives on issues.

### 2. Let one agent own execution

An agent checks out one assigned issue, moves it into active work, and records
progress through comments, activity, run links, documents, attachments, and work
products.

Why this exists: the single-assignee model gives each active issue one clear
owner and makes recovery auditable.

### 3. Route review without inventing a second task

When work is ready for review, the issue moves to `in_review` and names either
a reviewer agent or a reviewer user. The reviewer records a structured decision
instead of only leaving a free-form comment.

Why this exists: review is part of the same work loop. It should not disappear
into a separate hidden queue.

### 4. Recover stuck work

If an issue is blocked, a run fails, or a reviewer exits without closeout,
Rudder keeps the state visible and queues bounded follow-up where the product
contract allows it.

Why this exists: autonomous work must fail visibly and leave an operator path
to pause, resume, reassign, retry, or cancel.

## Current V1 Hierarchy

```text
Organization
  Goals
  Projects
    Issues
      Sub-issues
      Comments
      Documents
      Attachments
      Work products
```

The organization is the tenancy boundary. Projects and goals provide context,
but issues are the execution unit.

## Issues

An issue is the fundamental unit of tracked work.

Important fields in the current schema:

| Field | Purpose |
|---|---|
| `orgId` | Organization boundary for access and queries |
| `identifier` / `issueNumber` | Human-readable issue identity when assigned |
| `title` / `description` | The work request and detail |
| `status` | Current lifecycle state |
| `priority` | `critical`, `high`, `medium`, or `low` |
| `projectId` / `goalId` | Why this issue exists and where it belongs |
| `parentId` | Sub-issue relationship |
| `assigneeAgentId` / `assigneeUserId` | The single execution owner |
| `reviewerAgentId` / `reviewerUserId` | Optional review routing |
| `checkoutRunId` / `executionRunId` | Runtime evidence for active work |
| `originKind` / `originId` / `originRunId` | Source of the issue |
| `requestDepth` | Delegation depth for agent-created work |
| `billingCode` | Optional cost attribution |
| `executionWorkspaceId` and related settings | Workspace selected for execution |
| `startedAt` / `completedAt` / `cancelledAt` | Lifecycle timestamps |
| `hiddenAt` | Soft-hide state for board surfaces |

## Status Lifecycle

Current issue statuses are:

| Status | Use case |
|---|---|
| `backlog` | Captured work that is not ready for execution |
| `todo` | Ready to be picked up |
| `in_progress` | Currently owned and being executed |
| `in_review` | Output is waiting for reviewer decision |
| `blocked` | Work cannot proceed without follow-up |
| `done` | Work is complete |
| `cancelled` | Work has been abandoned or rejected |

`done` and `cancelled` are terminal states. `in_progress` requires an assignee.
Moving to active, completed, or cancelled states records the corresponding
timestamp.

## Single-Assignee Rule

Each issue has at most one execution assignee at a time.

Use sub-issues when multiple agents need to collaborate:

```text
Issue: Ship Desktop update progress
  Sub-issue: implement update progress events - assignee: engineer agent
  Sub-issue: review UI copy and states - assignee: product/reviewer agent
  Sub-issue: validate packaged smoke path - assignee: QA agent
```

This keeps ownership clear while still allowing larger work to fan out.

## Reviewer Routing

Reviewer fields are routing metadata, not an approval gate:

- `reviewerAgentId` routes review to an agent.
- `reviewerUserId` routes review to a human board user.
- `in_review` means the assignee believes output is ready for review.

Reviewer decisions close the loop:

| Decision | Result |
|---|---|
| `approve` | Move `in_review` or review-owned `blocked` work to `done` |
| `request_changes` | Move work back to `in_progress` and route it to the assignee |
| `needs_followup` | Keep current state with an explicit waiting condition |
| `blocked` | Move the issue to `blocked` |

If a reviewer run exits without a structured decision while the issue remains
in `in_review` or `blocked`, Rudder may queue a bounded
`issue_review_closeout_missing` follow-up and eventually escalate to the
operator.

## Comments, Documents, Attachments, and Work Products

Use the issue body for the stable request. Use comments for progress,
handoffs, questions, and closeout notes.

Additional evidence belongs beside the issue:

- **Documents** hold longer Markdown plans or implementation notes.
- **Attachments** hold screenshots and other uploaded files.
- **Work products** point to external outputs such as PRs, previews, reports,
  generated files, or exported artifacts.
- **Activity events** record mutating actions for audit and debugging.

Work is not considered healthy if the final state says `done` but the user
cannot inspect the output or evidence that justifies it.

## Labels

Labels are organization-scoped lightweight tags. Use them for filtering and
visual grouping such as `bug`, `feature`, `release`, `desktop`, or `needs-docs`.

Labels should not replace status, priority, assignee, reviewer, or project
membership. Those are first-class fields because agents and board surfaces
depend on them.

## Projects and Goals

Projects group related issues toward a deliverable. Goals explain why the work
matters.

Use a project when issues share a delivery context, workspace, or rollout path.
Use a goal when the issue should roll up to an organization, team, agent, or
task-level objective.

Every meaningful issue should be explainable through a project, goal, parent
issue, or surrounding organization mission. If it cannot be explained that way,
it is likely not ready to execute.

## Agent Checkout

Agent execution should use atomic checkout semantics:

1. Agent receives or finds eligible assigned work.
2. Agent checks out exactly one issue.
3. Rudder records the run linkage and moves the issue to `in_progress`.
4. Agent comments, updates documents, attaches evidence, or creates sub-issues.
5. Agent moves the issue to `done`, `blocked`, or `in_review`.

This avoids two agents silently working the same issue and gives recovery logic
a concrete run to inspect.

## CLI Use Cases

Common issue commands:

```sh
pnpm rudder issue list --org-id <org-id>
pnpm rudder issue search "keyword" --org-id <org-id>
pnpm rudder issue get <issue-id-or-identifier>
pnpm rudder issue create --org-id <org-id> --title "..." --description "..."
pnpm rudder issue checkout <issue-id> --agent-id <agent-id>
pnpm rudder issue comment <issue-id> --body "..."
pnpm rudder issue done <issue-id> --comment "..."
pnpm rudder issue block <issue-id> --comment "..."
```

Attach screenshots or other visual evidence with `--image <path>` when the
comment references a local artifact.

## Current vs. Later

Current V1 behavior uses fixed issue statuses and organization-scoped labels.
Some older docs and plans discuss richer team-scoped workflow states,
milestones, estimates, and dependency graphs. Treat those as later product
directions unless `SPEC-implementation.md` or current code says otherwise.

Likely later extensions:

- configurable workflow states
- deeper dependency graphs
- richer milestones
- estimation and throughput reporting
- advanced label groups

Do not describe those as current behavior in user-facing docs until the schema,
API, UI, and agent contracts exist.
