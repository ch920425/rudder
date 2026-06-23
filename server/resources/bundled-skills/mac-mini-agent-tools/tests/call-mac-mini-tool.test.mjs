import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const helperPath = resolve(__dirname, "../scripts/call-mac-mini-tool.mjs");

function toolResult(toolName, { jobId, status = "succeeded", events = [], content = "ok", data = {} } = {}) {
  return {
    pluginId: "sj.mac-mini-agent",
    toolName,
    result: {
      content,
      data: {
        job: jobId ? { id: jobId, status } : undefined,
        lastSeq: events.at(-1)?.seq ?? 0,
        events,
        ...data,
      },
    },
  };
}

async function withFakeApi(handler, fn) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    await once(req, "end");
    const body = raw ? JSON.parse(raw) : null;
    const record = { method: req.method, url: req.url, body };
    requests.push(record);
    const response = await handler(record, requests.length);
    res.writeHead(response.status ?? 200, {
      "content-type": "application/json",
      "connection": "close",
    });
    res.end(response.raw ?? JSON.stringify(response.body ?? {}));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    return await fn({
      apiUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function runHelper(apiUrl, command, params, extraEnv = {}) {
  return new Promise((resolve) => {
    const args = [helperPath, command];
    if (params !== undefined) args.push(typeof params === "string" ? params : JSON.stringify(params));
    const child = spawn("node", args, {
      encoding: "utf8",
      env: {
        ...process.env,
        RUDDER_API_URL: apiUrl,
        RUDDER_API_KEY: "test-run-token",
        RUDDER_AGENT_ID: "agent-1",
        RUDDER_ORG_ID: "org-1",
        RUDDER_RUN_ID: "run-1",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 15000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function runHelperNoApi(command, params, extraEnv = {}) {
  return new Promise((resolve) => {
    const args = [helperPath, command];
    if (params !== undefined) args.push(typeof params === "string" ? params : JSON.stringify(params));
    const child = spawn("node", args, {
      encoding: "utf8",
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

test("intake starts an obsidian writer job with verbatim content and 60 minute defaults", async () => {
  await withFakeApi(() => ({
    body: toolResult("mac_mini_codex_agent", {
      jobId: "job-intake-1",
      status: "succeeded",
      content: "started",
    }),
  }), async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "intake", {
      contentType: "meeting transcript",
      sourceLabel: "Rudder chat upload",
      sourceDate: "2026-06-22",
      participants: ["Carl", "Connor"],
      content: "VERBATIM TRANSCRIPT BODY",
      instructions: "Intake this and sync GBrain if the local workflow calls for it.",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.startedJobId, "job-intake-1");
    assert.equal(output.pollSeconds, 3600);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.tool, "sj.mac-mini-agent:mac_mini_codex_agent");
    assert.equal(requests[0].body.parameters.workspace, "obsidian");
    assert.equal(requests[0].body.parameters.wait, false);
    assert.equal(requests[0].body.parameters.timeout_seconds, 3600);
    assert.match(requests[0].body.parameters.requestId, /^run-1:agent-1:intake:[a-f0-9]{32}$/);
    assert.deepEqual(requests[0].body.parameters.locks, ["speak-kb-writer"]);
    assert.match(requests[0].body.parameters.prompt, /VERBATIM TRANSCRIPT BODY/);
    assert.match(requests[0].body.parameters.prompt, /----- BEGIN SUPPLIED CONTENT -----/);
    assert.match(requests[0].body.parameters.prompt, /Rudder chat upload/);
    assert.match(requests[0].body.parameters.prompt, /sync GBrain if the local workflow calls for it/);
  });
});

test("answer keeps the 30 minute default and starts a codex-agent job", async () => {
  await withFakeApi(() => ({
    body: toolResult("mac_mini_codex_agent", {
      jobId: "job-answer-1",
      status: "succeeded",
      content: "started",
    }),
  }), async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "answer", {
      currentDate: "2026-06-22",
      question: "What is on Carl and Connor's mind this week?",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.startedJobId, "job-answer-1");
    assert.equal(output.pollSeconds, 1800);
    assert.equal(requests[0].body.parameters.workspace, "ch920425");
    assert.equal(requests[0].body.parameters.timeout_seconds, 1800);
    assert.match(requests[0].body.parameters.requestId, /^run-1:agent-1:answer:[a-f0-9]{32}$/);
    assert.match(requests[0].body.parameters.prompt, /Current date: 2026-06-22/);
  });
});

test("answer preserves caller supplied requestId", async () => {
  await withFakeApi(() => ({
    body: toolResult("mac_mini_codex_agent", {
      jobId: "job-answer-2",
      status: "succeeded",
      content: "started",
    }),
  }), async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "answer", {
      requestId: "manual-request-id",
      question: "Use GBrain.",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(requests[0].body.parameters.requestId, "manual-request-id");
  });
});

test("pollable commands hard-fail when the initial response has no job id", async () => {
  await withFakeApi(() => ({
    body: {
      pluginId: "sj.mac-mini-agent",
      toolName: "mac_mini_codex_agent",
      result: { content: "started", data: {} },
    },
  }), async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "intake", {
      content: "transcript",
      instructions: "intake",
    });

    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.match(output.error.message, /return a jobId/);
    assert.equal(requests.length, 1);
  });
});

test("polling preserves startedJobId and exposes final event text", async () => {
  await withFakeApi((record, count) => {
    if (count === 1) {
      return {
        body: toolResult("mac_mini_codex_agent", {
          jobId: "job-poll-1",
          status: "running",
          content: "started",
        }),
      };
    }
    assert.equal(record.body.tool, "sj.mac-mini-agent:mac_mini_job_status");
    assert.equal(record.body.parameters.jobId, "job-poll-1");
    return {
      body: toolResult("mac_mini_job_status", {
        jobId: "job-poll-1",
        status: "succeeded",
        content: "done",
        events: [{ seq: 1, type: "stdout", data: { text: "FINAL INTAKE RESULT" } }],
        data: {
          nextAction: "finish_successfully",
          resultReady: true,
          terminalResult: {
            ready: true,
            status: "succeeded",
            next_action: "finish_successfully",
            stdout_tail: "FINAL INTAKE RESULT",
            artifacts: { result_json: "/mac/job/result.json" },
          },
        },
      }),
    };
  }, async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "intake", {
      content: "transcript",
      instructions: "intake",
    }, {
      MAC_MINI_AGENT_POLL_SECONDS: "1",
      MAC_MINI_AGENT_POLL_INTERVAL_MS: "10",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.startedJobId, "job-poll-1");
    assert.equal(output.polledFrom, "job-poll-1");
    assert.equal(output.summary.jobStatus, "succeeded");
    assert.equal(output.summary.nextAction, "finish_successfully");
    assert.equal(output.summary.resultReady, true);
    assert.match(output.eventTextTail, /FINAL INTAKE RESULT/);
    assert.equal(requests.length, 2);
  });
});

test("polling stops on terminal nextAction even when status is not marked terminal", async () => {
  await withFakeApi((record, count) => {
    if (count === 1) {
      return {
        body: toolResult("mac_mini_codex_agent", {
          jobId: "job-action-1",
          status: "running",
          content: "started",
        }),
      };
    }
    return {
      body: toolResult("mac_mini_job_status", {
        jobId: "job-action-1",
        status: "running",
        content: "ready",
        data: {
          nextAction: "finish_successfully",
          resultReady: true,
          terminalResult: { ready: true, status: "succeeded", next_action: "finish_successfully" },
        },
      }),
    };
  }, async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "answer", { question: "done?" }, {
      MAC_MINI_AGENT_POLL_SECONDS: "10",
      MAC_MINI_AGENT_POLL_INTERVAL_MS: "10",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.summary.nextAction, "finish_successfully");
    assert.equal(requests.length, 2);
  });
});

test("large intake payload uploads first and starts job with artifact reference", async () => {
  const large = "x".repeat(1500);
  await withFakeApi((record, count) => {
    if (count === 1) {
      assert.equal(record.body.tool, "sj.mac-mini-agent:mac_mini_upload_artifact");
      assert.equal(record.body.parameters.content.length, large.length);
      return {
        body: {
          pluginId: "sj.mac-mini-agent",
          toolName: "mac_mini_upload_artifact",
          result: {
            content: "uploaded",
            data: {
              uploadId: "upload-1",
              artifactPath: "/mac/uploads/upload-1/source.txt",
            },
          },
        },
      };
    }
    assert.equal(record.body.tool, "sj.mac-mini-agent:mac_mini_codex_agent");
    return {
      body: toolResult("mac_mini_codex_agent", {
        jobId: "job-upload-1",
        status: "succeeded",
        content: "started",
      }),
    };
  }, async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "intake", {
      content: large,
      instructions: "intake this",
    }, {
      MAC_MINI_AGENT_INLINE_SAFE_BYTES: "1000",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(requests.length, 2);
    const prompt = requests[1].body.parameters.prompt;
    assert.match(requests[1].body.parameters.requestId, /^run-1:agent-1:intake:[a-f0-9]{32}$/);
    assert.match(prompt, /Mac-local artifact path: \/mac\/uploads\/upload-1\/source.txt/);
    assert.doesNotMatch(prompt, new RegExp(`x{${large.length}}`));
  });
});

test("hermes-project uses first-class tool with one hour defaults and requestId", async () => {
  await withFakeApi(() => ({
    body: toolResult("mac_mini_hermes_project", {
      jobId: "job-hermes-1",
      status: "succeeded",
      content: "started",
    }),
  }), async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "hermes-project", {
      prompt: "Fix Hermes issue.",
      commit: true,
      push: true,
      restart_gateway: true,
      target_branch: "main",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(requests[0].body.tool, "sj.mac-mini-agent:mac_mini_hermes_project");
    assert.equal(requests[0].body.parameters.timeout_seconds, 3600);
    assert.equal(requests[0].body.parameters.wait, false);
    assert.equal(requests[0].body.parameters.commit, true);
    assert.equal(requests[0].body.parameters.push, true);
    assert.equal(requests[0].body.parameters.restart_gateway, true);
    assert.equal(requests[0].body.parameters.target_branch, "main");
    assert.match(requests[0].body.parameters.requestId, /^run-1:agent-1:hermes-project:[a-f0-9]{32}$/);
  });
});

test("job-status polling retries transient status failures without starting a duplicate job", async () => {
  await withFakeApi((record, count) => {
    if (count === 1) {
      return {
        body: toolResult("mac_mini_codex_agent", {
          jobId: "job-retry-1",
          status: "running",
          content: "started",
        }),
      };
    }
    assert.equal(record.body.tool, "sj.mac-mini-agent:mac_mini_job_status");
    assert.equal(record.body.parameters.jobId, "job-retry-1");
    if (count === 2) return { status: 503, body: { error: "temporary gateway failure" } };
    return {
      body: toolResult("mac_mini_job_status", {
        jobId: "job-retry-1",
        status: "succeeded",
        content: "done",
      }),
    };
  }, async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "intake", {
      content: "transcript",
      instructions: "intake",
    }, {
      MAC_MINI_AGENT_POLL_SECONDS: "1",
      MAC_MINI_AGENT_POLL_INTERVAL_MS: "10",
      MAC_MINI_AGENT_RETRY_DELAY_MS: "1",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.startedJobId, "job-retry-1");
    assert.equal(output.summary.jobStatus, "succeeded");
    assert.equal(requests.filter((request) => request.body.tool === "sj.mac-mini-agent:mac_mini_codex_agent").length, 1);
    assert.equal(requests.length, 3);
  });
});

test("list reads the tool discovery endpoint without requiring params", async () => {
  await withFakeApi((record) => {
    assert.equal(record.method, "GET");
    assert.equal(record.url, "/api/plugins/tools");
    return { body: [{ name: "sj.mac-mini-agent:mac_mini_codex_agent" }] };
  }, async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "list", undefined);

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.tools[0].name, "sj.mac-mini-agent:mac_mini_codex_agent");
    assert.equal(requests.length, 1);
  });
});

test("intake rejects empty payloads before calling the API", async () => {
  await withFakeApi(() => {
    throw new Error("API should not be called for empty intake payloads");
  }, async ({ apiUrl, requests }) => {
    const result = await runHelper(apiUrl, "intake", {});

    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("content/text and/or instructions"));
    assert.equal(requests.length, 0);
  });
});

test("invalid parameter JSON fails before calling the API", async () => {
  const result = await runHelperNoApi("intake", "{not-json", {
    RUDDER_API_URL: "http://127.0.0.1:1",
    RUDDER_API_KEY: "x",
    RUDDER_AGENT_ID: "agent-1",
    RUDDER_ORG_ID: "org-1",
    RUDDER_RUN_ID: "run-1",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid parameters JSON/);
});

test("shell command passed as params fails with the quoting-safe guidance", async () => {
  const result = await runHelperNoApi("answer", `node "$CODEX_HOME/skills/mac-mini-agent-tools/scripts/call-mac-mini-tool.mjs" answer '{"question":"SJ's question"}'`, {
    RUDDER_API_URL: "http://127.0.0.1:1",
    RUDDER_API_KEY: "x",
    RUDDER_AGENT_ID: "agent-1",
    RUDDER_ORG_ID: "org-1",
    RUDDER_RUN_ID: "run-1",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /looks like a shell command/);
  assert.match(result.stderr, /use '-' or @file/);
});

test("non-JSON plugin responses are surfaced as errors", async () => {
  await withFakeApi(() => ({
    status: 502,
    raw: "upstream unavailable",
  }), async ({ apiUrl }) => {
    const result = await runHelper(apiUrl, "health", {});

    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.equal(output.error, "upstream unavailable");
  });
});
