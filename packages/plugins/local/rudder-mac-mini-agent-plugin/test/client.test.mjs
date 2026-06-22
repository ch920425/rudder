import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchJobEvents,
  fetchJobResult,
  gatewayRequest,
  isTerminalStatus,
  joinGatewayPath,
  nextActionForJob,
  parseSseEvents,
  summarizeTerminalResult,
} from "../dist/client.js";
import manifest from "../dist/manifest.js";
import {
  clearGatewayTokenCache,
  resolveGatewayToken,
} from "../dist/token-cache.js";

test("joinGatewayPath normalizes base and suffix", () => {
  assert.equal(joinGatewayPath("https://host/mac-mini-agent/", "/health"), "https://host/mac-mini-agent/health");
  assert.equal(joinGatewayPath("https://host/mac-mini-agent", "health"), "https://host/mac-mini-agent/health");
});

test("parseSseEvents extracts JSON data blocks", () => {
  const events = parseSseEvents([
    "id: 1",
    "event: stdout",
    "data: {\"seq\":1,\"ts\":\"now\",\"type\":\"stdout\",\"data\":{\"text\":\"hello\"}}",
    "",
    "id: 2",
    "event: finished",
    "data: {\"seq\":2,\"ts\":\"now\",\"type\":\"finished\",\"data\":{\"status\":\"succeeded\"}}",
    "",
  ].join("\n"));
  assert.equal(events.length, 2);
  assert.equal(events[0].data.text, "hello");
  assert.equal(events[1].type, "finished");
});

test("gatewayRequest sends bearer token and parses json", async () => {
  const seen = {};
  const result = await gatewayRequest({
    gatewayUrl: "https://host/mac-mini-agent",
    token: "secret",
    fetchImpl: async (url, init) => {
      seen.url = url;
      seen.authorization = init.headers.Authorization;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  }, "/health");
  assert.deepEqual(result, { ok: true });
  assert.equal(seen.url, "https://host/mac-mini-agent/health");
  assert.equal(seen.authorization, "Bearer secret");
});

test("gatewayRequest surfaces structured errors", async () => {
  await assert.rejects(
    () => gatewayRequest({
      gatewayUrl: "https://host/mac-mini-agent",
      token: "secret",
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "bad_auth" } }), { status: 403 }),
    }, "/health"),
    /Mac mini gateway 403/,
  );
});

test("fetchJobEvents uses follow=0 and after sequence", async () => {
  const seen = {};
  const events = await fetchJobEvents({
    gatewayUrl: "https://host/mac-mini-agent",
    token: "secret",
    fetchImpl: async (url, init) => {
      seen.url = url;
      seen.authorization = init.headers.Authorization;
      return new Response("id: 3\nevent: stdout\ndata: {\"seq\":3,\"ts\":\"now\",\"type\":\"stdout\",\"data\":{\"text\":\"ok\"}}\n\n", { status: 200 });
    },
  }, "job-1", 2);
  assert.match(seen.url, /follow=0&after=2$/);
  assert.equal(seen.authorization, "Bearer secret");
  assert.equal(events[0].seq, 3);
});

test("fetchJobResult reads the terminal result route", async () => {
  const seen = {};
  const result = await fetchJobResult({
    gatewayUrl: "https://host/mac-mini-agent",
    token: "secret",
    fetchImpl: async (url, init) => {
      seen.url = url;
      seen.authorization = init.headers.Authorization;
      return new Response(JSON.stringify({
        ready: true,
        status: "succeeded",
        next_action: "finish_successfully",
        artifacts: { result_json: "/mac/job/result.json" },
      }), { status: 200 });
    },
  }, "job-1");
  assert.equal(seen.url, "https://host/mac-mini-agent/v1/jobs/job-1/result");
  assert.equal(seen.authorization, "Bearer secret");
  assert.equal(result.ready, true);
  assert.equal(result.next_action, "finish_successfully");
});

test("isTerminalStatus matches gateway terminal states", () => {
  assert.equal(isTerminalStatus("succeeded"), true);
  assert.equal(isTerminalStatus("running"), false);
  assert.equal(isTerminalStatus(undefined), false);
});

test("nextActionForJob maps terminal states when no result is embedded", () => {
  assert.equal(nextActionForJob({ id: "job-1", status: "running" }), "continue_polling");
  assert.equal(nextActionForJob({ id: "job-1", status: "succeeded" }), "finish_successfully");
  assert.equal(nextActionForJob({ id: "job-1", status: "failed" }), "report_failure");
  assert.equal(nextActionForJob({ id: "job-1", status: "cancelled" }), "acknowledge_cancelled");
  assert.equal(nextActionForJob({ id: "job-1", status: "rejected" }), "report_rejected");
});

test("summarizeTerminalResult keeps action, exit code, artifact, and tails", () => {
  const summary = summarizeTerminalResult({
    ready: true,
    status: "failed",
    next_action: "report_failure",
    exit_code: 2,
    stdout_tail: "some stdout",
    stderr_tail: "some stderr",
    artifacts: { result_json: "/mac/job/result.json" },
  });
  assert.match(summary, /next_action=report_failure/);
  assert.match(summary, /exit_code=2/);
  assert.match(summary, /result_json=\/mac\/job\/result\.json/);
  assert.match(summary, /stdout_tail=some stdout/);
  assert.match(summary, /stderr_tail=some stderr/);
});

test("resolveGatewayToken caches secret refs per worker process", async () => {
  clearGatewayTokenCache();
  let calls = 0;
  const resolve = async (secretRef) => {
    calls += 1;
    assert.equal(secretRef, "secret-ref");
    return "resolved-token";
  };

  assert.equal(await resolveGatewayToken({ gatewayTokenSecretRef: "secret-ref" }, resolve), "resolved-token");
  assert.equal(await resolveGatewayToken({ gatewayTokenSecretRef: "secret-ref" }, resolve), "resolved-token");
  assert.equal(calls, 1);
});

test("resolveGatewayToken invalidates cache when secret ref changes", async () => {
  clearGatewayTokenCache();
  const refs = [];
  const resolve = async (secretRef) => {
    refs.push(secretRef);
    return `token:${secretRef}`;
  };

  assert.equal(await resolveGatewayToken({ gatewayTokenSecretRef: "one" }, resolve), "token:one");
  assert.equal(await resolveGatewayToken({ gatewayTokenSecretRef: "two" }, resolve), "token:two");
  assert.deepEqual(refs, ["one", "two"]);
});

test("job-starting tool schemas expose deterministic long polling windows and request ids", () => {
  for (const toolName of [
    "mac_mini_start_job",
    "mac_mini_codex_agent",
    "mac_mini_ask_kb",
    "mac_mini_gbrain_query",
    "mac_mini_hermes_project",
  ]) {
    const tool = manifest.tools.find((candidate) => candidate.name === toolName);
    assert.ok(tool, `missing tool ${toolName}`);
    assert.equal(tool.parametersSchema.properties.followSeconds.maximum, 3600);
    assert.ok(tool.parametersSchema.properties.requestId, `missing requestId for ${toolName}`);
  }
});

test("manifest exposes upload artifact and hermes project tools", () => {
  assert.ok(manifest.tools.find((candidate) => candidate.name === "mac_mini_upload_artifact"));
  const hermes = manifest.tools.find((candidate) => candidate.name === "mac_mini_hermes_project");
  assert.ok(hermes);
  assert.equal(hermes.parametersSchema.properties.timeout_seconds.default, 3600);
  assert.ok(hermes.parametersSchema.properties.commit);
  assert.ok(hermes.parametersSchema.properties.push);
  assert.ok(hermes.parametersSchema.properties.restart_gateway);
});
