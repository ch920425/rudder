import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type ToolResult,
} from "@rudderhq/plugin-sdk";
import {
  DEFAULT_GATEWAY_URL,
  PLUGIN_ID,
  STREAM_CHANNEL,
  TOOL_NAMES,
} from "./constants.js";
import {
  fetchJobEvents,
  gatewayRequest,
  isTerminalStatus,
  type GatewayEvent,
  type GatewayJob,
} from "./client.js";
import { resolveGatewayToken } from "./token-cache.js";

type PluginConfig = {
  gatewayUrl?: string;
  gatewayTokenSecretRef?: string;
  gatewayToken?: string;
  defaultFollowSeconds?: number;
  maxInlineEvents?: number;
};

type StartJobParams = {
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
): Promise<{ job: GatewayJob; events: GatewayEvent[]; lastSeq: number; timedOut: boolean }> {
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
      if (isTerminalStatus(status.job.status)) {
        ctx.streams.emit(STREAM_CHANNEL, { jobId, terminal: true, job: status.job });
        return { job: status.job, events, lastSeq, timedOut: false };
      }
      if (followSeconds === 0 || Date.now() - start > followSeconds * 1000) {
        return { job: status.job, events, lastSeq, timedOut: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    ctx.streams.close(STREAM_CHANNEL);
  }
}

async function startGatewayJob(
  ctx: PluginContext,
  runCtx: { orgId: string },
  params: StartJobParams,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const options = await gatewayOptions(ctx);
  const created = await gatewayRequest<{ job: GatewayJob; events_url: string }>(options, "/v1/jobs", {
    method: "POST",
    body: JSON.stringify({
      template: params.template,
      workspace: params.workspace,
      cwd: params.cwd,
      argv: params.argv,
      params: params.params,
      mutating: params.mutating,
      timeout_seconds: params.timeout_seconds,
      description: params.description,
    }),
  });
  await ctx.metrics.write("mac_mini_agent.job.started", 1, {
    template: params.template || "custom_argv",
    mutating: String(Boolean(params.mutating)),
  });
  await ctx.activity.log({
    orgId: runCtx.orgId,
    message: `Started Mac mini job ${created.job.id}`,
    metadata: {
      template: params.template ?? null,
      workspace: params.workspace ?? created.job.workspace ?? null,
      mutating: created.job.mutating ?? null,
    },
  });

  const wait = params.wait !== false;
  if (!wait) {
    return {
      content: `Started Mac mini job ${created.job.id}.`,
      data: { job: created.job, eventsUrl: created.events_url, streamChannel: STREAM_CHANNEL },
    };
  }

  const followSeconds = clampFollowSeconds(config, params.followSeconds);
  const result = await streamJobUntilSettled(ctx, options, runCtx.orgId, created.job.id, followSeconds);
  const maxInlineEvents = Math.max(1, Math.min(500, Math.floor(config.maxInlineEvents || 60)));
  return {
    content: result.timedOut
      ? `Started Mac mini job ${created.job.id}; still ${result.job.status} after ${followSeconds}s.`
      : `Mac mini job ${created.job.id} ${result.job.status}.`,
    data: {
      job: result.job,
      events: inlineEvents(result.events, maxInlineEvents),
      lastSeq: result.lastSeq,
      streamChannel: STREAM_CHANNEL,
      timedOut: result.timedOut,
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
      return {
        content: `Mac mini job ${payload.jobId} is ${status.job.status}.`,
        data: { job: status.job, events },
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
      const payload = params as { prompt?: string; workspace?: string; cwd?: string; locks?: string[]; timeout_seconds?: number; wait?: boolean; followSeconds?: number };
      if (!payload.prompt) return { error: "prompt is required" };
      return await startGatewayJob(ctx, runCtx, {
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
      const payload = params as { question?: string; wait?: boolean; followSeconds?: number; timeout_seconds?: number };
      if (!payload.question) return { error: "question is required" };
      return await startGatewayJob(ctx, runCtx, {
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
      const payload = params as { question?: string; wait?: boolean; followSeconds?: number; timeout_seconds?: number };
      if (!payload.question) return { error: "question is required" };
      return await startGatewayJob(ctx, runCtx, {
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
    TOOL_NAMES.hermesRestart,
    {
      displayName: "Restart Mac Mini Hermes Gateway",
      description: "Restarts Hermes gateway through the Mac mini gateway.",
      parametersSchema: {},
    },
    async (params, runCtx): Promise<ToolResult> => {
      const payload = params as { wait?: boolean; followSeconds?: number };
      return await startGatewayJob(ctx, runCtx, {
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
