# Rudder Documentation Map

This folder is the contributor-facing source of truth for Rudder product,
engineering, operations, and release behavior.

Read and write these docs from the use case first. A reader should be able to
answer "what job am I trying to do?" before they have to learn every entity,
command, or subsystem.

## Start Here

For almost every task, read these in order:

1. [GOAL.md](./GOAL.md) - why Rudder exists and what success means
2. [PRODUCT.md](./PRODUCT.md) - product model and primary operator flows
3. [SPEC-implementation.md](./SPEC-implementation.md) - V1 implementation
   contract

Then choose the route that matches the work.

## Use-Case Routes

### I want to understand the product

- [GOAL.md](./GOAL.md)
- [PRODUCT.md](./PRODUCT.md)
- [SPEC-implementation.md](./SPEC-implementation.md)
- [SPEC.md](./SPEC.md) for long-horizon context

Use this route before changing product copy, onboarding, navigation, or core
workflow behavior.

### I want to run Rudder locally

- [DEVELOPING.md](./DEVELOPING.md)
- [CLI.md](./CLI.md)
- [DATABASE.md](./DATABASE.md)
- [DEPLOYMENT-MODES.md](./DEPLOYMENT-MODES.md)
- [DOCKER.md](./DOCKER.md)

Use this route when the job is local development, debugging a dev instance,
switching profiles, container smoke testing, or explaining how the CLI and
local server work together.

### I want to change the agent work loop

- [SPEC-implementation.md](./SPEC-implementation.md)
- [TASKS.md](./TASKS.md)
- [TASKS-mcp.md](./TASKS-mcp.md)
- [DEVELOPING.md](./DEVELOPING.md)
- bundled skill docs under `server/resources/bundled-skills/`

Use this route for issues, comments, agent checkout, reviewer behavior,
heartbeat wakeups, closeout, and agent-facing CLI/API changes.

### I want to change the visible UI

- [PRODUCT.md](./PRODUCT.md)
- [DESIGN.md](./DESIGN.md)
- [SPEC-implementation.md](./SPEC-implementation.md)
- nearby plan docs in [plans/](./plans/)

Use this route for page layout, navigation, dialogs, copy, density,
progressive disclosure, and user-visible state changes.

### I want to change Desktop or local packaging

- [DESKTOP.md](./DESKTOP.md)
- [DEVELOPING.md](./DEVELOPING.md)
- [DATABASE.md](./DATABASE.md)
- [RELEASING.md](./RELEASING.md)
- `desktop/scripts/smoke.mjs`
- `scripts/prod-desktop.mjs`

Use this route for packaged boot, local profile isolation, startup migrations,
portable app replacement, update checks, and installer assets.

### I want to release Rudder

- [RELEASING.md](./RELEASING.md)
- [PUBLISHING.md](./PUBLISHING.md)
- [RELEASE-AUTOMATION-SETUP.md](./RELEASE-AUTOMATION-SETUP.md)
- [DESKTOP.md](./DESKTOP.md)

Use this route for npm publishing, GitHub Releases, Desktop assets, canary
promotion, stable releases, and public install smoke tests.

### I want to build or review plugins

- [plugins/PLUGIN_SPEC.md](./plugins/PLUGIN_SPEC.md)
- [plugins/PLUGIN_AUTHORING_GUIDE.md](./plugins/PLUGIN_AUTHORING_GUIDE.md)
- [SPEC-implementation.md](./SPEC-implementation.md)

Use this route when a capability should live at the edge of the control plane
instead of becoming core product surface.

## Writing Rules

Good Rudder documentation is use-case driven:

- Lead with the reader's job, not the subsystem's internal taxonomy.
- Show the happy path first, then explain escape hatches and internals.
- Connect every major concept to a concrete operator or agent action.
- Mark current behavior, target behavior, and aspirational design separately.
- Keep command examples copy-pasteable from the repo root unless stated
  otherwise.
- When behavior spans code, API, CLI, UI, and skills, name the contract and link
  the surfaces that must stay synchronized.
- Prefer additive edits to strategic docs. Do not replace `SPEC.md` or
  `SPEC-implementation.md` wholesale unless the product direction is changing.
- Keep plan docs in [plans/](./plans/) and follow
  [DEVELOPING.md](./DEVELOPING.md#plan-docs).

If a doc reads like a schema dump, add the use case that makes the schema
necessary. If a doc reads like a product pitch, add the exact workflow that
proves the claim.
