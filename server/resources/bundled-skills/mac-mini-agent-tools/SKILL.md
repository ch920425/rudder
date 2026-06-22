---
name: mac-mini-agent-tools
description: Use the Mac Mini Agent Gateway Rudder plugin for GBrain, Obsidian KB/vault, Hermes, and Mac-mini Codex jobs. Trigger when a user asks for gbrain, Obsidian, vault/KB, meeting-context retrieval, Hermes agent/gateway status, or explicitly says the local laptop sources are stale and the Mac mini is the source of truth.
---

# Mac Mini Agent Tools

Use the Rudder plugin API, not native Codex connector discovery, for Mac mini
tools. The plugin tools are exposed at `"$RUDDER_API_URL/api/plugins/tools"` and
execute through the run-scoped `RUDDER_API_KEY`.

Do not use this laptop's local GBrain, Obsidian vault, or Hermes checkout as the
source of truth for requests that mention the Mac mini, remote vault, gbrain,
Obsidian KB, or Hermes agent. If the Mac mini route fails, report that blocker
instead of falling back silently.

## Quick Commands

Prefer the helper script so auth, run context, and result parsing stay stable:

```bash
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" list
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" health
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" answer - <<'JSON'
{"question":"Use Obsidian and GBrain evidence to answer: what is on top of Carl and Connor's mind this week?"}
JSON
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" intake @/path/to/intake-params.json
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" ask-kb - <<'JSON'
{"question":"What meetings do I have this week? Use Mac mini Obsidian KB evidence."}
JSON
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" gbrain - <<'JSON'
{"question":"What meetings do I have this week? Use Mac mini GBrain evidence."}
JSON
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" hermes-status
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" hermes-project - <<'JSON'
{"prompt":"Inspect Hermes health, make the requested source changes, run meaningful tests, commit only if requested, and report the final state."}
JSON
```

Do not pass prompt-like params as single-quoted inline JSON in a shell command.
Questions, transcripts, and instructions often contain apostrophes, which can
make zsh fail before the helper or connector sees the request. Use `-` with a
single-quoted heredoc delimiter or `@file` params for `answer`, `intake`,
`ask-kb`, and `gbrain`.

## Pre-Tool Linter

This skill includes a hook-compatible linter:

```bash
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/lint-mac-mini-tool-call.mjs" --hook
```

The linter reads Codex `PreToolUse` JSON from stdin. It exits `2` with
`{"decision":"deny","reason":"..."}` when a shell command invokes
`call-mac-mini-tool.mjs` with invalid shell syntax or with single-quoted inline
JSON for prompt-like commands. That denial happens before the shell command can
run, so an apostrophe in user text cannot create a failed gateway attempt.

If the runtime hook is unavailable, run the same linter manually before the
gateway call:

```bash
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/lint-mac-mini-tool-call.mjs" --command-stdin <<'EOF'
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" answer @/tmp/mac-mini-answer.json
EOF
```

The helper requires `RUDDER_API_URL`, `RUDDER_API_KEY`, `RUDDER_AGENT_ID`,
`RUDDER_ORG_ID`, and `RUDDER_RUN_ID`. Rudder chat, heartbeat, and Issue runs
inject these for local Codex agents. Job-backed aliases start with `wait:false`,
must return a `jobId`, and poll `job-status` because a single plugin RPC can
time out after about 30 seconds. Every async start must include a deterministic
`requestId` derived from run id, agent id, alias, and payload hash unless the
caller supplied one. Retry a start only with the same `requestId` and identical
payload; if the gateway reports an idempotency conflict, stop and report it.
`answer` polls for up to 30 minutes by default and always preserves
`startedJobId` in the normalized JSON so a long-running Mac mini job can be
resumed or cancelled deterministically. `intake` and `hermes-project` poll for
up to 60 minutes by default. `intake` uses the `speak-kb-writer` lock and must
also return `startedJobId`.

## Tool Choice

- Use `answer` first for high-rigor synthesis: recent context, meeting
  intelligence, "what is on X's mind", cross-source personal/work context,
  Obsidian+GBrain questions, or anything where answer quality matters more than
  a single retrieval hit. This delegates the full read-only task to Mac mini
  Codex, where the local `~/.agents/skills/*`, `~/.agents/skills-src/*`, vault
  paths, GBrain checkout, and Hermes context are available. Symlinked skills in
  `~/.agents/skills` are the normal auto-discovery surface; non-symlinked
  skills in `~/.agents/skills-src` can still be read by path when the delegated
  prompt names or implies that workflow.
- Use `ask-kb` for Obsidian KB/vault retrieval and source-grounded personal or
  project context when a direct KB answer is enough or when you need a quick
  evidence probe.
- Use `intake` only when the user explicitly asks to add, ingest, update,
  write, or sync supplied content such as meeting transcripts into the
  Obsidian/Speak KB/GBrain system. Pass the user's supplied content verbatim in
  `content`; put routing details in `instructions`; include `contentType`,
  `sourceLabel`, `sourceDate`, and `participants` when known. The Rudder
  agent's job is transport and polling only. Mac mini Codex chooses and runs
  the local Obsidian/GBrain intake workflow end-to-end.
- Use `gbrain` for semantic/code/knowledge graph search through Mac mini
  GBrain when you need raw retrieval or discovery.
- Use both `ask-kb` and `gbrain` only as supporting probes if `answer` is
  unavailable, too slow, or the user explicitly asks for raw tool output.
- Use `hermes-status` for read-only Hermes availability checks.
- Use `hermes-project` when the user asks for long-horizon Hermes-agent source
  work, project fixes, tests, commits, pushes, or restarts. This uses the
  Mac-side `hermes_project` template in `/Users/jonathancha/ch920425/hermes-agent`
  and preserves the Mac template guardrails. Pass `commit`, `push`,
  `restart_gateway`, and `target_branch` only when the user asked for those
  outcomes. Never force-push, rewrite history, bypass hooks, or invent a PR
  request from Rudder.
- Use `sj.mac-mini-agent:mac_mini_hermes_gateway_restart` only when the user
  explicitly asks to restart Hermes.

Do not copy Mac mini Obsidian/GBrain/Hermes skills into Rudder and then try to
run them on this laptop. The quality bridge is delegation: Rudder agents
orchestrate, Mac mini Codex performs the local evidence gathering and synthesis,
and Rudder relays the final answer with minimal formatting.

## Result Handling

The helper prints normalized JSON:

- `ok`: true only when the HTTP request and plugin result succeeded.
- `content`: the plugin's short status text.
- `summary.jobStatus`, `summary.jobId`, and `summary.timedOut`: job state for
  Mac mini job-backed tools.
- `summary.nextAction`: terminal-result directive from the Mac gateway. Treat
  `continue_polling`, `finish_successfully`, `report_failure`,
  `acknowledge_cancelled`, and `report_rejected` as the authoritative state
  machine.
- `summary.resultReady`: true when the terminal result contract is available.
- `startedJobId`: immutable id returned by the initial async job-start call.
  Treat missing `startedJobId` for `answer` or `intake` as a hard failure; do
  not continue as if no job exists.
- `eventTextTail`: stdout/stderr text extracted from job events. Prefer this
  over hand-scanning nested event JSON when looking for the final answer.
- `eventsTail`: recent gateway events. For `ask-kb`, `gbrain`, and Hermes jobs,
  inspect these and `result.data.events`; the real answer may be in stdout or
  final job events, while `content` may only say the job completed.
- `response`: the full plugin response for follow-up parsing.

The Mac gateway owns terminal result artifacts. Do not wait for or invent a
result file in the Rudder laptop workspace. If `summary.nextAction` is
`finish_successfully`, relay the Mac result. If it is `continue_polling`, call
`job-status` with `startedJobId`. If it is `report_failure`, surface exit code,
stderr tail, and artifact path when present. If it is `acknowledge_cancelled` or
`report_rejected`, stop and report that state without retrying automatically.

If `ok` is false, report the error and the tool attempted. If a job is still
running after the helper's default poll window, use:

```bash
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" job-status - <<'JSON'
{"jobId":"<job-id>"}
JSON
```

Set `MAC_MINI_AGENT_POLL_SECONDS=0` only when you intentionally want to start a
job and return immediately.

Never print `RUDDER_API_KEY` or gateway tokens.

## Quality Rules

- For high-rigor answers, call `answer` with the user's full question and the
  exact current-date context when the user provided one:

```bash
node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" answer - <<'JSON'
{"currentDate":"2026-06-22","question":"..."}
JSON
```

- Relay the Mac mini Codex answer. Do not replace it with a weaker local
  summary unless the user asks for compression.
- For explicit Obsidian/GBrain writes or transcript intake, call `intake` and
  relay the Mac mini Codex result. Do not summarize or transform the supplied
  transcript before sending it; the Mac mini local workflow owns parsing,
  routing, mutation, postwrite validation, and GBrain sync decisions.
- For any mutating Obsidian/Speak KB workflow, the delegated Mac prompt must
  require: local postwrite gate, `git status`, staging only intentional files,
  normal commit without bypassing hooks, changed-path report, validation
  report, and final git status. If unrelated dirty files, hook failure, or a
  conflict blocks commit, the Mac job must stop and report the blocker.
- Use the Mac gateway template `obsidian_writer_closeout` for routine writer
  closeout. Use `obsidian_full_maintenance` only for weekly/full maintenance or
  explicit repair. Do not call raw graph materialization or source-wide stale
  embedding as routine closeout.
- For large transcripts or source payloads, the helper must upload content
  through `mac_mini_upload_artifact` before starting the job, then pass the
  Mac-local artifact path into the delegated prompt. Never truncate, summarize,
  or split transcript semantics just to fit inline JSON.
- If you must synthesize from raw `ask-kb`/`gbrain`, follow the same discipline:
  GBrain is discovery, direct vault/source files are authority, recent dated
  artifacts beat older profile pages, and freshness caveats are mandatory for
  "today", "this week", "latest", and "recent" questions.
- If Mac mini Codex is still running after the 30-minute poll window, report
  `startedJobId` and poll `job-status` before answering later. If no
  `startedJobId` exists, report a hard connector failure because the job cannot
  be resumed or cancelled safely.
- If `intake` is still running after the 60-minute poll window, report
  `startedJobId`, the fact that the writer lock was requested, and poll
  `job-status` later. Never launch a second intake retry for the same content
  unless the prior `startedJobId` is terminal and the user explicitly asks to
  retry; duplicate transcript ingestion is worse than a slow job.
