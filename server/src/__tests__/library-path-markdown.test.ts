import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveOrganizationWorkspaceRoot } from "../home-paths.js";
import { normalizeLocalLibraryPathMarkdown } from "../services/library-path-markdown.js";

const originalRudderHome = process.env.RUDDER_HOME;
const originalRudderInstanceId = process.env.RUDDER_INSTANCE_ID;
let rudderHome = "";

function restoreEnv(name: "RUDDER_HOME" | "RUDDER_INSTANCE_ID", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function writeWorkspaceFile(relativePath: string) {
  const absolutePath = path.join(resolveOrganizationWorkspaceRoot("org-1"), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, "test\n", "utf8");
  return absolutePath;
}

describe("normalizeLocalLibraryPathMarkdown", () => {
  beforeEach(async () => {
    rudderHome = await fs.mkdtemp(path.join(os.tmpdir(), "rudder-library-path-markdown-"));
    process.env.RUDDER_HOME = rudderHome;
    process.env.RUDDER_INSTANCE_ID = "default";
  });

  afterEach(async () => {
    restoreEnv("RUDDER_HOME", originalRudderHome);
    restoreEnv("RUDDER_INSTANCE_ID", originalRudderInstanceId);
    if (rudderHome) await fs.rm(rudderHome, { recursive: true, force: true });
    rudderHome = "";
  });

  it("rewrites existing markdown link hrefs and bare workspace file paths", async () => {
    const planPath = await writeWorkspaceFile("projects/rudder/plans/ship.md");
    const notesPath = await writeWorkspaceFile("notes/today.md");

    await expect(normalizeLocalLibraryPathMarkdown(
      `See [the plan](${planPath}) and ${notesPath}.`,
      "org-1",
    )).resolves.toBe(
      "See [the plan](library-file://file?p=projects%2Frudder%2Fplans%2Fship.md) and [today.md](library-file://file?p=notes%2Ftoday.md).",
    );
  });

  it("leaves non-workspace, missing, and escaped code paths unchanged", async () => {
    const existingPath = await writeWorkspaceFile("projects/rudder/plans/ship.md");
    const missingWorkspacePath = path.join(resolveOrganizationWorkspaceRoot("org-1"), "projects/rudder/missing.md");
    const outsidePath = path.join(rudderHome, "outside.md");
    await fs.writeFile(outsidePath, "outside\n", "utf8");

    const markdown = [
      `Inline \`${existingPath}\`.`,
      `Inline double \`\`${existingPath}\`\`.`,
      "```sh",
      `cat ${existingPath}`,
      "```",
      `Missing ${missingWorkspacePath}.`,
      `Outside ${outsidePath}.`,
      `[Already](library-file://file?p=projects%2Frudder%2Fplans%2Fship.md)`,
      `[Entry](library-entry://entry-1)`,
    ].join("\n");

    await expect(normalizeLocalLibraryPathMarkdown(markdown, "org-1")).resolves.toBe(markdown);
  });

  it("does not rewrite normalized paths that escape the workspace root", async () => {
    const workspaceRoot = resolveOrganizationWorkspaceRoot("org-1");
    const escapedPath = `${workspaceRoot}/../outside.md`;
    await fs.mkdir(path.dirname(path.resolve(escapedPath)), { recursive: true });
    await fs.writeFile(path.resolve(escapedPath), "outside\n", "utf8");

    const markdown = `Do not convert ${escapedPath}.`;

    await expect(normalizeLocalLibraryPathMarkdown(markdown, "org-1")).resolves.toBe(markdown);
  });
});
