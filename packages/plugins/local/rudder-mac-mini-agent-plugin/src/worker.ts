import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type ToolResult,
} from "@rudderhq/plugin-sdk";
import {
  canonicalJobId,
  embeddedTerminalResult,
  fetchJobEvents,
  fetchJobResult,
  gatewayRequest,
  isTerminalStatus,
  nextActionForJob,
  summarizeTerminalResult,
  type GatewayEvent,
  type GatewayJob,
  type GatewayTerminalResult,
} from "./client.js";
import {
  DEFAULT_GATEWAY_URL,
  STREAM_CHANNEL,
  TOOL_NAMES
} from "./constants.js";
import { resolveGatewayToken } from "./token-cache.js";

const INLINE_GATEWAY_BODY_LIMIT_BYTES = 1_000_000;
const INLINE_GATEWAY_SAFE_BODY_BYTES = 900_000;

type PluginConfig = {
  gatewayUrl?: string;
  gatewayTokenSecretRef?: string;
  gatewayToken?: string;
  defaultFollowSeconds?: number;
  maxInlineEvents?: number;
};

type StartJobParams = {
  requestId?: string;
  request_id?: string;
  template?: string;
  workspace?: string;
  cwd?: string;
  argv?: string[];
  params?: Record<string, unknown>;
  mutating?: boolean;
  timeout_seconds?: number;
  description?: string;
  wait?: boolean;
  followSeconds?: number;
};

type UploadArtifactParams = {
  content?: string;
  contentBase64?: string;
  description?: string;
  filename?: string;
  contentType?: string;
  chunkBytes?: number;
};

type GatewayOptions = {
  gatewayUrl: string;
  token: string;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
};

async function getConfig(ctx: PluginContext): Promise<Required<Pick<PluginConfig, "gatewayUrl" | "defaultFollowSeconds" | "maxInlineEvents">> & PluginConfig> {
  const raw = await ctx.config.get() as PluginConfig;
  return {
    gatewayUrl: raw.gatewayUrl || DEFAULT_GATEWAY_URL,
    gatewayTokenSecretRef: raw.gatewayTokenSecretRef || "",
    gatewayToken: raw.gatewayToken || "",
    defaultFollowSeconds: Number(raw.defaultFollowSeconds ?? 120),
    maxInlineEvents: Number(raw.maxInlineEvents ?? 60),
  };
}

async function gatewayOptions(ctx: PluginContext): Promise<GatewayOptions> {
  const config = await getConfig(ctx);
  const token = await resolveGatewayToken(config, (secretRef) => ctx.secrets.resolve(secretRef));
  if (!token) {
    throw new Error("Configure gatewayTokenSecretRef in plugin settings before calling Mac mini tools.");
  }
  return {
    gatewayUrl: config.gatewayUrl,
    token,
    fetchImpl: ctx.http.fetch,
  };
}

function clampFollowSeconds(config: PluginConfig, requested: unknown): number {
  const value = typeof requested === "number" ? requested : Number(config.defaultFollowSeconds ?? 120);
  if (!Number.isFinite(value)) return 120;
  return Math.max(0, Math.min(3600, Math.floor(value)));
}

function inlineEvents(events: GatewayEvent[], maxInlineEvents: number): GatewayEvent[] {
  return events.slice(Math.max(0, events.length - maxInlineEvents));
}

async function streamJobUntilSettled(
  ctx: PluginContext,
  options: GatewayOptions,
  orgId: string,
  jobId: string,
  followSeconds: number,
): Promise<{ job: GatewayJob; events: GatewayEvent[]; lastSeq: number; timedOut: boolean; terminalResult: GatewayTerminalResult | null }> {
  const start = Date.now();
  let lastSeq = 0;
  const events: GatewayEvent[] = [];
  ctx.streams.open(STREAM_CHANNEL, orgId);
  try {
    while (true) {
      const batch = await fetchJobEvents(options, jobId, lastSeq);
      for (const event of batch) {
        lastSeq = Math.max(lastSeq, Number(event.seq || 0));
        events.push(event);
        ctx.streams.emit(STREAM_CHANNEL, { jobId, event });
      }
      const status = await gatewayRequest<{ job: GatewayJob }>(options, `/v1/jobs/${encodeURIComponent(jobId)}`);
      const terminalResult = embeddedTerminalResult(status.job);
      if (isTerminalStatus(status.job.status)) {
        const resolvedResult = terminalResult ?? await fetchJobResult(options, jobId).catch(() => null);
        ctx.streams.emit(STREAM_CHANNEL, { jobId, terminal: true, job: status.job });
        return { job: status.job, events, lastSeq, timedOut: false, terminalResult: resolvedResult };
      }
      if (followSeconds === 0 || Date.now() - start > followSeconds * 1000) {
        return { job: status.job, events, lastSeq, timedOut: true, terminalResult };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    ctx.streams.close(STREAM_CHANNEL);
  }
}

function bytesLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractUploadId(value: unknown): string {
  const record = asRecord(value) ?? {};
  const nested = asRecord(record.upload);
  const candidates = [
    record.uploadId,
    record.upload_id,
    record.id,
    nested?.id,
    nested?.uploadId,
    nested?.upload_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  throw new Error("Mac mini gateway upload response did not include an upload id");
}

function extractArtifactPath(value: unknown): string | null {
  const record = asRecord(value) ?? {};
  const nested = asRecord(record.upload) ?? asRecord(record.artifact);
  const candidates = [
    record.path,
    record.artifactPath,
    record.artifact_path,
    nested?.path,
    nested?.artifactPath,
    nested?.artifact_path,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

async function uploadGatewayArtifact(
  options: GatewayOptions,
  params: UploadArtifactParams,
): Promise<Record<string, unknown>> {
  const hasText = typeof params.content === "string" && params.content.length > 0;
  const hasBase64 = typeof params.contentBase64 === "string" && params.contentBase64.length > 0;
  if (!hasText && !hasBase64) throw new Error("content or contentBase64 is required");
  if (hasText && hasBase64) throw new Error("Provide only one of content or contentBase64");

  const contentBuffer = hasBase64
    ? Buffer.from(params.contentBase64!, "base64")
    : Buffer.from(params.content!, "utf8");
  if (contentBuffer.length === 0) throw new Error("upload content is empty");

  const created = await gatewayRequest(options, "/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      description: params.description,
      filename: params.filename,
      content_type: params.contentType,
      size_bytes: contentBuffer.length,
    }),
  });
  const uploadId = extractUploadId(created);
  const chunkBytes = Math.max(1, Math.min(512_000, Math.floor(Number(params.chunkBytes ?? 512_000))));
  for (let offset = 0, seq = 0; offset < contentBuffer.length; offset += chunkBytes, seq += 1) {
    const chunk = contentBuffer.subarray(offset, offset + chunkBytes);
    await gatewayRequest(options, `/v1/uploads/${encodeURIComponent(uploadId)}/chunks`, {
      method: "POST",
      body: JSON.stringify({
        seq,
        sequence: seq,
        encoding: "base64",
        data: chunk.toString("base64"),
      }),
    });
  }
  const completed = await gatewayRequest<Record<string, unknown>>(options, `/v1/uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: "POST",
    body: JSON.stringify({ size_bytes: contentBuffer.length }),
  });
  return {
    uploadId,
    ...completed,
    artifactPath: extractArtifactPath(completed),
  };
}

async function maybeUploadOversizedJobBody(
  options: GatewayOptions,
  body: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; upload: Record<string, unknown> | null }> {
  const raw = JSON.stringify(body);
  if (bytesLength(raw) <= INLINE_GATEWAY_SAFE_BODY_BYTES) return { body, upload: null };

  const params = asRecord(body.params);
  const prompt = typeof params?.prompt === "string" ? params.prompt : null;
  if (!prompt) {
    if (bytesLength(raw) > INLINE_GATEWAY_BODY_LIMIT_BYTES) {
      throw new Error("Mac mini job payload exceeds inline gateway limit and has no prompt field that can be uploaded safely");
    }
    return { body, upload: null };
  }

  const upload = await uploadGatewayArtifact(options, {
    content: prompt,
    description: "Rudder Mac mini job prompt uploaded because it exceeded inline gateway limits",
    filename: "rudder-job-prompt.txt",
    contentType: "text/plain; charset=utf-8",
  });
  const artifactPath = typeof upload.artifactPath === "string" ? upload.artifactPath : extractArtifactPath(upload);
  if (!artifactPath) throw new Error("Mac mini upload completed without an artifact path");

  return {
    upload,
    body: {
      ...body,
      params: {
        ...params,
        prompt: [
          "The full Rudder-supplied prompt/source material was uploaded through the Mac mini gateway because it exceeded inline request limits.",
          `Read the Mac-local artifact at: ${artifactPath}`,
          "Use that artifact as the authoritative verbatim input. Do not infer from this wrapper alone.",
        ].join("\n"),
        uploaded_prompt_artifact_path: artifactPath,
      },
    },
  };
}

function terminalData(job: GatewayJob, terminalResult: GatewayTerminalResult | null) {
  const nextAction = nextActionForJob(job, terminalResult);
  const resultReady = Boolean(terminalResult?.ready ?? isTerminalStatus(job.status));
  return {
    terminalResult,
    nextAction,
    resultReady,
  };
}

function resultContent(jobId: string, job: GatewayJob, terminalResult: GatewayTerminalResult | null, timedOut = false): string {
  if (timedOut) {
    return `Mac mini job ${jobId} is ${job.status}; next_action=continue_polling. Call mac_mini_job_status with this job id.`;
  }
  const summary = summarizeTerminalResult(terminalResult);
  return summary
    ? `Mac mini job ${jobId} ${job.status}.\n${summary}`
    : `Mac mini job ${jobId} ${job.status}; next_action=${nextActionForJob(job, terminalResult)}.`;
}

async function startGatewayJob(
  ctx: PluginContext,
  runCtx: { orgId: string },
  params: StartJobParams,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const options = await gatewayOptions(ctx);
  const requestId = params.requestId ?? params.request_id;
  const body = {
    requestId,
    request_id: requestId,
    template: params.template,
    workspace: params.workspace,
    cwd: params.cwd,
    argv: params.argv,
    params: params.params,
    mutating: params.mutating,
    timeout_seconds: params.timeout_seconds,
    description: params.description,
  };
  const prepared = await maybeUploadOversizedJobBody(options, body);
  const created = await gatewayRequest<{ job: GatewayJob; events_url: string }>(options, "/v1/jobs", {
    method: "POST",
    body: JSON.stringify(prepared.body),
  });
  const createdJobId = canonicalJobId(created.job);
  if (!createdJobId) throw new Error("Mac mini gateway did not return a job id");
  await ctx.metrics.write("mac_mini_agent.job.started", 1, {
    template: params.template || "custom_argv",
    mutating: String(Boolean(params.mutating)),
  });
  await ctx.activity.log({
    orgId: runCtx.orgId,
    message: `Started Mac mini job ${createdJobId}`,
    metadata: {
      requestId: requestId ?? null,
      template: params.template ?? null,
      workspace: params.workspace ?? created.job.workspace ?? null,
      mutating: created.job.mutating ?? null,
      uploadedPrompt: Boolean(prepared.upload),
    },
  });

  const wait = params.wait !== false;
  if (!wait) {
    return {
      content: `Started Mac mini job ${createdJobId}.`,
      data: {
        job: created.job,
        jobId: createdJobId,
        requestId,
        eventsUrl: created.events_url,
        streamChannel: STREAM_CHANNEL,
        upload: prepared.upload,
        ...terminalData(created.job, embeddedTerminalResult(created.job)),
      },
    };
  }

  const followSeconds = clampFollowSeconds(config, params.followSeconds);
  const result = await streamJobUntilSettled(ctx, options, runCtx.orgId, createdJobId, followSeconds);
  const maxInlineEvents = Math.max(1, Math.min(500, Math.floor(config.maxInlineEvents || 60)));
  const terminal = terminalData(result.job, result.terminalResult);
  return {
    content: resultContent(createdJobId, result.job, result.terminalResult, result.timedOut),
    data: {
      job: result.job,
      jobId: createdJobId,
      requestId,
      events: inlineEvents(result.events, maxInlineEvents),
      lastSeq: result.lastSeq,
      streamChannel: STREAM_CHANNEL,
      timedOut: result.timedOut,
      upload: prepared.upload,
      ...terminal,
    },
  };
}

async function registerTools(ctx: PluginContext): Promise<void> {
  ctx.tools.register(
    TOOL_NAMES.health,
    {
      displayName: "Mac Mini Health",
      description: "Checks gateway health and available templates.",
      parametersSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    async (): Promise<ToolResult> => {
      const options = await gatewayOptions(ctx);
      const health = await gatewayRequest(options, "/health");
      const capabilities = await gatewayRequest(options, "/v1/capabilities");
      return {
        content: "Mac mini gateway is reachable.",
        data: { health, capabilities },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.startJob,
    {
      displayName: "Start Mac Mini Job",
      description: "Starts a policy-gated local gateway job.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      return await startGatewayJob(ctx, runCtx, params as StartJobParams);
    },
  );

  ctx.tools.register(
    TOOL_NAMES.uploadArtifact,
    {
      displayName: "Upload Mac Mini Artifact",
      description: "Uploads large text/base64 content to the Mac mini gateway artifact store for follow-up jobs.",
      parametersSchema: {},
    },
    async (params): Promise<ToolResult> => {
      const options = await gatewayOptions(ctx);
      const result = await uploadGatewayArtifact(options, params as UploadArtifactParams);
      return {
        content: `Uploaded Mac mini artifact ${String(result.uploadId ?? "")}.`,
        data: result,
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.jobStatus,
    {
      displayName: "Mac Mini Job Status",
      description: "Reads gateway job status and events.",
      parametersSchema: {},
    },
    async (params): Promise<ToolResult> => {
      const payload = params as { jobId?: string; afterSeq?: number };
      if (!payload.jobId) return { error: "jobId is required" };
      const options = await gatewayOptions(ctx);
      const status = await gatewayRequest<{ job: GatewayJob }>(options, `/v1/jobs/${encodeURIComponent(payload.jobId)}`);
      const events = await fetchJobEvents(options, payload.jobId, Number(payload.afterSeq || 0));
      const terminalResult = isTerminalStatus(status.job.status)
        ? embeddedTerminalResult(status.job) ?? await fetchJobResult(options, payload.jobId).catch(() => null)
        : embeddedTerminalResult(status.job);
      return {
        content: resultContent(payload.jobId, status.job, terminalResult),
        data: {
          job: status.job,
          events,
          ...terminalData(status.job, terminalResult),
        },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.cancelJob,
    {
      displayName: "Cancel Mac Mini Job",
      description: "Cancels a running gateway job.",
      parametersSchema: {},
    },
    async (params): Promise<ToolResult> => {
      const payload = params as { jobId?: string };
      if (!payload.jobId) return { error: "jobId is required" };
      const options = await gatewayOptions(ctx);
      const result = await gatewayRequest(options, `/v1/jobs/${encodeURIComponent(payload.jobId)}/cancel`, { method: "POST", body: "{}" });
      return {
        content: `Cancel requested for Mac mini job ${payload.jobId}.`,
        data: result,
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.codexAgent,
    {
      displayName: "Start Mac Mini Codex Agent",
      description: "Runs a local Codex CLI agent job on the Mac mini.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { prompt?: string; workspace?: string; cwd?: string; locks?: string[]; timeout_seconds?: number; wait?: boolean; followSeconds?: number; requestId?: string; request_id?: string };
      if (!payload.prompt) return { error: "prompt is required" };
      return await startGatewayJob(ctx, runCtx, {
        requestId: payload.requestId ?? payload.request_id,
        template: "codex_agent",
        params: {
          prompt: payload.prompt,
          workspace: payload.workspace || "ch920425",
          cwd: payload.cwd,
          locks: payload.locks,
        },
        workspace: payload.workspace || "ch920425",
        cwd: payload.cwd,
        timeout_seconds: payload.timeout_seconds,
        wait: payload.wait,
        followSeconds: payload.followSeconds,
        description: "Rudder-requested Codex local agent job",
      });
    },
  );

  ctx.tools.register(
    TOOL_NAMES.askKb,
    {
      displayName: "Ask Mac Mini KB",
      description: "Runs obsidian/scripts/ask_kb.py on the Mac mini.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { question?: string; wait?: boolean; followSeconds?: number; timeout_seconds?: number; requestId?: string; request_id?: string };
      if (!payload.question) return { error: "question is required" };
      return await startGatewayJob(ctx, runCtx, {
        requestId: payload.requestId ?? payload.request_id,
        template: "ask_kb",
        params: { question: payload.question },
        wait: payload.wait,
        followSeconds: payload.followSeconds,
        timeout_seconds: payload.timeout_seconds,
        description: "Rudder ask_kb request",
      });
    },
  );

  ctx.tools.register(
    TOOL_NAMES.gbrainQuery,
    {
      displayName: "Mac Mini GBrain Query",
      description: "Runs gbrain query --json on the Mac mini.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { question?: string; wait?: boolean; followSeconds?: number; timeout_seconds?: number; requestId?: string; request_id?: string };
      if (!payload.question) return { error: "question is required" };
      return await startGatewayJob(ctx, runCtx, {
        requestId: payload.requestId ?? payload.request_id,
        template: "gbrain_query",
        params: { question: payload.question },
        wait: payload.wait,
        followSeconds: payload.followSeconds,
        timeout_seconds: payload.timeout_seconds,
        description: "Rudder gbrain query request",
      });
    },
  );

  ctx.tools.register(
    TOOL_NAMES.hermesProject,
    {
      displayName: "Start Mac Mini Hermes Project",
      description: "Runs long-horizon Hermes project work through the Mac mini hermes_project template.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as {
        prompt?: string;
        commit?: boolean;
        push?: boolean;
        restart_gateway?: boolean;
        target_branch?: string;
        requestId?: string;
        request_id?: string;
        wait?: boolean;
        followSeconds?: number;
        timeout_seconds?: number;
      };
      if (!payload.prompt) return { error: "prompt is required" };
      return await startGatewayJob(ctx, runCtx, {
        requestId: payload.requestId ?? payload.request_id,
        template: "hermes_project",
        params: {
          prompt: payload.prompt,
          commit: payload.commit,
          push: payload.push,
          restart_gateway: payload.restart_gateway,
          target_branch: payload.target_branch,
        },
        timeout_seconds: payload.timeout_seconds ?? 3600,
        wait: payload.wait,
        followSeconds: payload.followSeconds,
        description: "Rudder Hermes project request",
      });
    },
  );

  ctx.tools.register(
    TOOL_NAMES.hermesRestart,
    {
      displayName: "Restart Mac Mini Hermes Gateway",
      description: "Restarts Hermes gateway through the Mac mini gateway.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { wait?: boolean; followSeconds?: number; requestId?: string; request_id?: string };
      return await startGatewayJob(ctx, runCtx, {
        requestId: payload.requestId ?? payload.request_id,
        template: "hermes_gateway_restart",
        wait: payload.wait,
        followSeconds: payload.followSeconds,
        description: "Rudder Hermes gateway restart request",
      });
    },
  );
}

async function registerDataAndActions(ctx: PluginContext): Promise<void> {
  ctx.data.register("health", async () => {
    const options = await gatewayOptions(ctx);
    return await gatewayRequest(options, "/health");
  });

  ctx.data.register("recent-jobs", async () => {
    const options = await gatewayOptions(ctx);
    return await gatewayRequest(options, "/v1/jobs?limit=25");
  });

  ctx.actions.register("start-job", async (params) => {
    return await startGatewayJob(ctx, { orgId: String((params as Record<string, unknown>).orgId || "default") }, params as StartJobParams);
  });

  ctx.actions.register("cancel-job", async (params) => {
    const payload = params as { jobId?: string };
    if (!payload.jobId) throw new Error("jobId is required");
    const options = await gatewayOptions(ctx);
    return await gatewayRequest(options, `/v1/jobs/${encodeURIComponent(payload.jobId)}/cancel`, { method: "POST", body: "{}" });
  });
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    await registerTools(ctx);
    await registerDataAndActions(ctx);
  },

  async onHealth() {
    try {
      if (!currentContext) {
        return { status: "error", message: "Plugin context is not ready" };
      }
      const options = await gatewayOptions(currentContext);
      const health = await gatewayRequest<{ ok: boolean }>(options, "/health");
      return health.ok
        ? { status: "ok", message: "Mac mini gateway reachable" }
        : { status: "degraded", message: "Mac mini gateway health returned not-ok" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "error", message };
    }
  },
});

let currentContext: PluginContext | null = null;

export default plugin;
runWorker(plugin, import.meta.url);
