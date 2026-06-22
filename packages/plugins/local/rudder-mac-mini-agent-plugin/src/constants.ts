export const PLUGIN_ID = "sj.mac-mini-agent";
export const PLUGIN_VERSION = "0.1.0";
export const STREAM_CHANNEL = "mac-mini-agent.jobs";

export const DEFAULT_GATEWAY_URL = "https://jonathans-mac-mini.tail5046d1.ts.net/mac-mini-agent";

export const TOOL_NAMES = {
  health: "mac_mini_health",
  startJob: "mac_mini_start_job",
  jobStatus: "mac_mini_job_status",
  cancelJob: "mac_mini_cancel_job",
  codexAgent: "mac_mini_codex_agent",
  askKb: "mac_mini_ask_kb",
  gbrainQuery: "mac_mini_gbrain_query",
  hermesRestart: "mac_mini_hermes_gateway_restart",
} as const;

export const TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled", "rejected"]);
