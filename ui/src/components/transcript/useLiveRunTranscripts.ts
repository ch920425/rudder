import type { LiveEvent } from "@rudderhq/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getUIAdapter, type StdoutLineParser, type TranscriptEntry } from "../../agent-runtimes";
import {
  appendRunLogChunkToTranscript,
  createTranscriptLogBuildState,
  flushTranscriptLogBuffer,
  type RunLogChunk,
  type TranscriptBuildOptions,
} from "../../agent-runtimes/transcript";
import { heartbeatsApi, type LiveRunForIssue } from "../../api/heartbeats";
import { instanceSettingsApi } from "../../api/instanceSettings";
import { queryKeys } from "../../lib/queryKeys";
import { heartbeatRunEventTranscriptEntry } from "../../lib/run-detail-events";

const LOG_POLL_INTERVAL_MS = 2000;
const LOG_READ_LIMIT_BYTES = 256_000;
type LiveLogChunk = { type: "log"; chunk: RunLogChunk };
type LiveEntryChunk = { type: "entry"; entry: TranscriptEntry };
type LiveTranscriptChunk = LiveLogChunk | LiveEntryChunk;
type IncomingLiveTranscriptChunk = (LiveLogChunk | LiveEntryChunk) & { dedupeKey: string };

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

interface UseLiveRunTranscriptsOptions {
  runs: LiveRunForIssue[];
  orgId?: string | null;
  maxChunksPerRun?: number;
  includeRunEvents?: boolean;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readResultSummary(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  return readString((value as { summary?: unknown }).summary);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function fallbackTranscriptForRun(run: LiveRunForIssue): TranscriptEntry[] {
  const text = readString(run.stdoutExcerpt) ?? readResultSummary(run.resultJson);
  if (!text) return [];
  return [{
    kind: "assistant",
    ts: run.finishedAt ?? run.startedAt ?? run.createdAt,
    text,
  }];
}

function buildLiveTranscript(
  chunks: LiveTranscriptChunk[],
  parser: StdoutLineParser,
  opts: TranscriptBuildOptions,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const state = createTranscriptLogBuildState();

  for (const chunk of chunks) {
    if (chunk.type === "entry") {
      entries.push(chunk.entry);
      continue;
    }
    appendRunLogChunkToTranscript(entries, state, chunk.chunk, parser, opts);
  }
  flushTranscriptLogBuffer(entries, state, parser, opts);
  return entries;
}

function isTerminalStatus(status: string): boolean {
  return status === "failed" || status === "timed_out" || status === "cancelled" || status === "succeeded";
}

function parsePersistedLogContent(
  runId: string,
  content: string,
  pendingByRun: Map<string, string>,
): IncomingLiveTranscriptChunk[] {
  if (!content) return [];

  const pendingKey = `${runId}:records`;
  const combined = `${pendingByRun.get(pendingKey) ?? ""}${content}`;
  const split = combined.split("\n");
  pendingByRun.set(pendingKey, split.pop() ?? "");

  const parsed: IncomingLiveTranscriptChunk[] = [];
  for (const line of split) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as { ts?: unknown; stream?: unknown; chunk?: unknown };
      const stream = raw.stream === "stderr" || raw.stream === "system" ? raw.stream : "stdout";
      const chunk = typeof raw.chunk === "string" ? raw.chunk : "";
      const ts = typeof raw.ts === "string" ? raw.ts : new Date().toISOString();
      if (!chunk) continue;
      parsed.push({
        type: "log",
        chunk: { ts, stream, chunk },
        dedupeKey: `log:${runId}:${ts}:${stream}:${chunk}`,
      });
    } catch {
      // Ignore malformed log rows.
    }
  }

  return parsed;
}

export function useLiveRunTranscripts({
  runs,
  orgId,
  maxChunksPerRun = 200,
  includeRunEvents = true,
}: UseLiveRunTranscriptsOptions) {
  const [chunksByRun, setChunksByRun] = useState<Map<string, LiveTranscriptChunk[]>>(new Map());
  const seenChunkKeysRef = useRef(new Set<string>());
  const pendingLogRowsByRunRef = useRef(new Map<string, string>());
  const logOffsetByRunRef = useRef(new Map<string, number>());
  const { data: generalSettings } = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });

  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const activeRunIds = useMemo(
    () => new Set(runs.filter((run) => !isTerminalStatus(run.status)).map((run) => run.id)),
    [runs],
  );
  const runIdsKey = useMemo(
    () => runs.map((run) => run.id).sort((a, b) => a.localeCompare(b)).join(","),
    [runs],
  );

  const appendChunks = (runId: string, chunks: IncomingLiveTranscriptChunk[]) => {
    if (chunks.length === 0) return;
    setChunksByRun((prev) => {
      const next = new Map(prev);
      const existing = [...(next.get(runId) ?? [])];
      let changed = false;

      for (const chunk of chunks) {
        if (seenChunkKeysRef.current.has(chunk.dedupeKey)) continue;
        seenChunkKeysRef.current.add(chunk.dedupeKey);
        existing.push(chunk.type === "entry" ? { type: "entry", entry: chunk.entry } : { type: "log", chunk: chunk.chunk });
        changed = true;
      }

      if (!changed) return prev;
      if (seenChunkKeysRef.current.size > 12000) {
        seenChunkKeysRef.current.clear();
      }
      next.set(runId, existing.slice(-maxChunksPerRun));
      return next;
    });
  };

  useEffect(() => {
    const knownRunIds = new Set(runs.map((run) => run.id));
    setChunksByRun((prev) => {
      const next = new Map<string, LiveTranscriptChunk[]>();
      for (const [runId, chunks] of prev) {
        if (knownRunIds.has(runId)) {
          next.set(runId, chunks);
        }
      }
      return next.size === prev.size ? prev : next;
    });

    for (const key of pendingLogRowsByRunRef.current.keys()) {
      const runId = key.replace(/:records$/, "");
      if (!knownRunIds.has(runId)) {
        pendingLogRowsByRunRef.current.delete(key);
      }
    }
    for (const runId of logOffsetByRunRef.current.keys()) {
      if (!knownRunIds.has(runId)) {
        logOffsetByRunRef.current.delete(runId);
      }
    }
  }, [runs]);

  useEffect(() => {
    if (runs.length === 0) return;

    let cancelled = false;

    const readRunLog = async (run: LiveRunForIssue) => {
      const offset = logOffsetByRunRef.current.get(run.id) ?? 0;
      try {
        const result = await heartbeatsApi.log(run.id, offset, LOG_READ_LIMIT_BYTES);
        if (cancelled) return;

        appendChunks(run.id, parsePersistedLogContent(run.id, result.content, pendingLogRowsByRunRef.current));

        if (result.nextOffset !== undefined) {
          logOffsetByRunRef.current.set(run.id, result.nextOffset);
          return;
        }
        if (result.endOffset !== undefined) {
          logOffsetByRunRef.current.set(run.id, result.endOffset);
          return;
        }
        if (result.content.length > 0) {
          logOffsetByRunRef.current.set(run.id, offset + utf8ByteLength(result.content));
        }
      } catch {
        // Ignore log read errors while output is initializing.
      }
    };

    const readAll = async () => {
      await Promise.all(runs.map((run) => readRunLog(run)));
    };

    void readAll();
    const interval = window.setInterval(() => {
      void readAll();
    }, LOG_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runIdsKey, runs]);

  useEffect(() => {
    if (!orgId || activeRunIds.size === 0) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${protocol}://${window.location.host}/api/orgs/${encodeURIComponent(orgId)}/events/ws`;
      socket = new WebSocket(url);

      socket.onmessage = (message) => {
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;

        let event: LiveEvent;
        try {
          event = JSON.parse(raw) as LiveEvent;
        } catch {
          return;
        }

        if (event.orgId !== orgId) return;
        const payload = event.payload ?? {};
        const runId = readString(payload["runId"]);
        if (!runId || !activeRunIds.has(runId)) return;
        if (!runById.has(runId)) return;

        if (event.type === "heartbeat.run.log") {
          if (payload["truncated"] === true) return;
          const chunk = readString(payload["chunk"]);
          if (!chunk) return;
          const ts = readString(payload["ts"]) ?? event.createdAt;
          const stream =
            readString(payload["stream"]) === "stderr"
              ? "stderr"
              : readString(payload["stream"]) === "system"
                ? "system"
                : "stdout";
          appendChunks(runId, [{
            type: "log",
            chunk: {
            ts,
            stream,
            chunk,
            },
            dedupeKey: `log:${runId}:${ts}:${stream}:${chunk}`,
          }]);
          return;
        }

        if (includeRunEvents && event.type === "heartbeat.run.event") {
          const seq = typeof payload["seq"] === "number" ? payload["seq"] : null;
          const eventType = readString(payload["eventType"]) ?? "event";
          const messageText = readString(payload["message"]) ?? eventType;
          const transcriptEntry = heartbeatRunEventTranscriptEntry({
            id: typeof event.id === "number" ? event.id : 0,
            orgId: event.orgId,
            runId,
            agentId: readString(payload["agentId"]) ?? runById.get(runId)?.agentId ?? "",
            seq: seq ?? 0,
            eventType,
            stream: payload["stream"] === "stdout" || payload["stream"] === "stderr" || payload["stream"] === "system"
              ? payload["stream"]
              : null,
            level: payload["level"] === "info" || payload["level"] === "warn" || payload["level"] === "error"
              ? payload["level"]
              : null,
            color: readString(payload["color"]),
            message: readString(payload["message"]),
            payload: readRecord(payload["payload"]),
            createdAt: new Date(event.createdAt),
          });
          if (transcriptEntry) {
            appendChunks(runId, [{
              type: "entry",
              entry: transcriptEntry,
              dedupeKey: `socket:event:${runId}:${seq ?? `${eventType}:${messageText}:${event.createdAt}`}`,
            }]);
            return;
          }
          appendChunks(runId, [{
            type: "log",
            chunk: {
              ts: event.createdAt,
              stream: eventType === "error" ? "stderr" : "system",
              chunk: messageText,
            },
            dedupeKey: `socket:event:${runId}:${seq ?? `${eventType}:${messageText}:${event.createdAt}`}`,
          }]);
          return;
        }

        if (includeRunEvents && event.type === "heartbeat.run.status") {
          const status = readString(payload["status"]) ?? "updated";
          appendChunks(runId, [{
            type: "log",
            chunk: {
              ts: event.createdAt,
              stream: isTerminalStatus(status) && status !== "succeeded" ? "stderr" : "system",
              chunk: `run ${status}`,
            },
            dedupeKey: `socket:status:${runId}:${status}:${readString(payload["finishedAt"]) ?? ""}`,
          }]);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (socket) {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "live_run_transcripts_unmount");
      }
    };
  }, [activeRunIds, includeRunEvents, orgId, runById]);

  const transcriptByRun = useMemo(() => {
    const next = new Map<string, TranscriptEntry[]>();
    const censorUsernameInLogs = generalSettings?.censorUsernameInLogs === true;
    for (const run of runs) {
      const adapter = getUIAdapter(run.agentRuntimeType);
      const chunks = chunksByRun.get(run.id) ?? [];
      next.set(
        run.id,
        chunks.length > 0
          ? buildLiveTranscript(chunks, adapter.parseStdoutLine, { censorUsernameInLogs })
          : fallbackTranscriptForRun(run),
      );
    }
    return next;
  }, [chunksByRun, generalSettings?.censorUsernameInLogs, runs]);

  return {
    transcriptByRun,
    hasOutputForRun(runId: string) {
      const run = runById.get(runId);
      return (chunksByRun.get(runId)?.length ?? 0) > 0 || (run ? fallbackTranscriptForRun(run).length > 0 : false);
    },
  };
}
