---
title: Mac Mini Rudder Backend Migration
date: 2026-06-24
kind: proposal
status: proposed
area: deployment
entities:
  - mac_mini_backend
  - authenticated_private
  - desktop_boundary
  - local_runtime
issue:
related_plans:
  - 2026-02-23-deployment-auth-mode-consolidation.md
  - 2026-03-26-rudder-desktop-v1.md
supersedes: []
related_code:
  - doc/engineering/DEPLOYMENT-MODES.md
  - doc/engineering/DESKTOP.md
  - doc/engineering/DOCKER.md
  - doc/engineering/DATABASE.md
  - doc/engineering/DEVELOPING.md
  - cli/src/commands/run.ts
  - server/src/config.ts
  - server/src/index.ts
  - server/src/bootstrap/create-http-app.ts
  - server/src/middleware/private-hostname-guard.ts
  - server/src/agent-runtimes/registry.ts
  - desktop/src/main.ts
commit_refs: []
updated_at: 2026-06-24
---

# Mac Mini Rudder Backend Migration

## Decision Summary

Run Rudder as one stateful service on the Mac mini and use the MBP as a browser
client. The Mac mini should own the Rudder server, API, served React UI, embedded
PostgreSQL, local storage, workspace files, and local agent CLI execution. The
MBP should stop being the execution host for persistent Rudder work and should
access Rudder at the Mac mini URL in a normal browser.

This is feasible with the current repository, but it is not a Desktop-to-remote
split. Rudder Desktop is currently a local packaged shell only: it starts or
attaches to a local `local_trusted` instance and has no supported remote-instance
connection mode. The supported private-network shape is `authenticated +
private`, bound to a non-loopback interface on the Mac mini, with browser access
over Tailscale, VPN, or trusted LAN.

## Source-Grounded Feasibility

### Supported

- `doc/engineering/DEPLOYMENT-MODES.md` defines `authenticated/private` for
  private-network access such as Tailscale, VPN, or LAN, while `local_trusted`
  is loopback-only.
- `server/src/index.ts` rejects `local_trusted` with a non-loopback bind host,
  so a Mac mini service reachable from the MBP must use `authenticated`.
- `server/src/config.ts` reads `RUDDER_DEPLOYMENT_MODE`,
  `RUDDER_DEPLOYMENT_EXPOSURE`, `RUDDER_PUBLIC_URL`, `HOST`, `PORT`, and
  `RUDDER_ALLOWED_HOSTNAMES`.
- `server/src/bootstrap/create-http-app.ts` serves the UI from `server/ui-dist`
  or `ui/dist` in static mode, or through Vite middleware in dev mode. The MBP
  does not need a separate frontend process for normal use.
- `server/src/middleware/private-hostname-guard.ts` enforces the
  authenticated/private hostname allowlist. Loopback is always allowed; Mac mini
  Tailscale/LAN names must be allowed explicitly or derived from
  `RUDDER_PUBLIC_URL`.
- `server/src/agent-runtimes/registry.ts` registers local adapters such as
  `codex_local`, `claude_local`, `opencode_local`, `gemini_local`, `cursor`,
  `pi_local`, and `hermes_local`. Local runtime prerequisites must exist on the
  Mac mini because the server invokes them there.
- `doc/engineering/DATABASE.md` documents persistent embedded PostgreSQL under
  the active instance root when `DATABASE_URL` is unset.
- `doc/engineering/DOCKER.md` documents a container path with `HOST=0.0.0.0`,
  persistent `/rudder`, `authenticated/private`, and `RUDDER_PUBLIC_URL`, but
  Docker is intentionally out of scope for the first migration.

### Not Supported

- MBP Rudder Desktop as a remote Mac mini client is not supported. Desktop docs
  say the current scope is bundled local instance, `local_trusted`, and no
  remote-instance connection mode.
- A split where the Mac mini owns only "backend" while the MBP runs a separate
  production frontend is unnecessary. The server already serves the browser UI
  same-origin with the API.
- Running the Mac mini server in `local_trusted` on `0.0.0.0` is blocked by
  startup policy and would be the wrong security model.
- Moving only the database to the Mac mini while leaving local agent CLIs on the
  MBP would create split-brain execution. Rudder workspaces, runtime sidecars,
  CLI auth, and file outputs should live on the execution host.

## Current MBP State Observed

As of this research pass on 2026-06-24:

- `origin` points to `https://github.com/Undertone0809/rudder.git`.
- Local checkout commit: `88843f47cea263f8f398e6d030a0a75a7dba1a10`.
- Public `origin/main` reference commit: `36642afa89c12b58eca60bff74269f5057778ce1`.
- Migration-relevant docs and server files checked in this plan matched
  `origin/main`; only `package.json` differed in the checked set.
- MBP packaged `Rudder.app` was running the persistent `prod_local/default`
  instance:
  - `pid`: `13152`
  - `runtimeOwnerKind`: `desktop`
  - `version`: `0.4.0`
  - `apiUrl`: `http://127.0.0.1:3200`
  - server bind: `127.0.0.1:3200`
  - embedded PostgreSQL process: `127.0.0.1:54339`
- MBP config is local-only:
  - `server.deploymentMode`: `local_trusted`
  - `server.exposure`: `private`
  - `server.host`: `127.0.0.1`
  - `server.port`: `3200`
  - `database.mode`: `embedded-postgres`
  - instance root: `~/.rudder/instances/default`

The current MBP instance is therefore not network-migratable as-is. It must be
converted or recreated on the Mac mini as `authenticated/private`.

## Target Architecture

```text
MBP browser
  |
  | https://<mac-mini-tailnet-name>:3100
  | or http://<mac-mini-tailnet-name>:3100 on a trusted private network
  v
Mac mini Rudder service
  - Rudder server/API
  - served React UI
  - Better Auth session handling
  - embedded PostgreSQL
  - local disk storage and backups
  - organization workspaces and Library files
  - local agent CLI runtimes: codex, claude, hermes, opencode, gemini, etc.
```

Recommended first deployment: native Mac mini service with embedded PostgreSQL,
static UI assets, and `launchd`. This is the lowest-moving-parts topology for a
local 24/7 Mac mini and keeps agent CLIs plus their host auth state outside a
container. Docker, reverse proxy hardening, and external PostgreSQL are follow-up
tracks after the first migration works end to end.

## Migration Strategy

### Phase 0: Choose Source Of Truth

Before touching state, decide the exact code line the Mac mini should run:

1. public `origin/main` at `36642afa89c12b58eca60bff74269f5057778ce1`,
2. release tag `v0.4.0` at `5872524ce481d4c9659ef3184322210ea3a5c4f3`, or
3. this MBP working branch at `88843f47cea263f8f398e6d030a0a75a7dba1a10`
   only after pushing it to a named remote branch or transferring it with an
   explicit `git bundle`.

Do not begin data migration until both machines are on the chosen code line.
The current MBP branch has Mac mini gateway commits that are not on
`origin/main`, while `origin/main` has later unrelated public-doc/lifecycle
commits.

### Phase 1: Prepare Mac Mini Host

On the Mac mini:

```sh
git clone https://github.com/Undertone0809/rudder.git ~/projects/rudder
cd ~/projects/rudder
git checkout <chosen-branch-or-commit>
pnpm install
node scripts/prepare-server-ui-dist.mjs
```

If the chosen code line is the local-only MBP branch, make it fetchable before
running the Mac mini checkout command:

```sh
# Option 1: push a temporary remote branch from the MBP.
git push <writable-remote> HEAD:refs/heads/mac-mini-migration-source

# On the Mac mini, fetch that branch from the same writable remote.
git remote add migration <writable-remote-url>
git fetch migration mac-mini-migration-source
git checkout mac-mini-migration-source

# Option 2: create a bundle on the MBP and copy it to the Mac mini.
git bundle create /tmp/rudder-mac-mini-source.bundle HEAD
scp /tmp/rudder-mac-mini-source.bundle \
  "<mac-mini-user>@<mac-mini-host>:/tmp/rudder-mac-mini-source.bundle"

# On the Mac mini, import and check out the bundled commit.
git fetch /tmp/rudder-mac-mini-source.bundle HEAD:refs/heads/mac-mini-migration-source
git checkout mac-mini-migration-source
```

Do not use root `pnpm build` as the Mac mini preparation command for this first
migration. The root build includes Desktop packaging and can require production
embedded-PostgreSQL payload variables that are irrelevant to the Mac mini server
service.

Install and verify every local runtime Rudder agents should use on the Mac mini:

```sh
which codex || true
which claude || true
which hermes || true
which opencode || true
git config --global user.name
git config --global user.email
```

For Hermes specifically, use an absolute command path in agent config. A prior
Mac mini validation found `/Users/jonathancha/.local/bin/hermes`, provider
`openai-codex`, and model `gpt-5.5`; re-check before relying on those values.

### Phase 2: Configure Authenticated Private Server

Use a dedicated Mac mini Rudder home. For native install:

```sh
export RUDDER_HOME="$HOME/.rudder"
export RUDDER_INSTANCE_ID="default"
export RUDDER_DEPLOYMENT_MODE="authenticated"
export RUDDER_DEPLOYMENT_EXPOSURE="private"
export HOST="0.0.0.0"
export PORT="3100"
export RUDDER_PUBLIC_URL="http://<mac-mini-tailnet-name>:3100"
export RUDDER_ALLOWED_HOSTNAMES="<mac-mini-tailnet-name>,<mac-mini-lan-name>"
export RUDDER_UI_DEV_MIDDLEWARE="false"
```

Persist auth secret material before first start. Do not rely on a one-shell
`BETTER_AUTH_SECRET` export that would disappear when `launchd` starts the
service later.

```sh
mkdir -p "$RUDDER_HOME/instances/$RUDDER_INSTANCE_ID"
touch "$RUDDER_HOME/instances/$RUDDER_INSTANCE_ID/.env"
chmod 600 "$RUDDER_HOME/instances/$RUDDER_INSTANCE_ID/.env"
if ! grep -q '^BETTER_AUTH_SECRET=' "$RUDDER_HOME/instances/$RUDDER_INSTANCE_ID/.env"; then
  printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> \
    "$RUDDER_HOME/instances/$RUDDER_INSTANCE_ID/.env"
fi
```

Then initialize config. Prefer interactive onboarding here so config is saved
before the foreground server starts:

```sh
pnpm rudder onboard
```

When prompted `Start Rudder now?`, answer `No`; then run:

```sh
pnpm rudder doctor
pnpm rudder run
```

If using `pnpm rudder onboard --yes`, treat it as an alternate foreground-start
path: it accepts defaults and starts Rudder immediately. In that case, leave it
running and use a second shell for `doctor`, health checks, and
`auth bootstrap-ceo`.

Expected checks:

```sh
curl -sS http://127.0.0.1:3100/api/health
curl -sS -H 'Host: <mac-mini-tailnet-name>' http://127.0.0.1:3100/api/health
```

The first response should report `deploymentMode: "authenticated"` and
`deploymentExposure: "private"`.

### Phase 3: Choose And Move State

There are two viable migration paths.

#### Option A: Fresh Mac Mini Instance, Recreate Agents/Projects

Use this when the MBP data is disposable or stale.

1. Create the organization in the Mac mini browser UI.
2. Recreate required agents with Mac mini runtime configs.
3. Recreate or import important projects/issues manually.
4. Stop using the MBP Desktop instance for new work.

This is least risky and fastest if the current local data is not authoritative.

#### Option B: Copy MBP Instance State To Mac Mini

Use this only after stopping MBP Rudder cleanly and confirming the Mac mini
target is not running.

On the MBP:

```sh
# Quit Rudder.app first.
```

On the Mac mini, stop any existing service and back up any existing target
instance before copying data:

```sh
launchctl bootout "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/com.local.rudder.server.plist" 2>/dev/null || true

mkdir -p "$HOME/.rudder/backups" "$HOME/.rudder/instances"
if [ -d "$HOME/.rudder/instances/default" ]; then
  tar -C "$HOME/.rudder/instances" -czf \
    "$HOME/.rudder/backups/pre-migration-default-$(date +%Y%m%d-%H%M%S).tgz" \
    default
fi
rm -rf "$HOME/.rudder/instances/default.incoming"
mkdir -p "$HOME/.rudder/instances/default.incoming"
```

On the MBP, dry-run and then copy into the staging directory, not directly over
the live target:

```sh
rsync -a --dry-run --itemize-changes "$HOME/.rudder/instances/default/" \
  "<mac-mini-user>@<mac-mini-host>:/Users/<mac-mini-user>/.rudder/instances/default.incoming/"

rsync -a "$HOME/.rudder/instances/default/" \
  "<mac-mini-user>@<mac-mini-host>:/Users/<mac-mini-user>/.rudder/instances/default.incoming/"
```

On the Mac mini, promote the staged copy and remove stale runtime ownership
metadata copied from the MBP:

```sh
if [ -d "$HOME/.rudder/instances/default" ]; then
  mv "$HOME/.rudder/instances/default" \
    "$HOME/.rudder/instances/default.replaced-$(date +%Y%m%d-%H%M%S)"
fi
mv "$HOME/.rudder/instances/default.incoming" "$HOME/.rudder/instances/default"
rm -f "$HOME/.rudder/instances/default/runtime/server.json"
```

On the Mac mini, edit the copied config to authenticated/private before first
start. This is a patch-only fragment; preserve the existing `$meta`, `database`,
`logging`, `storage`, and `secrets` sections in `config.json`:

```jsonc
{
  // keep the existing top-level sections not shown here
  "server": {
    "deploymentMode": "authenticated",
    "exposure": "private",
    "host": "0.0.0.0",
    "port": 3100,
    "allowedHostnames": ["<mac-mini-tailnet-name>", "<mac-mini-lan-name>"],
    "serveUi": true
  },
  "auth": {
    "baseUrlMode": "explicit",
    "publicBaseUrl": "http://<mac-mini-tailnet-name>:3100",
    "disableSignUp": false
  }
}
```

Also ensure the Mac mini instance `.env` contains one durable auth secret:

```sh
touch "$HOME/.rudder/instances/default/.env"
chmod 600 "$HOME/.rudder/instances/default/.env"
if ! grep -q '^BETTER_AUTH_SECRET=' "$HOME/.rudder/instances/default/.env"; then
  printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> \
    "$HOME/.rudder/instances/default/.env"
fi
```

Then start the Mac mini server and follow the board claim flow if Rudder reports
that the migrated instance still has only the local board admin.

### Phase 4: Claim Or Bootstrap Board Access

If the instance was migrated from `local_trusted`, startup may print a board
claim URL. Open that URL from the MBP browser after replacing the host with the
Mac mini Tailscale/LAN hostname if needed.

If this is a fresh authenticated instance, create or accept the bootstrap CEO
invite:

```sh
pnpm rudder auth bootstrap-ceo --base-url "$RUDDER_PUBLIC_URL"
```

Then open the printed invite URL from the MBP browser and confirm:

```sh
curl -sS "$RUDDER_PUBLIC_URL/api/health"
```

### Phase 5: Convert Runtime Configs To Mac Mini Reality

For each agent:

1. Open the Agent settings in the Mac mini-hosted UI.
2. Verify runtime type and config.
3. Replace MBP-specific paths with Mac mini paths.
4. Prefer absolute command paths for non-login-shell commands.
5. Keep provider secrets in the runtime's native credential store where possible.
6. Run the adapter environment check from the UI or create one low-risk test
   issue per runtime.

Hermes example:

```json
{
  "hermesCommand": "/Users/jonathancha/.local/bin/hermes",
  "provider": "openai-codex",
  "model": "gpt-5.5",
  "toolsets": "terminal,file,web",
  "persistSession": true,
  "checkpoints": true,
  "cwd": "/Users/jonathancha/projects/rudder-workspaces/default"
}
```

Set `model` explicitly. The Hermes adapter default is
`anthropic/claude-sonnet-4`, which may not match the Mac mini Hermes CLI config.

### Phase 6: Run As A 24/7 Service

Use `launchd` on macOS. Create a user LaunchAgent that sets the environment
above and runs `pnpm rudder run` from the chosen Rudder checkout. Keep logs under
`~/.rudder/instances/default/logs` or `~/Library/Logs/Rudder`.

Create the log directory before loading the agent:

```sh
mkdir -p "$HOME/Library/Logs/Rudder"
```

Minimal shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.local.rudder.server</string>
  <key>WorkingDirectory</key>
  <string>/Users/<mac-mini-user>/projects/rudder</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/pnpm</string>
    <string>rudder</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RUDDER_HOME</key>
    <string>/Users/<mac-mini-user>/.rudder</string>
    <key>RUDDER_INSTANCE_ID</key>
    <string>default</string>
    <key>RUDDER_DEPLOYMENT_MODE</key>
    <string>authenticated</string>
    <key>RUDDER_DEPLOYMENT_EXPOSURE</key>
    <string>private</string>
    <key>HOST</key>
    <string>0.0.0.0</string>
    <key>PORT</key>
    <string>3100</string>
    <key>RUDDER_PUBLIC_URL</key>
    <string>http://<mac-mini-tailnet-name>:3100</string>
    <key>RUDDER_ALLOWED_HOSTNAMES</key>
    <string>&lt;mac-mini-tailnet-name&gt;,&lt;mac-mini-lan-name&gt;</string>
    <key>RUDDER_UI_DEV_MIDDLEWARE</key>
    <string>false</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/<mac-mini-user>/Library/Logs/Rudder/server.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/<mac-mini-user>/Library/Logs/Rudder/server.err.log</string>
</dict>
</plist>
```

Store `BETTER_AUTH_SECRET` in the instance `.env` rather than hardcoding it in
the plist.

### Phase 7: MBP Client Cutover

On the MBP:

1. Open `RUDDER_PUBLIC_URL` in a browser.
2. Sign in and verify the board, issue list, agent list, run detail, and
   workspace/library views.
3. Update MBP CLI context only if you need CLI control from the laptop:

```sh
pnpm rudder context set --api-base "http://<mac-mini-tailnet-name>:3100" \
  --org-id "<org-id>"
pnpm rudder context show
```

4. Stop treating MBP Desktop as the canonical Rudder runtime. Keep it only for
   local dev or local fallback.

## Verification Checklist

Run these before declaring migration complete:

- `curl -sS "$RUDDER_PUBLIC_URL/api/health"` from MBP returns
  `authenticated/private`.
- Browser login from MBP succeeds.
- `GET /api/auth/get-session` succeeds in the browser session.
- Existing organization, issues, runs, and workspace files are visible.
- Creating a new issue from MBP persists after Mac mini service restart.
- A low-risk agent run starts on the Mac mini and leaves run evidence.
- Runtime command paths resolve under launchd, not only in an interactive shell.
- `RUDDER_ALLOWED_HOSTNAMES` includes all real hostnames used by MBP browser
  access.
- Mac mini restart or `launchctl kickstart` brings Rudder back without manual
  terminal attachment.
- MBP sleep/closed-lid state does not interrupt Mac mini agent work.

## Risks And Mitigations

| Risk | Why It Matters | Mitigation |
| --- | --- | --- |
| Desktop mistaken for remote frontend | Current Desktop scope forbids remote-instance mode | Use browser UI only for Mac mini service |
| Hostname 403 in authenticated/private | Private hostname guard blocks unknown Host headers | Set `RUDDER_PUBLIC_URL` and `RUDDER_ALLOWED_HOSTNAMES`; test with real browser hostname |
| Auth lockout after local-trusted migration | Migrated DB may only have `local-board` admin | Use board claim URL or bootstrap CEO invite |
| LaunchAgent PATH differs from shell | Agent CLIs may not resolve under launchd | Use absolute command paths and log `which` checks |
| Secrets copied or printed during migration | `.env`, DB, and secret key material are sensitive | Copy state only over trusted channel; never paste values into docs/logs |
| Split-brain workspaces | MBP and Mac mini both run against copied data | Stop MBP Desktop before state copy; pick Mac mini as single writer |
| Docker hides host CLI auth | Container does not automatically share host Codex/Claude/Hermes auth | Keep Docker out of first migration; revisit only with an explicit credential strategy |
| Full repo build fails without Desktop packaging prerequisites | Root `pnpm build` includes Desktop packaging and production PostgreSQL payload checks | Build static UI with `node scripts/prepare-server-ui-dist.mjs` for this native service |
| Branch drift | Current MBP branch and `origin/main` diverged | choose one code line and record commit before migration |

## Non-Goals

- Do not add Desktop remote-instance support in this migration.
- Do not expose Rudder to the public internet without a separate hardening pass.
- Do not use Docker for the first migration.
- Do not move to external PostgreSQL for the first migration.
- Do not introduce Kubernetes, multi-node DB, or cloud object storage for the
  first Mac mini deployment.
- Do not keep MBP and Mac mini as simultaneous writers to the same copied
  instance.
- Do not edit `doc/product/**` for this operator migration unless a later user
  decision changes the product contract.

## Recommended Execution Order For Ultrawork

Use three bounded lanes, then converge:

1. Mac mini host lane:
   - checkout chosen commit
   - install dependencies
   - verify Node, pnpm, Git identity, Codex, Claude, Hermes, and other runtime
     CLIs
   - create LaunchAgent skeleton but do not enable until config is ready
2. Rudder instance lane:
   - decide fresh vs copied state
   - configure `authenticated/private`
   - start server manually
   - complete bootstrap/claim flow
   - verify health from Mac mini and MBP
3. Agent/runtime lane:
   - inventory current MBP agents
   - translate runtime configs to Mac mini paths
   - run one low-risk issue per runtime
   - record failures and fix command/path/auth gaps

Convergence gate:

- Mac mini service survives restart.
- MBP browser can complete a full create issue -> run agent -> inspect evidence
  loop.
- MBP Desktop is no longer needed for persistent Rudder work.

## Open Questions Before Execution

1. Which code line should the Mac mini run: current MBP branch, `origin/main`, or
   release tag `v0.4.0`?
2. Is the current MBP `~/.rudder/instances/default` data authoritative enough to
   copy, or should the Mac mini start fresh?
3. What is the canonical Mac mini browser URL: Tailscale MagicDNS, LAN hostname,
   or a local reverse proxy hostname?
4. Which agent runtimes are required on day one: Codex, Claude, Hermes,
   OpenCode, Gemini, Cursor, Pi, or only a subset?

## Evidence References

- Public GitHub reference:
  `https://github.com/Undertone0809/rudder` at
  `origin/main` commit `36642afa89c12b58eca60bff74269f5057778ce1`.
- Local research checkout:
  `88843f47cea263f8f398e6d030a0a75a7dba1a10`.
- Current MBP runtime descriptor:
  `~/.rudder/instances/default/runtime/server.json`, redacted during review.
- Relevant implementation and docs are listed in frontmatter `related_code`.
