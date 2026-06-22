# Rudder Mac Mini Agent Plugin

Rudder worker plugin that exposes Jonathan's Mac mini tailnet gateway as agent
tools. It registers tools for:

- gateway health and capabilities;
- generic policy-gated job starts;
- long-running local Codex CLI agent jobs;
- Obsidian Ask KB and writer-host intake/sync templates through the generic job tool;
- GBrain query jobs;
- Mac gateway artifact uploads for transcript-sized payloads;
- long-horizon Hermes project jobs through the Mac-side `hermes_project` template;
- Hermes gateway restart jobs;
- job status and cancellation.

The plugin uses a Rudder `secret-ref` for the gateway bearer token. Do not store
the token in this package.

## Gateway Contract

Every async start tool accepts `requestId`. Rudder agents and bundled helper
skills should pass a deterministic id derived from run id, agent id, alias, and
payload hash, then retry only with the same id and identical payload. A gateway
idempotency conflict is terminal for the retry path and should be reported to
the user instead of starting a second job.

Terminal jobs expose the Mac gateway result contract through both waited starts
and `mac_mini_job_status`:

- `data.terminalResult`: the gateway `/v1/jobs/{job_id}/result` object when
  available.
- `data.nextAction`: one of `continue_polling`, `finish_successfully`,
  `report_failure`, `acknowledge_cancelled`, or `report_rejected`.
- `data.resultReady`: whether the terminal result is ready.

Agents should finish only on `finish_successfully`, keep polling on
`continue_polling`, and report failure/cancel/rejection states directly with the
returned evidence. The result artifact is Mac-local; the Rudder laptop should
not wait for a local result file.

Large prompts are guarded in two places. The worker uploads oversized prompt
bodies to `/v1/uploads` before job start when possible, and the bundled
`mac-mini-agent-tools` skill uploads large source fields before invoking the
plugin. Transcript semantics must not be truncated or summarized to satisfy the
inline JSON limit.

## Build Inside A Rudder Checkout

Copy this directory into a Rudder checkout, for example:

```bash
mkdir -p packages/plugins/local
cp -R /path/to/rudder-mac-mini-agent-plugin packages/plugins/local/rudder-mac-mini-agent-plugin
pnpm install
pnpm --dir packages/plugins/local/rudder-mac-mini-agent-plugin build
pnpm --dir packages/plugins/local/rudder-mac-mini-agent-plugin test
```

Install after the build:

```bash
RUDDER_API_URL="${RUDDER_API_URL:-http://127.0.0.1:3200}"

curl -X POST "$RUDDER_API_URL/api/plugins/install" \
  -H "Content-Type: application/json" \
  -d '{"packageName":"'$(pwd)'/packages/plugins/local/rudder-mac-mini-agent-plugin","isLocalPath":true}'
```

Use the Rudder API port that is actually serving this checkout or desktop app.
Source checkouts commonly use `3100`; the desktop app commonly uses `3200`.

Then open Rudder plugin settings and set:

- `gatewayUrl`: `https://jonathans-mac-mini.tail5046d1.ts.net/mac-mini-agent`
- `gatewayTokenSecretRef`: the Rudder secret containing the Mac mini gateway token

The Mac mini token is printed locally on the Mac mini with:

```bash
/Users/jonathancha/.agents/plugins/mac-mini-agent-server/bin/mac-mini-agent-server show-token
```
