import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { pluginRoutes } from "../routes/plugins.js";
import type { PluginToolDispatcher } from "../services/plugin-tool-dispatcher.js";

const toolName = "sj.mac-mini-agent:mac_mini_health";
const runContext = {
  orgId: "organization-1",
  agentId: "agent-1",
  runId: "run-1",
  projectId: "project-1",
};

function createDispatcher(): PluginToolDispatcher {
  return {
    initialize: vi.fn(),
    teardown: vi.fn(),
    listToolsForAgent: vi.fn(() => [
      {
        name: toolName,
        displayName: "Mac Mini Health",
        description: "Checks gateway health.",
        parametersSchema: { type: "object", additionalProperties: false },
        pluginId: "sj.mac-mini-agent",
      },
    ]),
    getTool: vi.fn((name: string) => (
      name === toolName
        ? {
          pluginId: "sj.mac-mini-agent",
          pluginDbId: "plugin-db-1",
          name: "mac_mini_health",
          namespacedName: toolName,
          displayName: "Mac Mini Health",
          description: "Checks gateway health.",
          parametersSchema: { type: "object", additionalProperties: false },
        }
        : null
    )),
    executeTool: vi.fn(async (name: string, parameters: unknown, ctx: typeof runContext) => ({
      pluginId: "sj.mac-mini-agent",
      toolName: name.split(":").at(-1) ?? name,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              parameters,
              orgId: ctx.orgId,
              agentId: ctx.agentId,
              runId: ctx.runId,
            }),
          },
        ],
      },
    })),
    registerPluginTools: vi.fn(),
    unregisterPluginTools: vi.fn(),
    toolCount: vi.fn(() => 1),
    getRegistry: vi.fn(),
  } as unknown as PluginToolDispatcher;
}

function createApp(actor: Record<string, unknown>, dispatcher = createDispatcher()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use(
    "/api",
    pluginRoutes(
      {} as any,
      {} as any,
      undefined,
      undefined,
      { toolDispatcher: dispatcher },
      undefined,
    ),
  );
  app.use(errorHandler);
  return { app, dispatcher };
}

describe("plugin tool routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows an agent-authenticated run to discover plugin tools", async () => {
    const { app, dispatcher } = createApp({
      type: "agent",
      orgId: "organization-1",
      agentId: "agent-1",
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app).get("/api/plugins/tools");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        name: toolName,
        displayName: "Mac Mini Health",
      }),
    ]);
    expect(dispatcher.listToolsForAgent).toHaveBeenCalledWith(undefined);
  });

  it("allows an agent-authenticated run to execute a plugin tool for its own run context", async () => {
    const { app, dispatcher } = createApp({
      type: "agent",
      orgId: "organization-1",
      agentId: "agent-1",
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app)
      .post("/api/plugins/tools/execute")
      .send({
        tool: toolName,
        parameters: {},
        runContext,
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pluginId: "sj.mac-mini-agent",
      toolName: "mac_mini_health",
      result: {
        content: [
          expect.objectContaining({
            type: "text",
          }),
        ],
      },
    });
    expect(dispatcher.executeTool).toHaveBeenCalledWith(toolName, {}, runContext);
  });

  it("rejects agent plugin execution for another organization", async () => {
    const { app, dispatcher } = createApp({
      type: "agent",
      orgId: "organization-1",
      agentId: "agent-1",
      runId: "run-1",
      source: "agent_key",
    });

    const res = await request(app)
      .post("/api/plugins/tools/execute")
      .send({
        tool: toolName,
        parameters: {},
        runContext: { ...runContext, orgId: "organization-2" },
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Agent key cannot access another organization" });
    expect(dispatcher.executeTool).not.toHaveBeenCalled();
  });

  it("rejects agent plugin execution for another run when the key is run-scoped", async () => {
    const { app, dispatcher } = createApp({
      type: "agent",
      orgId: "organization-1",
      agentId: "agent-1",
      runId: "run-1",
      source: "agent_jwt",
    });

    const res = await request(app)
      .post("/api/plugins/tools/execute")
      .send({
        tool: toolName,
        parameters: {},
        runContext: { ...runContext, runId: "run-2" },
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Agent key cannot execute plugin tools for another run" });
    expect(dispatcher.executeTool).not.toHaveBeenCalled();
  });

  it("preserves board access for plugin tool execution", async () => {
    const { app, dispatcher } = createApp({
      type: "board",
      userId: "local-board",
      orgIds: ["organization-1"],
      isInstanceAdmin: true,
      source: "local_implicit",
    });

    const res = await request(app)
      .post("/api/plugins/tools/execute")
      .send({
        tool: toolName,
        parameters: { probe: true },
        runContext,
      });

    expect(res.status).toBe(200);
    expect(dispatcher.executeTool).toHaveBeenCalledWith(toolName, { probe: true }, runContext);
  });
});
