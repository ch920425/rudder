---
title: Resources Library And Workspaces
domain: library-and-context
status: active
coverage: detailed
contract_ids:
  - CONTEXT.RESOURCES.001
  - LIBRARY.FILES.001
  - WORKSPACE.PROJECT.001
  - WORKSPACE.RUN.001
  - WORKSPACE.BACKUP.001
related_code:
  - packages/db/src/schema/organization_resources.ts
  - packages/db/src/schema/library_entries.ts
  - packages/db/src/schema/project_resource_attachments.ts
  - packages/db/src/schema/project_workspaces.ts
  - packages/db/src/schema/execution_workspaces.ts
  - server/src/services/resource-catalog.ts
  - server/src/services/library-entries.ts
  - server/src/services/organization-workspace-browser.ts
  - server/src/services/execution-workspace-policy.ts
  - server/src/services/execution-workspaces.ts
  - server/src/services/workspace-backups.ts
  - server/src/routes/orgs.ts
  - server/src/services/agent-run-context.ts
  - ui/src/pages/OrganizationResources.tsx
  - ui/src/pages/OrganizationWorkspaces.tsx
  - ui/src/pages/OrganizationWorkspaceBackups.tsx
  - ui/src/components/ProjectResourcesPanel.tsx
related_tests:
  - server/src/__tests__/library-path-markdown.test.ts
  - server/src/__tests__/organization-workspace-browser.test.ts
  - server/src/__tests__/execution-workspace-policy.test.ts
  - server/src/__tests__/run-workspace-routes.test.ts
  - server/src/__tests__/agent-run-context.test.ts
  - server/src/__tests__/workspace-backups.test.ts
  - server/src/__tests__/workspace-backups-routes.test.ts
  - tests/e2e/organization-workspaces-launcher.spec.ts
  - tests/e2e/workspace-shell.spec.ts
  - tests/e2e/workspace-backups.spec.ts
edit_policy: user_confirmed_only
---

# Resources Library And Workspaces

## CONTEXT.RESOURCES.001

Why:

- Project Context Resources define what background material is intentionally
  eligible for a run. They are a context admission layer, not a generic file
  dump.

Product model:

- Organization resources have kind, source type, locator, title, metadata, and
  organization scope.
- A project attaches resources with role, note, and ordering.
- Library-backed resources use normalized project/library locators so the same
  durable file can be reused without duplicate catalog entries.
- Agent run context injects attached project resources only when the run has
  project context.

Flow:

1. Operator creates or selects a Library/external resource.
2. Project attaches the resource with role and note.
3. Agent run context resolves the project.
4. Instruction context includes a Project Context Resources section with
   bounded resource facts and references.
5. The runtime can inspect the referenced Library file through agent-facing
   APIs/CLI when needed.

Invariants:

- Project resources are curated starting context, not the total knowledge
  boundary.
- Organization resources must not be injected into unrelated runs just because
  they exist.

Evidence:

- ProjectResourcesPanel shows attachment role/order/note.
- Agent run context tests assert resource prompt content.

## LIBRARY.FILES.001

Why:

- Library is where durable artifacts, plans, references, and reusable project
  files live. It must be editable and referenceable without exposing every
  internal agent/system directory as product content.

Product model:

- Library entries map stable ids/references to organization workspace files.
- Operators and agents can list, read, create, update, delete, rename, and link
  allowed files.
- Protected roots such as agent instruction, skills, and managed directories
  are excluded from normal mentionable Library surfaces unless an explicit
  management flow owns them.

Flow:

1. Actor browses or edits Library through UI, CLI, or API.
2. Server normalizes and validates the path against workspace/protected-path
   rules.
3. Library entry cache/reference id is created or reused.
4. Markdown/reference rendering can turn the Library file into a stable link.
5. Project resources can attach eligible Library files as curated run context.

Invariants:

- Library references must stay stable enough for comments, chats, and docs to
  remain readable.
- Protected paths are not ordinary Library content.

Evidence:

- Library path markdown tests cover reference generation.
- Organization workspace browser tests cover path safety and browser behavior.

## WORKSPACE.PROJECT.001

Why:

- Project workspace selection determines where an agent works, what repository
  metadata it sees, and which Library/project files are local to the task.

Product model:

- A project can have multiple workspaces: local path, git repo,
  remote-managed, or non-git path.
- One workspace is primary. The first workspace defaults to primary; deleting
  or demoting primary reselects safely.
- Issue/project runs prefer project workspace context before falling back to
  organization workspace or agent home.

Flow:

1. Operator creates or updates project workspace.
2. Server validates path/provider metadata and primary uniqueness.
3. Agent run context resolves workspace for issue/project run.
4. Runtime receives cwd/workspace hints and project resource context.

Invariants:

- Primary workspace selection is deterministic.
- Workspace hints must not claim a cwd that the runtime cannot access.

Evidence:

- Organization Workspaces UI exposes workspace state.
- Agent run context tests cover workspace prompt/context output.

## WORKSPACE.RUN.001

Why:

- Execution workspaces are the boundary between a run and the files/branch it
  may mutate. Without this contract, shared, isolated, operator-branch, and
  agent-default strategies become hidden implementation details.

Product model:

- Run workspaces have mode, strategy, status, cwd, branch/provider metadata,
  project linkage, and archival state.
- Workspace policy resolves project default, issue override, and runtime
  fallback into the concrete run workspace.
- Archiving a run workspace is blocked while open issues still depend on it.
- Archive/cleanup stops runtime services and removes disposable artifacts when
  policy allows.

Flow:

1. Run admission/execution asks workspace policy for a workspace.
2. Policy resolves strategy and realizes the workspace.
3. Run stores workspace context for audit and navigation.
4. RunWorkspace detail and workspace services expose the terminal surface.
5. Archive/cleanup is allowed only after dependency checks pass.

Invariants:

- Run isolation strategy must be explicit and auditable.
- Workspace cleanup must not delete files still needed by open work.

Evidence:

- Execution workspace policy tests cover strategy resolution.
- Run workspace routes tests cover lifecycle and archive constraints.

## WORKSPACE.BACKUP.001

Why:

- Organization workspace backups are the operator's safety rail for local-first
  agent work. They need to be inspectable in Rudder and exportable to local
  disk so a specific version can be retained outside the rolling retention
  window.

Product model:

- Workspace backups are organization-scoped versions with status, trigger
  source, file count, byte size, checksum metadata, expiration, and a local
  artifact reference.
- The board operator can create a manual version, browse and preview files from
  a succeeded/restored version, restore that version after Rudder creates a
  pre-restore safety backup, delete non-running versions from visible history,
  and download a selected succeeded/restored version to local disk.
- Download returns the selected backup artifact as an attachment only after the
  server verifies that the artifact exists, belongs to the requested
  organization, is not failed/running/deleted, and matches the recorded archive
  checksum when one is present.

Flow:

1. Operator opens Workspace backups and selects a concrete version.
2. Rudder keeps file browsing scoped to the selected version instead of the
   live workspace.
3. Operator downloads the selected version from the version details action.
4. Server streams the exact backup artifact for that organization/version as a
   local file download.
5. Restore and delete remain separate explicit actions with their existing
   safety and retention semantics.

Invariants:

- Backup download must never bypass organization access checks.
- Failed, running, deleted, missing, invalid, or checksum-mismatched backup
  artifacts must not be downloaded.
- Downloading a backup is read-only; it must not mutate backup status,
  retention, workspace files, or activity history.

Evidence:

- Workspace backup service tests cover version creation, browsing, restore,
  delete, download metadata, and checksum failure.
- Workspace backup route tests cover attachment headers, board-only download,
  and artifact validation errors.
- Workspace backups E2E covers selecting a version, previewing a file,
  downloading the selected artifact, restore safety backup creation, and delete.
