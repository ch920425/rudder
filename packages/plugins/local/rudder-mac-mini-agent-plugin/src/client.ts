import { TERMINAL_STATES } from "./constants.js";

export type GatewayEvent = {
  seq: number;
  ts: string;
  type: string;
  data: Record<string, unknown>;
};

export type GatewayJob = {
  id: string;
  jobId?: string;
  job_id?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  workspace?: string;
  cwd?: string;
  description?: string;
  mutating?: boolean;
  exit_code?: number | null;
  output_bytes?: number;
  result?: GatewayTerminalResult | null;
};

export type GatewayTerminalNextAction =
  | "continue_polling"
  | "finish_successfully"
  | "report_failure"
  | "acknowledge_cancelled"
  | "report_rejected";

export type GatewayTerminalResult = {
  ready?: boolean;
  status?: string;
  exit_code?: number | null;
  next_action?: GatewayTerminalNextAction | string;
  stdout_tail?: string | null;
  stderr_tail?: string | null;
  artifacts?: Record<string, unknown>;
  error?: unknown;
  [key: string]: unknown;
};

export type GatewayFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type GatewayRequestOptions = {
  gatewayUrl: string;
  token: string;
  fetchImpl: GatewayFetch;
};

export function normalizeGatewayUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("gatewayUrl is required");
  return trimmed.replace(/\/+$/, "");
}

export function joinGatewayPath(gatewayUrl: string, path: string): string {
  const base = normalizeGatewayUrl(gatewayUrl);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function parseSseEvents(text: string): GatewayEvent[] {
  const events: GatewayEvent[] = [];
  for (const block of text.split(/\n\n+/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const dataLines = trimmed
      .split(/\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart());
    if (dataLines.length === 0) continue;
    const parsed = JSON.parse(dataLines.join("\n")) as GatewayEvent;
    events.push(parsed);
  }
  return events;
}

export async function gatewayRequest<T>(
  options: GatewayRequestOptions,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!options.token) throw new Error("Mac mini gateway token is not configured");
  const response = await options.fetchImpl(joinGatewayPath(options.gatewayUrl, path), {
    ...init,
    headers: {
      "Authorization": `Bearer ${options.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const bodyText = await response.text();
  let body: unknown = null;
  if (bodyText.trim()) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }
  }
  if (!response.ok) {
    const message = typeof body === "object" && body && "error" in body
      ? JSON.stringify((body as { error: unknown }).error)
      : bodyText || response.statusText;
    throw new Error(`Mac mini gateway ${response.status}: ${message}`);
  }
  return body as T;
}

export async function fetchJobEvents(
  options: GatewayRequestOptions,
  jobId: string,
  afterSeq = 0,
): Promise<GatewayEvent[]> {
  if (!options.token) throw new Error("Mac mini gateway token is not configured");
  const response = await options.fetchImpl(
    joinGatewayPath(options.gatewayUrl, `/v1/jobs/${encodeURIComponent(jobId)}/events?follow=0&after=${afterSeq}`),
    {
      headers: {
        "Authorization": `Bearer ${options.token}`,
      },
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Mac mini gateway ${response.status}: ${text || response.statusText}`);
  }
  return parseSseEvents(text);
}

export async function fetchJobResult(
  options: GatewayRequestOptions,
  jobId: string,
): Promise<GatewayTerminalResult> {
  return await gatewayRequest<GatewayTerminalResult>(
    options,
    `/v1/jobs/${encodeURIComponent(jobId)}/result`,
  );
}

export function latestTerminalEvent(events: GatewayEvent[]): GatewayEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === "finished") return event;
  }
  return null;
}

export function isTerminalStatus(status: string | undefined): boolean {
  return Boolean(status && TERMINAL_STATES.has(status));
}

export function canonicalJobId(job: GatewayJob | null | undefined): string | null {
  if (!job) return null;
  return job.id || job.jobId || job.job_id || null;
}

export function embeddedTerminalResult(job: GatewayJob | null | undefined): GatewayTerminalResult | null {
  const result = job?.result;
  return result && typeof result === "object" ? result : null;
}

export function nextActionForJob(
  job: GatewayJob | null | undefined,
  result?: GatewayTerminalResult | null,
): GatewayTerminalNextAction | string {
  const terminalResult = result ?? embeddedTerminalResult(job);
  if (terminalResult?.next_action) return terminalResult.next_action;
  const status = job?.status;
  if (!status || !isTerminalStatus(status)) return "continue_polling";
  if (status === "succeeded") return "finish_successfully";
  if (status === "cancelled") return "acknowledge_cancelled";
  if (status === "rejected") return "report_rejected";
  return "report_failure";
}

function conciseTail(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function summarizeTerminalResult(result: GatewayTerminalResult | null | undefined): string {
  if (!result) return "";
  const parts = [
    `next_action=${String(result.next_action ?? "unknown")}`,
    `status=${String(result.status ?? "unknown")}`,
  ];
  if (result.exit_code !== undefined && result.exit_code !== null) {
    parts.push(`exit_code=${String(result.exit_code)}`);
  }
  const artifacts = result.artifacts && typeof result.artifacts === "object" ? result.artifacts : null;
  const resultJson = artifacts?.result_json ?? artifacts?.resultJson;
  if (typeof resultJson === "string" && resultJson.trim()) {
    parts.push(`result_json=${resultJson.trim()}`);
  }
  const discordThreadUrl = result.discord_thread_url
    ?? result.discordThreadUrl
    ?? artifacts?.discord_thread_url
    ?? artifacts?.discordThreadUrl;
  if (typeof discordThreadUrl === "string" && discordThreadUrl.trim()) {
    parts.push(`discord_thread_url=${discordThreadUrl.trim()}`);
  }
  const stdout = conciseTail(result.stdout_tail);
  const stderr = conciseTail(result.stderr_tail);
  if (stdout) parts.push(`stdout_tail=${stdout}`);
  if (stderr) parts.push(`stderr_tail=${stderr}`);
  return parts.join("\n");
}
