# Rudder Mac Mini Agent Plugin

Rudder worker plugin that exposes Jonathan's Mac mini tailnet gateway as agent
tools. It registers tools for:

- gateway health and capabilities;
- generic policy-gated job starts;
- long-running local Codex CLI agent jobs;
- Obsidian Ask KB and writer-host intake/sync templates through the generic job tool;
- GBrain query jobs;
- Hermes gateway restart jobs;
- job status and cancellation.

The plugin uses a Rudder `secret-ref` for the gateway bearer token. Do not store
the token in this package.

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
