import type { PaperclipPluginManifestV1 } from "@rudderhq/plugin-sdk";
import { DEFAULT_GATEWAY_URL, PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./constants.js";

const jobParametersSchema = {
  type: "object",
  properties: {
    template: {
      type: "string",
      description: "Gateway template name, such as codex_agent, gbrain_query, ask_kb, hermes_project, hermes_gateway_restart, obsidian_writer_closeout, or obsidian_full_maintenance.",
    },
    requestId: {
      type: "string",
      description: "Stable idempotency key for async job starts. Reuse only with an identical payload.",
    },
    workspace: {
      type: "string",
      description: "Configured Mac workspace, such as ch920425, obsidian, gbrain, or hermes-agent.",
    },
    cwd: {
      type: "string",
      description: "Optional absolute cwd inside the selected workspace.",
    },
    argv: {
      type: "array",
      items: { type: "string" },
      description: "Optional custom argv array for policy-allowed direct CLI calls.",
    },
    params: {
      type: "object",
      additionalProperties: true,
      description: "Template parameters.",
    },
    mutating: {
      type: "boolean",
      description: "Marks custom argv jobs as write/admin intent.",
    },
    timeout_seconds: {
      type: "number",
      minimum: 1,
      description: "Gateway-side runtime limit.",
    },
    description: {
      type: "string",
    },
    wait: {
      type: "boolean",
      default: true,
      description: "Poll and stream until completion or followSeconds expires.",
    },
    followSeconds: {
      type: "number",
      minimum: 0,
      maximum: 3600,
      default: 120,
    },
  },
  additionalProperties: false,
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Mac Mini Agent Gateway",
  description: "Stream long-running local Obsidian, GBrain, Hermes, and Codex CLI jobs from Jonathan's Mac mini over Tailscale.",
  author: "Jonathan Cha",
  categories: ["connector", "automation"],
  capabilities: [
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
    "activity.log.write",
    "metrics.write",
    "instance.settings.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    required: ["gatewayUrl", "gatewayTokenSecretRef"],
    properties: {
      gatewayUrl: {
        type: "string",
        title: "Gateway URL",
        default: DEFAULT_GATEWAY_URL,
        minLength: 1,
      },
      gatewayTokenSecretRef: {
        type: "string",
        title: "Gateway token secret",
        format: "secret-ref",
        minLength: 1,
      },
      defaultFollowSeconds: {
        type: "number",
        title: "Default follow window",
        default: 120,
        minimum: 0,
        maximum: 3600,
      },
      maxInlineEvents: {
        type: "number",
        title: "Max inline events in tool result",
        default: 60,
        minimum: 1,
        maximum: 500,
      },
      gatewayToken: {
        type: "string",
        title: "Development token fallback",
        description: "Use only for local development if secret refs are unavailable.",
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.health,
      displayName: "Mac Mini Health",
      description: "Checks gateway health and available Mac-side templates.",
      parametersSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: TOOL_NAMES.startJob,
      displayName: "Start Mac Mini Job",
      description: "Starts a policy-gated local gateway job and optionally streams events while waiting.",
      parametersSchema: jobParametersSchema,
    },
    {
      name: TOOL_NAMES.uploadArtifact,
      displayName: "Upload Mac Mini Artifact",
      description: "Uploads large text/base64 payloads to the Mac mini gateway artifact store for follow-up jobs.",
      parametersSchema: {
        type: "object",
        properties: {
          content: { type: "string" },
          contentBase64: { type: "string" },
          description: { type: "string" },
          filename: { type: "string" },
          contentType: { type: "string" },
          chunkBytes: { type: "number", minimum: 1, maximum: 512000, default: 512000 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.jobStatus,
      displayName: "Mac Mini Job Status",
      description: "Reads one gateway job's status and recent events.",
      parametersSchema: {
        type: "object",
        required: ["jobId"],
        properties: {
          jobId: { type: "string" },
          afterSeq: { type: "number", minimum: 0, default: 0 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.cancelJob,
      displayName: "Cancel Mac Mini Job",
      description: "Requests cancellation for a running gateway job.",
      parametersSchema: {
        type: "object",
        required: ["jobId"],
        properties: {
          jobId: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.codexAgent,
      displayName: "Start Mac Mini Codex Agent",
      description: "Starts a long-running local Codex CLI agent job on the Mac mini with local tools and skills.",
      parametersSchema: {
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: { type: "string", minLength: 1 },
          requestId: { type: "string" },
          workspace: { type: "string", default: "ch920425" },
          cwd: { type: "string" },
          locks: { type: "array", items: { type: "string" } },
          timeout_seconds: { type: "number", minimum: 1 },
          wait: { type: "boolean", default: true },
          followSeconds: { type: "number", minimum: 0, maximum: 3600, default: 120 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.askKb,
      displayName: "Ask Mac Mini KB",
      description: "Runs the local Obsidian ask_kb script on the Mac mini.",
      parametersSchema: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string", minLength: 1 },
          requestId: { type: "string" },
          wait: { type: "boolean", default: true },
          followSeconds: { type: "number", minimum: 0, maximum: 3600, default: 120 },
          timeout_seconds: { type: "number", minimum: 1 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.gbrainQuery,
      displayName: "Mac Mini GBrain Query",
      description: "Runs gbrain query --json on the Mac mini writer host.",
      parametersSchema: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string", minLength: 1 },
          requestId: { type: "string" },
          wait: { type: "boolean", default: true },
          followSeconds: { type: "number", minimum: 0, maximum: 3600, default: 120 },
          timeout_seconds: { type: "number", minimum: 1 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.hermesProject,
      displayName: "Start Mac Mini Hermes Project",
      description: "Runs long-horizon Hermes project work through the Mac mini hermes_project template with optional commit/push/restart controls.",
      parametersSchema: {
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: { type: "string", minLength: 1 },
          requestId: { type: "string" },
          commit: { type: "boolean" },
          push: { type: "boolean" },
          restart_gateway: { type: "boolean" },
          target_branch: { type: "string" },
          wait: { type: "boolean", default: true },
          followSeconds: { type: "number", minimum: 0, maximum: 3600, default: 120 },
          timeout_seconds: { type: "number", minimum: 1, default: 3600 },
        },
        additionalProperties: false,
      },
    },
    {
      name: TOOL_NAMES.hermesRestart,
      displayName: "Restart Mac Mini Hermes Gateway",
      description: "Restarts Hermes gateway through the supported local hermes CLI.",
      parametersSchema: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          wait: { type: "boolean", default: true },
          followSeconds: { type: "number", minimum: 0, maximum: 3600, default: 120 },
        },
        additionalProperties: false,
      },
    },
  ],
};

export default manifest;
