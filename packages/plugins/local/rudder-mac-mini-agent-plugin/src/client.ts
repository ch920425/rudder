import { TERMINAL_STATES } from "./constants.js";

export type GatewayEvent = {
  seq: number;
  ts: string;
  type: string;
  data: Record<string, unknown>;
};

export type GatewayJob = {
  id: string;
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
