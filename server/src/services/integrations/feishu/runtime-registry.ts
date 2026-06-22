import { logger } from "../../../middleware/logger.js";
import type { FeishuIntegrationRuntime } from "./runtime.js";

let runtime: FeishuIntegrationRuntime | null = null;
let enabled = false;

export function isFeishuLongConnectionEnabled(value = process.env.RUDDER_FEISHU_LONG_CONNECTION_ENABLED) {
  const normalized = value?.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "no";
}

export function configureFeishuIntegrationRuntime(input: {
  runtime: FeishuIntegrationRuntime | null;
  enabled: boolean;
}) {
  runtime = input.runtime;
  enabled = input.enabled;
}

export async function refreshFeishuIntegrationRuntime(reason: string) {
  if (!enabled || !runtime) return { enabled, started: 0 };
  const result = await runtime.start();
  if (result.started > 0) {
    logger.info({ started: result.started, reason }, "Feishu long-connection runtime refreshed");
  }
  return { enabled, started: result.started };
}

export async function ensureFeishuIntegrationRuntimeStarted(integrationId: string, reason: string) {
  if (!enabled || !runtime) return { enabled, started: 0, running: false };
  await runtime.stopIntegration(integrationId);
  const result = await runtime.start();
  const running = runtime.isRunning(integrationId);
  if (running) {
    logger.info({ integrationId, started: result.started, reason }, "Feishu long-connection runtime ready");
  }
  return { enabled, started: result.started, running };
}

export async function stopFeishuIntegrationRuntime(integrationId: string, reason: string) {
  if (!runtime) return { enabled, stopped: false };
  const stopped = await runtime.stopIntegration(integrationId);
  if (stopped) {
    logger.info({ integrationId, reason }, "Feishu long-connection runtime stopped");
  }
  return { enabled, stopped };
}
