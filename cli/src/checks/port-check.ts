import fs from "node:fs";
import path from "node:path";
import type { RudderConfig } from "../config/schema.js";
import { checkPort } from "../utils/net.js";
import type { CheckResult } from "./index.js";

function readActiveRuntimePort(configPath?: string): number | null {
  if (!configPath) return null;
  const runtimePath = path.resolve(path.dirname(configPath), "runtime", "server.json");
  if (!fs.existsSync(runtimePath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const listenPort = typeof record.listenPort === "number" ? record.listenPort : null;
  const pid = typeof record.pid === "number" ? record.pid : null;
  if (!listenPort || !pid) return null;

  try {
    process.kill(pid, 0);
  } catch {
    return null;
  }
  return listenPort;
}

export async function portCheck(config: RudderConfig, configPath?: string): Promise<CheckResult> {
  const port = config.server.port;
  const result = await checkPort(port);

  if (result.available) {
    return {
      name: "Server port",
      status: "pass",
      message: `Port ${port} is available`,
    };
  }

  if (readActiveRuntimePort(configPath) === port) {
    return {
      name: "Server port",
      status: "pass",
      message: `Port ${port} is in use by the active Rudder runtime`,
    };
  }

  return {
    name: "Server port",
    status: "warn",
    message: result.error ?? `Port ${port} is not available`,
    canRepair: false,
    repairHint: `Check what's using port ${port} with: lsof -i :${port}`,
  };
}
