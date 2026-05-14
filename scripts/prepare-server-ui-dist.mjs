#!/usr/bin/env node
import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiDist = path.join(repoRoot, "ui", "dist");
const serverUiDist = path.join(repoRoot, "server", "ui-dist");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status === 0) return;
  throw new Error(`${command} ${args.join(" ")} exited with code ${result.status ?? "unknown"}`);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

console.log("  -> Building @rudderhq/ui...");
run(pnpmBin, ["--filter", "@rudderhq/ui", "build"]);

if (!(await pathExists(path.join(uiDist, "index.html")))) {
  throw new Error(`UI build output missing at ${path.join(uiDist, "index.html")}`);
}

await rm(serverUiDist, { recursive: true, force: true });
await cp(uiDist, serverUiDist, { recursive: true });
console.log("  -> Copied ui/dist to server/ui-dist");
