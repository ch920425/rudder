import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  ensureGitIdentityFileConfig,
  ensureGitRepositoryIdentityConfig,
  isUnsafeGitIdentityEmail,
} from "./git-identity.js";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return execFileAsync("git", args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function createRepoWithoutStoredIdentity(root: string) {
  const repo = path.join(root, "repo");
  await fs.mkdir(repo, { recursive: true });
  await runGit(repo, ["init"]);
  await fs.writeFile(path.join(repo, "README.md"), "hello\n", "utf8");
  await runGit(repo, ["add", "README.md"]);
  await runGit(repo, [
    "-c",
    "user.name=Setup User",
    "-c",
    "user.email=setup@example.com",
    "commit",
    "-m",
    "Initial commit",
  ]);
  await runGit(repo, ["checkout", "-B", "main"]);
  return repo;
}

async function gitAuthorIdent(cwd: string, env: NodeJS.ProcessEnv) {
  return execFileAsync("git", ["var", "GIT_AUTHOR_IDENT"], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
  });
}

describe("git identity guard", () => {
  it("rejects local-host fallback emails as unsafe identities", () => {
    expect(isUnsafeGitIdentityEmail("zeeland@ZeelanddeMacBook-Pro.local")).toBe(true);
    expect(isUnsafeGitIdentityEmail("72488598+Undertone0809@users.noreply.github.com")).toBe(false);
  });

  it("seeds isolated HOME Git config from repository identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-git-identity-repo-"));
    try {
      const repo = await createRepoWithoutStoredIdentity(root);
      const isolatedHome = path.join(root, "agent-home");
      await runGit(repo, ["config", "user.name", "Rudder Agent"]);
      await runGit(repo, ["config", "user.email", "rudder-agent@example.com"]);

      const result = await ensureGitIdentityFileConfig({
        cwd: repo,
        home: isolatedHome,
        sourceEnv: {
          ...process.env,
          HOME: path.join(root, "empty-home"),
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });

      expect(result.identity).toMatchObject({
        name: "Rudder Agent",
        email: "rudder-agent@example.com",
        source: "repository",
      });
      await expect(fs.readFile(path.join(isolatedHome, ".gitconfig"), "utf8")).resolves.toContain(
        "useConfigOnly = true",
      );
      const ident = await gitAuthorIdent(repo, {
        HOME: isolatedHome,
        GIT_CONFIG_NOSYSTEM: "1",
      });
      expect(ident.stdout).toContain("Rudder Agent <rudder-agent@example.com>");
      expect(ident.stdout).not.toContain(".local");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("prevents Git fallback commits when isolated HOME has no usable identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-git-identity-missing-"));
    try {
      const repo = await createRepoWithoutStoredIdentity(root);
      const isolatedHome = path.join(root, "agent-home");

      const result = await ensureGitIdentityFileConfig({
        cwd: repo,
        home: isolatedHome,
        sourceEnv: {
          ...process.env,
          HOME: path.join(root, "empty-home"),
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });

      expect(result.identity).toBeNull();
      await expect(gitAuthorIdent(repo, {
        HOME: isolatedHome,
        GIT_CONFIG_NOSYSTEM: "1",
      })).rejects.toMatchObject({
        stderr: expect.not.stringContaining(".local"),
      });
      await expect(execFileAsync("git", ["commit", "--allow-empty", "-m", "agent commit"], {
        cwd: repo,
        env: {
          ...process.env,
          HOME: isolatedHome,
          GIT_CONFIG_NOSYSTEM: "1",
        },
      })).rejects.toMatchObject({
        stderr: expect.stringContaining("auto-detection is disabled"),
      });
      const count = await runGit(repo, ["rev-list", "--count", "HEAD"]);
      expect(count.stdout.trim()).toBe("1");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("configures repository useConfigOnly without inventing a fallback identity", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-git-identity-worktree-"));
    try {
      const repo = await createRepoWithoutStoredIdentity(root);

      const result = await ensureGitRepositoryIdentityConfig({
        cwd: repo,
        sourceEnv: {
          ...process.env,
          HOME: path.join(root, "empty-home"),
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });

      expect(result.identity).toBeNull();
      await expect(runGit(repo, ["config", "--local", "--get", "user.useConfigOnly"])).resolves.toMatchObject({
        stdout: "true\n",
      });
      await expect(gitAuthorIdent(repo, {
        HOME: path.join(root, "empty-home"),
        GIT_CONFIG_NOSYSTEM: "1",
      })).rejects.toMatchObject({
        stderr: expect.not.stringContaining(".local"),
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
