#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const TOOL_PREFIX = "sj.mac-mini-agent:";

const aliases = new Map([
  ["health", { tool: `${TOOL_PREFIX}mac_mini_health`, params: {} }],
  [
    "answer",
    {
      tool: `${TOOL_PREFIX}mac_mini_codex_agent`,
      kind: "rigor-answer",
      params: {
        workspace: "ch920425",
        wait: false,
        timeout_seconds: 1800,
      },
      poll: true,
      pollSeconds: 1800,
    },
  ],
  [
    "rigor-answer",
    {
      tool: `${TOOL_PREFIX}mac_mini_codex_agent`,
      kind: "rigor-answer",
      params: {
        workspace: "ch920425",
        wait: false,
        timeout_seconds: 1800,
      },
      poll: true,
      pollSeconds: 1800,
    },
  ],
  [
    "intake",
    {
      tool: `${TOOL_PREFIX}mac_mini_codex_agent`,
      kind: "vault-intake",
      params: {
        workspace: "obsidian",
        wait: false,
        timeout_seconds: 3600,
        locks: ["speak-kb-writer"],
      },
      poll: true,
      pollSeconds: 3600,
    },
  ],
  [
    "vault-intake",
    {
      tool: `${TOOL_PREFIX}mac_mini_codex_agent`,
      kind: "vault-intake",
      params: {
        workspace: "obsidian",
        wait: false,
        timeout_seconds: 3600,
        locks: ["speak-kb-writer"],
      },
      poll: true,
      pollSeconds: 3600,
    },
  ],
  ["ask-kb", { tool: `${TOOL_PREFIX}mac_mini_ask_kb`, params: { wait: false }, poll: true }],
  ["gbrain", { tool: `${TOOL_PREFIX}mac_mini_gbrain_query`, params: { wait: false }, poll: true }],
  ["job-status", { tool: `${TOOL_PREFIX}mac_mini_job_status` }],
  ["cancel-job", { tool: `${TOOL_PREFIX}mac_mini_cancel_job` }],
  ["upload-artifact", { tool: `${TOOL_PREFIX}mac_mini_upload_artifact` }],
  ["codex-agent", { tool: `${TOOL_PREFIX}mac_mini_codex_agent`, params: { wait: false }, poll: true }],
  ["start-job", { tool: `${TOOL_PREFIX}mac_mini_start_job`, params: { wait: false }, poll: true }],
  [
    "hermes-project",
    {
      tool: `${TOOL_PREFIX}mac_mini_hermes_project`,
      kind: "hermes-project",
      params: {
        wait: false,
        timeout_seconds: 3600,
      },
      poll: true,
      pollSeconds: 3600,
    },
  ],
  [
    "hermes-status",
    {
      tool: `${TOOL_PREFIX}mac_mini_start_job`,
      params: {
        workspace: "hermes-agent",
        template: "hermes_status",
        wait: false,
      },
      poll: true,
    },
  ],
  ["hermes-restart", { tool: `${TOOL_PREFIX}mac_mini_hermes_gateway_restart` }],
]);

const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled", "rejected"]);
const INLINE_SAFE_BYTES = Number(process.env.MAC_MINI_AGENT_INLINE_SAFE_BYTES ?? "900000");

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) die(`Missing required environment variable: ${name}`);
  return value;
}

async function parseParams(raw) {
  if (!raw) return {};
  if (raw === "-") {
    raw = await new Promise((resolve, reject) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", reject);
    });
  } else if (raw.startsWith("@")) {
    raw = await readFile(raw.slice(1), "utf8");
  }

  rejectShellCommandAsParams(raw);

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      die("Parameters must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    die(`Invalid parameters JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function rejectShellCommandAsParams(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.startsWith("{") || value.startsWith("[")) return;
  if (!/(^['"]?\s*node\s|call-mac-mini-tool\.mjs)/.test(value)) return;

  die([
    "The params argument looks like a shell command, not a JSON object.",
    "Invoke the helper once and pass only params JSON, '-' for stdin, or @file.",
    "For prompt text with apostrophes, use '-' or @file so shell quoting cannot fail before the connector call.",
  ].join(" "));
}

function compactEvent(event) {
  if (!event || typeof event !== "object") return event;
  const out = {};
  for (const key of ["seq", "ts", "stream", "type", "status", "message", "line", "text"]) {
    if (event[key] !== undefined && event[key] !== null && event[key] !== "") out[key] = event[key];
  }
  if (event.data && typeof event.data === "object") {
    for (const key of ["status", "exitCode", "summary", "text", "stdout", "stderr"]) {
      if (event.data[key] !== undefined && event.data[key] !== null && event.data[key] !== "") {
        out[`data.${key}`] = event.data[key];
      }
    }
  }
  return Object.keys(out).length > 0 ? out : event;
}

function collectEventText(events) {
  const parts = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const text = event.data?.text ?? event.text ?? event.line ?? null;
    if (typeof text === "string" && text.trim()) parts.push(text);
  }
  return parts.join("\n");
}

function tailText(text, maxChars = 24000) {
  if (!text) return null;
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deterministicRequestId({ runId, agentId, command, parameters }) {
  const hash = sha256(stableJson(parameters)).slice(0, 32);
  return `${runId}:${agentId}:${command}:${hash}`;
}

function ensureRequestId(command, alias, parameters, { runId, agentId }) {
  if (!alias?.poll) return parameters;
  if (parameters.requestId || parameters.request_id) return parameters;
  return {
    ...parameters,
    requestId: deterministicRequestId({ runId, agentId, command, parameters }),
  };
}

function nextActionFromNormalized(normalized) {
  return normalized?.response?.result?.data?.nextAction
    ?? normalized?.summary?.nextAction
    ?? normalized?.response?.result?.data?.terminalResult?.next_action
    ?? normalized?.response?.result?.data?.job?.result?.next_action
    ?? null;
}

function isContinuePolling(normalized) {
  const nextAction = nextActionFromNormalized(normalized);
  return nextAction === "continue_polling" || (!nextAction && !TERMINAL_STATES.has(String(normalized.summary.jobStatus ?? "")));
}

function largeTextCandidate(command, params) {
  if (!["answer", "rigor-answer", "intake", "vault-intake", "codex-agent", "hermes-project"].includes(command)) return null;
  if (typeof params.content === "string" && Buffer.byteLength(params.content, "utf8") > INLINE_SAFE_BYTES) {
    return { key: "content", value: params.content };
  }
  if (typeof params.text === "string" && Buffer.byteLength(params.text, "utf8") > INLINE_SAFE_BYTES) {
    return { key: "text", value: params.text };
  }
  if (typeof params.prompt === "string" && Buffer.byteLength(params.prompt, "utf8") > INLINE_SAFE_BYTES) {
    return { key: "prompt", value: params.prompt };
  }
  if (typeof params.question === "string" && Buffer.byteLength(params.question, "utf8") > INLINE_SAFE_BYTES) {
    return { key: "question", value: params.question };
  }
  return null;
}

function normalize(tool, response, httpStatus) {
  const result = response?.result;
  const data = result?.data ?? {};
  const events = Array.isArray(data.events) ? data.events : [];
  const eventText = collectEventText(events);
  const error = response?.error ?? result?.error ?? null;
  const ok = httpStatus >= 200 && httpStatus < 300 && !error;
  return {
    ok,
    tool,
    httpStatus,
    content: result?.content ?? null,
    error,
    summary: {
      pluginId: response?.pluginId ?? null,
      toolName: response?.toolName ?? null,
      jobId: data.job?.id ?? data.job?.jobId ?? data.job?.job_id ?? data.jobId ?? null,
      jobStatus: data.job?.status ?? null,
      timedOut: data.timedOut ?? null,
      nextAction: data.nextAction ?? data.terminalResult?.next_action ?? data.job?.result?.next_action ?? null,
      resultReady: data.resultReady ?? data.terminalResult?.ready ?? null,
      lastSeq: data.lastSeq ?? null,
      eventTextChars: eventText.length,
    },
    eventsTail: events.slice(-20).map(compactEvent),
    eventTextTail: tailText(eventText),
    response,
  };
}

function buildRigorAnswerPrompt(input) {
  const question = String(input.question ?? input.prompt ?? "").trim();
  if (!question) die("The answer command requires a JSON object with a question or prompt string.");
  const currentDate = String(input.currentDate ?? new Date().toISOString().slice(0, 10)).trim();
  const sourceFocus = String(input.sourceFocus ?? "Obsidian vault, GBrain, and Hermes-agent context when relevant").trim();
  return [
    "You are running on Jonathan's Mac mini source-of-truth host.",
    "Use the local Mac mini toolchain and local skills under ~/.agents/skills when relevant, especially Obsidian/vault, GBrain, and Hermes-agent workflows.",
    "If a relevant Mac mini skill is not symlinked into ~/.agents/skills, inspect the corresponding ~/.agents/skills-src/<skill-name>/SKILL.md directly before deciding it is unavailable.",
    "Common relevant skill families include gbrain-search, gbrain-query, gbrain-think, obsidian-vault, and any Hermes/Spark-adjacent skills under ~/.agents/skills-src when the question calls for them.",
    "Use the highest-rigor fast local Codex profile available, equivalent in intent to xhigh fast.",
    "",
    `Current date: ${currentDate}.`,
    `Source focus: ${sourceFocus}.`,
    "",
    "Task:",
    question,
    "",
    "Required workflow:",
    "1. Work read-only unless the user explicitly requested mutation.",
    "2. Treat GBrain as discovery and ranking. Treat direct source files, Obsidian vault reads, CLI outputs, and dated source artifacts as authority.",
    "3. For synthesis, current-context, meeting-context, or person-state questions, run more than one evidence pass: broad semantic/KB discovery, targeted direct source reads, then freshness checks for newer dated artifacts or caches.",
    "4. When the prompt uses relative time such as this week, today, latest, or recent, resolve it against the current date above and state any freshness caveat.",
    "5. Prefer concrete dated evidence over generic profile pages. Do not over-weight old results merely because they rank highly.",
    "6. If a tool cannot synthesize but retrieval succeeded, continue from retrieved sources and direct reads instead of stopping.",
    "7. Return the final answer only after cross-checking. Include file paths, slugs, or line references when available, plus confidence and caveats.",
    "",
    "Return format:",
    "- Concise direct answer first.",
    "- Evidence-backed bullets or short sections, separated by entity/topic when useful.",
    "- Source references with concrete dates and paths/slugs/line refs where available.",
    "- Confidence and freshness caveats.",
    "- Very brief trace of tool categories used. Do not dump raw JSON.",
  ].join("\n");
}

function buildVaultIntakePrompt(input) {
  const content = String(input.content ?? input.text ?? "").trim();
  const instructions = String(input.instructions ?? input.question ?? input.prompt ?? "").trim();
  if (!content && !instructions) {
    die("The intake command requires content/text and/or instructions.");
  }
  const currentDate = String(input.currentDate ?? new Date().toISOString().slice(0, 10)).trim();
  const contentType = String(input.contentType ?? "operator-supplied content").trim();
  const sourceLabel = String(input.sourceLabel ?? input.source ?? "Rudder agent supplied intake").trim();
  const sourceDate = String(input.sourceDate ?? "").trim();
  const participants = Array.isArray(input.participants)
    ? input.participants.map((value) => String(value).trim()).filter(Boolean).join(", ")
    : String(input.participants ?? "").trim();
  return [
    "You are running on Jonathan's Mac mini source-of-truth host.",
    "This is an explicitly requested Obsidian/Speak KB intake/update job. The Rudder agent is only transporting the user's source material; you must perform the end-to-end local workflow.",
    "Mutation is allowed only for the supplied content and only within the canonical Obsidian/Speak KB workflow.",
    "Use local Mac mini skills and runbooks, especially ~/.agents/skills/obsidian-vault/SKILL.md and relevant ~/.agents/skills-src references.",
    "Use Mac mini paths and local tools only. Do not use the remote laptop's stale vault, GBrain, or Hermes checkout.",
    "",
    `Current date: ${currentDate}.`,
    `Content type: ${contentType}.`,
    `Source label: ${sourceLabel}.`,
    `Source date: ${sourceDate || "(not supplied)"}.`,
    `Participants/entities: ${participants || "(not supplied)"}.`,
    "",
    "Operator instructions:",
    instructions || "(No extra operator instructions supplied.)",
    "",
    "Verbatim supplied content begins below. Preserve it as source material; do not summarize it before choosing the intake path.",
    "----- BEGIN SUPPLIED CONTENT -----",
    content || "(No separate content field supplied; use the operator instructions as the intake source.)",
    "----- END SUPPLIED CONTENT -----",
    "",
    "Required workflow:",
    "1. Read the relevant Obsidian/vault skill instructions before mutating.",
    "2. Determine the correct local intake path for this content type: meeting transcript, contextual note, correction, artifact, or operational update.",
    "3. Preserve provenance: source label, source date, participants/entities if evident, Rudder as transport, and uncertainty.",
    "4. Update/create only the appropriate canonical vault artifacts. Avoid broad or duplicate writes.",
    "5. Run the local postwrite/intake checks required by the obsidian-vault workflow.",
    "6. Run git status, stage only files intentionally changed by this workflow, and commit normally without bypassing hooks when the workflow produced canonical vault mutations.",
    "7. Use obsidian_writer_closeout for routine writer closeout. Use obsidian_full_maintenance only for weekly/full maintenance or explicit repair. Do not run raw graph materialization or source-wide stale embedding as routine closeout.",
    "8. Update or sync GBrain only through the local runbook/skill path when the Obsidian workflow calls for it. If sync/embed is skipped, state why.",
    "9. If unrelated dirty files, hook failure, conflict, or expected local tool failure blocks closeout, stop cleanly and return the blocker plus the files already touched, if any.",
    "10. Return changed files, commit result, final git status, commands/checks run, validation results, skipped steps with reasons, and follow-ups. Do not dump raw private transcript unless needed for a precise citation.",
    "11. Do not print secrets or tokens. Do not contact external services unless the local intake workflow explicitly requires it and credentials are already configured.",
  ].join("\n");
}

function prepareParameters(command, alias, explicitParams) {
  if (alias?.kind === "vault-intake") {
    const {
      content: _content,
      text: _text,
      instructions: _instructions,
      question: _question,
      prompt: _prompt,
      currentDate: _currentDate,
      contentType: _contentType,
      sourceLabel: _sourceLabel,
      source: _source,
      sourceDate: _sourceDate,
      participants: _participants,
      rawPrompt,
      ...passthrough
    } = explicitParams;

    const prompt = rawPrompt === true
      ? String(_prompt ?? _question ?? _instructions ?? _content ?? _text ?? "").trim()
      : buildVaultIntakePrompt({
        content: _content,
        text: _text,
        instructions: _instructions,
        question: _question,
        prompt: _prompt,
        currentDate: _currentDate,
        contentType: _contentType,
        sourceLabel: _sourceLabel,
        source: _source,
        sourceDate: _sourceDate,
        participants: _participants,
      });

    if (!prompt) die("The intake command requires a non-empty prompt or supplied content.");

    return {
      ...(alias?.params ?? {}),
      ...passthrough,
      prompt,
      wait: false,
    };
  }

  if (alias?.kind !== "rigor-answer") return { ...(alias?.params ?? {}), ...explicitParams };

  const {
    question: _question,
    prompt: _prompt,
    currentDate: _currentDate,
    sourceFocus: _sourceFocus,
    rawPrompt,
    ...passthrough
  } = explicitParams;

  const prompt = rawPrompt === true
    ? String(_prompt ?? _question ?? "").trim()
    : buildRigorAnswerPrompt({
      question: _question,
      prompt: _prompt,
      currentDate: _currentDate,
      sourceFocus: _sourceFocus,
    });

  if (!prompt) die("The answer command requires a non-empty question or prompt.");

  return {
    ...(alias?.params ?? {}),
    ...passthrough,
    prompt,
    wait: false,
  };
}

async function prepareLargePayloadUpload({ command, alias, explicitParams, baseRequest }) {
  const candidate = largeTextCandidate(command, explicitParams);
  if (!candidate) return explicitParams;
  const originalRequestId = explicitParams.requestId ?? explicitParams.request_id;
  const generatedRequestId = alias?.poll && !originalRequestId
    ? deterministicRequestId({
      runId: baseRequest.runId,
      agentId: baseRequest.agentId,
      command,
      parameters: explicitParams,
    })
    : null;

  const upload = await executeTool({
    ...baseRequest,
    tool: `${TOOL_PREFIX}mac_mini_upload_artifact`,
    parameters: {
      content: candidate.value,
      description: `Large Rudder ${command} payload uploaded before Mac mini job start`,
      filename: `rudder-${command}-${sha256(candidate.value).slice(0, 12)}.txt`,
      contentType: "text/plain; charset=utf-8",
    },
  });
  if (!upload.ok) {
    die(`Large payload upload failed before starting Mac mini job: ${JSON.stringify(upload.error ?? upload.content ?? upload.summary)}`);
  }
  const artifactPath = upload.response?.result?.data?.artifactPath
    ?? upload.response?.result?.data?.artifact_path
    ?? upload.response?.result?.data?.path;
  if (typeof artifactPath !== "string" || !artifactPath.trim()) {
    die("Large payload upload completed but did not return an artifact path; refusing to start job with truncated content.");
  }

  const next = { ...explicitParams };
  if (generatedRequestId) next.requestId = generatedRequestId;
  delete next[candidate.key];
  const artifactInstruction = [
    `The ${candidate.key} field was too large for inline transport and was uploaded to the Mac mini gateway artifact store.`,
    `Mac-local artifact path: ${artifactPath}`,
    "Use that artifact as the verbatim source of truth. Do not infer from this transport wrapper.",
  ].join("\n");
  if (command === "intake" || command === "vault-intake") {
    next.instructions = [artifactInstruction, explicitParams.instructions].filter(Boolean).join("\n\n");
    next.content = "";
  } else {
    next.prompt = [artifactInstruction, explicitParams.prompt ?? explicitParams.question].filter(Boolean).join("\n\n");
    delete next.question;
  }
  next.uploadedArtifactPath = artifactPath;
  return next;
}

async function executeTool({ apiUrl, apiKey, agentId, orgId, runId, projectId, tool, parameters }) {
  const res = await fetch(`${apiUrl}/api/plugins/tools/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-rudder-agent-id": agentId,
      "x-rudder-run-id": runId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tool,
      parameters,
      runContext: { orgId, agentId, runId, projectId },
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text };
  }
  return normalize(tool, body, res.status);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJobStatusWithRetry(baseRequest, jobId, afterSeq) {
  const maxRetries = Number(process.env.MAC_MINI_AGENT_STATUS_RETRIES ?? "2");
  let lastStatus = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const status = await executeTool({
      ...baseRequest,
      tool: `${TOOL_PREFIX}mac_mini_job_status`,
      parameters: { jobId, afterSeq },
    });
    lastStatus = status;
    const retryable = !status.ok && (status.httpStatus === 408 || status.httpStatus === 429 || status.httpStatus >= 500);
    if (!retryable || attempt === maxRetries) return status;
    const delayMs = Number(process.env.MAC_MINI_AGENT_RETRY_DELAY_MS ?? "500") * (attempt + 1);
    await sleep(Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 500);
  }
  return lastStatus;
}

async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: call-mac-mini-tool.mjs <list|health|answer|intake|ask-kb|gbrain|hermes-status|hermes-project|job-status|full-tool-name> [params-json|-|@file]");
    process.exit(command ? 0 : 1);
  }

  const apiUrl = requiredEnv("RUDDER_API_URL").replace(/\/$/, "");
  const apiKey = requiredEnv("RUDDER_API_KEY");
  const agentId = requiredEnv("RUDDER_AGENT_ID");
  const orgId = requiredEnv("RUDDER_ORG_ID");
  const runId = requiredEnv("RUDDER_RUN_ID");
  const projectId = process.env.RUDDER_PROJECT_ID?.trim()
    || process.env.RUDDER_WORKSPACE_ID?.trim()
    || "agent-run";

  if (command === "list") {
    const res = await fetch(`${apiUrl}/api/plugins/tools`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-rudder-agent-id": agentId,
        "x-rudder-run-id": runId,
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    console.log(JSON.stringify({ ok: res.ok, httpStatus: res.status, tools: body }, null, 2));
    process.exit(res.ok ? 0 : 1);
  }

  const alias = aliases.get(command);
  const tool = alias?.tool ?? (command.includes(":") ? command : `${TOOL_PREFIX}${command}`);
  const baseRequest = { apiUrl, apiKey, agentId, orgId, runId, projectId };
  const explicitParams = await prepareLargePayloadUpload({
    command,
    alias,
    explicitParams: await parseParams(process.argv[3]),
    baseRequest,
  });
  const preparedParameters = prepareParameters(command, alias, explicitParams);
  const parameters = ensureRequestId(command, alias, preparedParameters, { runId, agentId });
  let normalized = await executeTool({
    ...baseRequest,
    tool,
    parameters,
  });

  const startedJobId = normalized.summary.jobId;
  if (alias?.poll === true && normalized.ok && !startedJobId) {
    normalized = {
      ...normalized,
      ok: false,
      error: {
        message: `Expected ${command} to start an async Mac mini job and return a jobId, but no jobId was returned.`,
      },
    };
    console.log(JSON.stringify(normalized, null, 2));
    process.exit(1);
  }

  const pollSeconds = Number(process.env.MAC_MINI_AGENT_POLL_SECONDS ?? alias?.pollSeconds ?? "120");
  const shouldPoll = alias?.poll === true
    && normalized.ok
    && startedJobId
    && !TERMINAL_STATES.has(String(normalized.summary.jobStatus ?? ""))
    && Number.isFinite(pollSeconds)
    && pollSeconds > 0;

  if (shouldPoll) {
    const started = Date.now();
    let afterSeq = Number(normalized.summary.lastSeq ?? 0);
    const pollIntervalMs = Number(process.env.MAC_MINI_AGENT_POLL_INTERVAL_MS ?? "2000");
    while (Date.now() - started < pollSeconds * 1000) {
      await sleep(Number.isFinite(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : 2000);
      const status = await pollJobStatusWithRetry(baseRequest, startedJobId, afterSeq);
      const events = Array.isArray(status.response?.result?.data?.events)
        ? status.response.result.data.events
        : [];
      if (events.length > 0) {
        afterSeq = Math.max(afterSeq, ...events.map((event) => Number(event.seq || 0)));
      }
      normalized = {
        ...status,
        startedJobId,
        polledFrom: startedJobId,
        pollSeconds,
      };
      if (!status.ok || !isContinuePolling(status)) break;
    }
  }

  if (startedJobId && !normalized.startedJobId) {
    normalized = {
      ...normalized,
      startedJobId,
      pollSeconds: alias?.poll === true ? pollSeconds : undefined,
    };
  }

  console.log(JSON.stringify(normalized, null, 2));
  process.exit(normalized.ok ? 0 : 1);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
