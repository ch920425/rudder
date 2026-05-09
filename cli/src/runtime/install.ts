import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolveRudderHomeDir } from "../config/home.js";

export const RUNTIME_NPM_PACKAGE_NAME = "@rudderhq/server";
export const RUNTIME_METADATA_FILE = "runtime.json";

export interface RuntimeInstallMetadata {
  version: 1;
  packageName: string;
  packageVersion: string;
  installedAt: string;
}

export interface RuntimeInstallResult {
  status: "hit" | "installed";
  cacheDir: string;
  packageSpec: string;
  command: string;
  output: string;
}

export interface EnsureRuntimeInstalledOptions {
  version: string;
  homeDir?: string;
  packageName?: string;
  spawnSyncImpl?: typeof spawnSync;
}

export class RuntimeInstallError extends Error {
  readonly cacheDir: string;
  readonly command: string;
  readonly output: string;

  constructor(message: string, options: { cacheDir: string; command: string; output?: string }) {
    super(message);
    this.name = "RuntimeInstallError";
    this.cacheDir = options.cacheDir;
    this.command = options.command;
    this.output = options.output ?? "";
  }
}

type SpawnSyncResultLike = ReturnType<typeof spawnSync>;

function sanitizeRuntimeCacheSegment(value: string): string {
  return encodeURIComponent(value.trim() || "latest").replaceAll("%", "_");
}

export function resolveRuntimePackageVersion(version: string): string {
  const normalized = version.trim();
  return normalized.length > 0 ? normalized : "latest";
}

export function resolveRuntimeCacheDir(
  version: string,
  homeDir: string = resolveRudderHomeDir(),
): string {
  return path.join(homeDir, "runtimes", sanitizeRuntimeCacheSegment(resolveRuntimePackageVersion(version)));
}

export function resolveRuntimePackageSpec(
  version: string,
  packageName: string = RUNTIME_NPM_PACKAGE_NAME,
): string {
  const packageVersion = resolveRuntimePackageVersion(version);
  return packageVersion === "latest" ? `${packageName}@latest` : `${packageName}@${packageVersion}`;
}

export async function readRuntimeInstallMetadata(
  cacheDir: string,
): Promise<RuntimeInstallMetadata | null> {
  try {
    const raw = await readFile(path.join(cacheDir, RUNTIME_METADATA_FILE), "utf8");
    const parsed = JSON.parse(raw) as RuntimeInstallMetadata;
    if (parsed.version !== 1) return null;
    if (typeof parsed.packageName !== "string" || typeof parsed.packageVersion !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function isRuntimeCacheHit(options: {
  cacheDir: string;
  version: string;
  packageName?: string;
}): Promise<boolean> {
  const packageName = options.packageName ?? RUNTIME_NPM_PACKAGE_NAME;
  const packageVersion = resolveRuntimePackageVersion(options.version);
  const metadata = await readRuntimeInstallMetadata(options.cacheDir);
  if (!metadata || metadata.packageName !== packageName || metadata.packageVersion !== packageVersion) {
    return false;
  }

  try {
    const packageJsonPath = path.join(options.cacheDir, "node_modules", ...packageName.split("/"), "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: string };
    return packageVersion === "latest" || packageJson.version === packageVersion;
  } catch {
    return false;
  }
}

export async function ensureRuntimeInstalled(
  options: EnsureRuntimeInstalledOptions,
): Promise<RuntimeInstallResult> {
  const packageName = options.packageName ?? RUNTIME_NPM_PACKAGE_NAME;
  const packageVersion = resolveRuntimePackageVersion(options.version);
  const cacheDir = resolveRuntimeCacheDir(packageVersion, options.homeDir);
  const packageSpec = resolveRuntimePackageSpec(packageVersion, packageName);
  const command = `npm install --prefix ${cacheDir} --omit=dev --no-audit --no-fund ${packageSpec}`;

  if (await isRuntimeCacheHit({ cacheDir, version: packageVersion, packageName })) {
    return { status: "hit", cacheDir, packageSpec, command, output: "" };
  }

  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, "package.json"), `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`, "utf8");

  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const result = runNpmRuntimeInstall(spawnSyncImpl, cacheDir, packageSpec);
  const output = collectSpawnOutput(result);
  if (result.status !== 0) {
    throw new RuntimeInstallError(
      `Rudder runtime installation failed. Re-run manually: ${command}`,
      { cacheDir, command, output },
    );
  }

  const metadata: RuntimeInstallMetadata = {
    version: 1,
    packageName,
    packageVersion,
    installedAt: new Date().toISOString(),
  };
  await writeFile(path.join(cacheDir, RUNTIME_METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return { status: "installed", cacheDir, packageSpec, command, output };
}

export function resolveRuntimeServerEntrypoint(cacheDir: string, packageName = RUNTIME_NPM_PACKAGE_NAME): string {
  return createRequire(path.join(cacheDir, "package.json")).resolve(packageName);
}

export async function importRuntimeServerModule(cacheDir: string, packageName = RUNTIME_NPM_PACKAGE_NAME): Promise<unknown> {
  const entrypoint = resolveRuntimeServerEntrypoint(cacheDir, packageName);
  return await import(pathToFileURL(entrypoint).href);
}

function runNpmRuntimeInstall(
  spawnSyncImpl: typeof spawnSync,
  cacheDir: string,
  packageSpec: string,
): SpawnSyncResultLike {
  return spawnSyncImpl(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["install", "--prefix", cacheDir, "--omit=dev", "--no-audit", "--no-fund", packageSpec],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...(process.platform === "win32" ? { shell: true, windowsHide: true } : {}),
    },
  );
}

function collectSpawnOutput(result: SpawnSyncResultLike): string {
  return [result.stdout, result.stderr, result.error instanceof Error ? result.error.message : null]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim();
}
