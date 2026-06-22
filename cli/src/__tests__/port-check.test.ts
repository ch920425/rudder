import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DATABASE_BACKUP_MAX_ESTIMATED_BYTES, type RudderConfig } from "../config/schema.js";
import { portCheck } from "../checks/port-check.js";

const servers: net.Server[] = [];

function listenOnEphemeralPort() {
  return new Promise<{ server: net.Server; port: number }>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected TCP address"));
        return;
      }
      servers.push(server);
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server: net.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function createConfig(port: number): RudderConfig {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rudder-port-check-runtime-"));
  return {
    $meta: {
      version: 1,
      updatedAt: "2026-06-22T00:00:00.000Z",
      source: "doctor",
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: path.join(runtimeRoot, "db"),
      embeddedPostgresPort: 55432,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        maxEstimatedBytes: DEFAULT_DATABASE_BACKUP_MAX_ESTIMATED_BYTES,
        dir: path.join(runtimeRoot, "backups"),
      },
    },
    logging: {
      mode: "file",
      logDir: path.join(runtimeRoot, "logs"),
    },
    server: {
      deploymentMode: "local_trusted",
      exposure: "private",
      host: "127.0.0.1",
      port,
      allowedHostnames: [],
      serveUi: true,
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: false,
    },
    storage: {
      provider: "local_disk",
      localDisk: {
        baseDir: path.join(runtimeRoot, "storage"),
      },
      s3: {
        bucket: "rudder",
        region: "us-east-1",
        prefix: "",
        forcePathStyle: false,
      },
    },
    secrets: {
      provider: "local_encrypted",
      strictMode: false,
      localEncrypted: {
        keyFilePath: path.join(runtimeRoot, "secrets", "master.key"),
      },
    },
  };
}

function writeRuntimeServerJson(configPath: string, payload: Record<string, unknown>) {
  const runtimeDir = path.join(path.dirname(configPath), "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "server.json"), JSON.stringify(payload, null, 2));
}

describe("portCheck", () => {
  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server?.listening) {
        await closeServer(server);
      }
    }
  });

  it("passes when the configured port is occupied by the active Rudder runtime", async () => {
    const { port } = await listenOnEphemeralPort();
    const configPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rudder-port-check-")), "config.json");
    writeRuntimeServerJson(configPath, {
      pid: process.pid,
      listenPort: port,
      apiUrl: `http://127.0.0.1:${port}`,
      ownerKind: "desktop",
    });

    await expect(portCheck(createConfig(port), configPath)).resolves.toMatchObject({
      name: "Server port",
      status: "pass",
      message: `Port ${port} is in use by the active Rudder runtime`,
    });
  });

  it("warns when the configured port is occupied by another process", async () => {
    const { port } = await listenOnEphemeralPort();
    const configPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rudder-port-check-")), "config.json");

    await expect(portCheck(createConfig(port), configPath)).resolves.toMatchObject({
      name: "Server port",
      status: "warn",
      message: `Port ${port} is already in use`,
    });
  });
});
