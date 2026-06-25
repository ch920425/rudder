import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { test } from "node:test";
import { createTestHarness } from "@rudderhq/plugin-sdk/testing";
import manifest from "../dist/manifest.js";
import plugin from "../dist/worker.js";

async function withFakeGateway(handler, fn) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    await once(req, "end");
    const body = raw ? JSON.parse(raw) : null;
    const record = {
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body,
    };
    requests.push(record);
    const response = await handler(record, requests.length);
    res.writeHead(response.status ?? 200, {
      "content-type": "application/json",
      "connection": "close",
    });
    res.end(JSON.stringify(response.body ?? {}));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    return await fn({
      gatewayUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("hermes project worker forwards Discord relay metadata to the gateway", async () => {
  await withFakeGateway(() => ({
    body: {
      job: {
        id: "job-hermes-1",
        status: "running",
        workspace: "hermes-agent",
      },
      events_url: "/v1/jobs/job-hermes-1/events",
    },
  }), async ({ gatewayUrl, requests }) => {
    const harness = createTestHarness({
      manifest,
      config: {
        gatewayUrl,
        gatewayTokenSecretRef: "gateway-token",
      },
    });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool("mac_mini_hermes_project", {
      prompt: "Mirror this Hermes request.",
      requestId: "req-hermes-1",
      wait: false,
      discordThread: {
        channelName: "general",
        relayMode: "progress_and_final",
        includeStreams: true,
        includeToolCalls: true,
        includeAnswers: true,
        includeFollowUps: true,
      },
    }, {
      orgId: "org-1",
      agentId: "agent-1",
      runId: "run-123456789",
      projectId: "project-1",
    });

    assert.equal(result.data.jobId, "job-hermes-1");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/v1/jobs");
    assert.equal(requests[0].authorization, "Bearer resolved:gateway-token");
    assert.deepEqual(requests[0].body.params.discord_thread, {
      enabled: true,
      provider: "discord",
      relay_mode: "progress_and_final",
      create_thread: true,
      include_streams: true,
      include_tool_calls: true,
      include_answers: true,
      include_follow_ups: true,
      rudder: {
        org_id: "org-1",
        agent_id: "agent-1",
        run_id: "run-123456789",
        project_id: "project-1",
        request_id: "req-hermes-1",
      },
      channel_name: "general",
      thread_name: "Rudder Hermes run-1234",
    });
    assert.deepEqual(harness.activity[0].metadata.discordThread, {
      enabled: true,
      provider: "discord",
      guildId: null,
      channelId: null,
      channelName: "general",
      threadId: null,
      relayMode: "progress_and_final",
      createThread: true,
    });
  });
});
