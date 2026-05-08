import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type GitIdentitySource = "environment" | "repository" | "global" | "target_config";

export type GitIdentity = {
  name: string;
  email: string;
  source: GitIdentitySource;
};

export type GitIdentityPreparationResult = {
  identity: GitIdentity | null;
  configTarget: string;
  configuredUseConfigOnly: boolean;
  warnings: string[];
};

const GIT_IDENTITY_ENV_KEYS = [
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
] as const;

type GitCommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error: Error | null;
};

type LogFn = (stream: "stdout" | "stderr", chunk: string) => Promise<void>;

const LOCAL_EMAIL_RE = /@[^@\s<>]+\.local$/i;
const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

function normalizeEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env ?? process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function isUnsafeGitIdentityEmail(email: string | null | undefined): boolean {
  const normalized = nonEmpty(email);
  if (!normalized) return true;
  if (!EMAIL_RE.test(normalized)) return true;
  return LOCAL_EMAIL_RE.test(normalized);
}

export function applyGitIdentityPreparationEnv(
  env: Record<string, string>,
  preparation: GitIdentityPreparationResult,
): void {
  env.GIT_CONFIG_GLOBAL = preparation.configTarget;
  if (!preparation.identity) {
    for (const key of GIT_IDENTITY_ENV_KEYS) env[key] = "";
    return;
  }

  env.GIT_AUTHOR_NAME = preparation.identity.name;
  env.GIT_AUTHOR_EMAIL = preparation.identity.email;
  env.GIT_COMMITTER_NAME = preparation.identity.name;
  env.GIT_COMMITTER_EMAIL = preparation.identity.email;
}

function buildIdentity(
  name: string | null | undefined,
  email: string | null | undefined,
  source: GitIdentitySource,
): GitIdentity | null {
  const normalizedName = nonEmpty(name);
  const normalizedEmail = nonEmpty(email);
  if (!normalizedName || !normalizedEmail) return null;
  if (isUnsafeGitIdentityEmail(normalizedEmail)) return null;
  return {
    name: normalizedName,
    email: normalizedEmail,
    source,
  };
}

function identityFromEnv(env: NodeJS.ProcessEnv): GitIdentity | null {
  return (
    buildIdentity(env.GIT_AUTHOR_NAME, env.GIT_AUTHOR_EMAIL, "environment") ??
    buildIdentity(env.GIT_COMMITTER_NAME, env.GIT_COMMITTER_EMAIL, "environment")
  );
}

async function runGit(
  args: string[],
  opts: { cwd?: string | null; env?: NodeJS.ProcessEnv } = {},
): Promise<GitCommandResult> {
  const env = normalizeEnv(opts.env);
  return await new Promise<GitCommandResult>((resolve) => {
    const child = spawn("git", args, {
      cwd: opts.cwd ?? process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ code: null, stdout, stderr, error });
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr, error: null });
    });
  });
}

async function readGitConfigValue(
  args: string[],
  key: string,
  opts: { cwd?: string | null; env?: NodeJS.ProcessEnv } = {},
): Promise<string | null> {
  const result = await runGit([...args, "--get", key], opts);
  if (result.code !== 0) return null;
  return nonEmpty(result.stdout);
}

async function readIdentityFromGitConfig(
  args: string[],
  source: GitIdentitySource,
  opts: { cwd?: string | null; env?: NodeJS.ProcessEnv } = {},
): Promise<GitIdentity | null> {
  const [name, email] = await Promise.all([
    readGitConfigValue(args, "user.name", opts),
    readGitConfigValue(args, "user.email", opts),
  ]);
  return buildIdentity(name, email, source);
}

async function setGitConfigValue(args: string[], key: string, value: string, opts: { cwd?: string | null; env?: NodeJS.ProcessEnv }) {
  const result = await runGit([...args, key, value], opts);
  if (result.code === 0) return;
  const details = [result.stderr.trim(), result.stdout.trim(), result.error?.message]
    .filter(Boolean)
    .join("\n");
  throw new Error(details || `git config ${key} failed`);
}

async function unsetGitConfigValue(args: string[], key: string, opts: { cwd?: string | null; env?: NodeJS.ProcessEnv }) {
  await runGit([...args, "--unset-all", key], opts);
}

async function existingGitConfigPaths(candidates: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const existing: string[] = [];
  for (const candidate of candidates) {
    const normalized = nonEmpty(candidate);
    if (!normalized) continue;
    const resolved = path.resolve(normalized);
    if (seen.has(resolved)) continue;
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat?.isFile()) continue;
    seen.add(resolved);
    existing.push(resolved);
  }
  return existing;
}

async function resolveHostGlobalGitConfigIncludes(sourceEnv: NodeJS.ProcessEnv, targetConfigPath: string): Promise<string[]> {
  const home = nonEmpty(sourceEnv.HOME);
  const xdgConfigHome = nonEmpty(sourceEnv.XDG_CONFIG_HOME);
  const candidates = [
    nonEmpty(sourceEnv.GIT_CONFIG_GLOBAL) ?? "",
    home ? path.join(home, ".gitconfig") : "",
    xdgConfigHome ? path.join(xdgConfigHome, "git", "config") : "",
    home ? path.join(home, ".config", "git", "config") : "",
  ].filter(Boolean);
  const target = path.resolve(targetConfigPath);
  return (await existingGitConfigPaths(candidates)).filter((candidate) => candidate !== target);
}

function renderGitConfigIncludes(includePaths: string[]): string[] {
  if (includePaths.length === 0) return [];
  return ["[include]", ...includePaths.map((includePath) => `\tpath = ${includePath}`), ""];
}

async function writeGitConfigSeed(configPath: string, includePaths: string[]): Promise<void> {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const lines = renderGitConfigIncludes(includePaths);
  await fs.writeFile(configPath, lines.length > 0 ? `${lines.join("\n")}\n` : "", "utf8");
}

async function writeFallbackGitConfigFile(configPath: string, identity: GitIdentity | null, includePaths: string[] = []): Promise<void> {
  const lines = [...renderGitConfigIncludes(includePaths), "[user]", "\tuseConfigOnly = true"];
  if (identity) {
    lines.push(`\tname = ${identity.name}`);
    lines.push(`\temail = ${identity.email}`);
  }
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${lines.join("\n")}\n`, "utf8");
}

async function resolveBestGitIdentity(input: {
  cwd: string;
  sourceEnv: NodeJS.ProcessEnv;
  targetConfigArgs?: string[];
  targetCwd?: string | null;
}): Promise<GitIdentity | null> {
  return (
    identityFromEnv(input.sourceEnv) ??
    (await readIdentityFromGitConfig(["config", "--local"], "repository", {
      cwd: input.cwd,
      env: input.sourceEnv,
    })) ??
    (await readIdentityFromGitConfig(["config", "--global"], "global", {
      cwd: input.cwd,
      env: input.sourceEnv,
    })) ??
    (input.targetConfigArgs
      ? await readIdentityFromGitConfig(input.targetConfigArgs, "target_config", {
        cwd: input.targetCwd ?? input.cwd,
        env: input.sourceEnv,
      })
      : null)
  );
}

export async function ensureGitIdentityFileConfig(input: {
  cwd: string;
  home: string;
  sourceEnv?: NodeJS.ProcessEnv;
  onLog?: LogFn | null;
}): Promise<GitIdentityPreparationResult> {
  const sourceEnv = normalizeEnv(input.sourceEnv);
  const home = path.resolve(input.home);
  const gitConfigPath = path.join(home, ".gitconfig");
  await fs.mkdir(home, { recursive: true });

  const configArgs = ["config", "--file", gitConfigPath];
  const identity = await resolveBestGitIdentity({
    cwd: input.cwd,
    sourceEnv,
    targetConfigArgs: configArgs,
    targetCwd: input.cwd,
  });
  const includePaths = identity
    ? await resolveHostGlobalGitConfigIncludes(sourceEnv, gitConfigPath)
    : [];
  const warnings: string[] = [];

  try {
    await writeGitConfigSeed(gitConfigPath, includePaths);
    await setGitConfigValue(configArgs, "user.useConfigOnly", "true", { cwd: input.cwd, env: sourceEnv });
    if (identity) {
      await setGitConfigValue(configArgs, "user.name", identity.name, { cwd: input.cwd, env: sourceEnv });
      await setGitConfigValue(configArgs, "user.email", identity.email, { cwd: input.cwd, env: sourceEnv });
    } else {
      await unsetGitConfigValue(configArgs, "user.name", { cwd: input.cwd, env: sourceEnv });
      await unsetGitConfigValue(configArgs, "user.email", { cwd: input.cwd, env: sourceEnv });
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    await writeFallbackGitConfigFile(gitConfigPath, identity, includePaths);
  }

  if (input.onLog) {
    const detail = identity
      ? `using ${identity.source} Git identity ${identity.name} <${identity.email}>`
      : "without a usable Git identity; commits will fail until user.name and user.email are configured";
    await input.onLog(
      "stdout",
      `[rudder] Prepared isolated Git config at ${gitConfigPath} with user.useConfigOnly=true (${detail}).\n`,
    );
  }

  return {
    identity,
    configTarget: gitConfigPath,
    configuredUseConfigOnly: true,
    warnings,
  };
}

export async function ensureGitRepositoryIdentityConfig(input: {
  cwd: string;
  sourceEnv?: NodeJS.ProcessEnv;
  onLog?: LogFn | null;
}): Promise<GitIdentityPreparationResult> {
  const sourceEnv = normalizeEnv(input.sourceEnv);
  const cwd = path.resolve(input.cwd);
  const configArgs = ["config", "--local"];
  const identity = await resolveBestGitIdentity({
    cwd,
    sourceEnv,
    targetConfigArgs: configArgs,
    targetCwd: cwd,
  });
  const warnings: string[] = [];

  await setGitConfigValue(configArgs, "user.useConfigOnly", "true", { cwd, env: sourceEnv });
  if (identity) {
    await setGitConfigValue(configArgs, "user.name", identity.name, { cwd, env: sourceEnv });
    await setGitConfigValue(configArgs, "user.email", identity.email, { cwd, env: sourceEnv });
  } else {
    await unsetGitConfigValue(configArgs, "user.name", { cwd, env: sourceEnv });
    await unsetGitConfigValue(configArgs, "user.email", { cwd, env: sourceEnv });
  }

  if (input.onLog) {
    const detail = identity
      ? `using ${identity.source} Git identity ${identity.name} <${identity.email}>`
      : "without a usable Git identity; commits will fail until user.name and user.email are configured";
    await input.onLog(
      "stdout",
      `[rudder] Prepared repository Git config in ${cwd} with user.useConfigOnly=true (${detail}).\n`,
    );
  }

  return {
    identity,
    configTarget: cwd,
    configuredUseConfigOnly: true,
    warnings,
  };
}
