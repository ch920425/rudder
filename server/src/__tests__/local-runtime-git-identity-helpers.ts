import { expect } from "vitest";

export const confirmedRudderGitIdentity = {
  name: "Confirmed Operator",
  email: "confirmed@example.com",
  confirmed: true,
};

export const clearInheritedGitIdentityEnv = {
  GIT_AUTHOR_NAME: "",
  GIT_AUTHOR_EMAIL: "",
  GIT_COMMITTER_NAME: "",
  GIT_COMMITTER_EMAIL: "",
};

export type GitIdentityCapture = {
  configGlobal: string | null;
  configGlobalContent: string | null;
  authorName: string | null;
  authorEmail: string | null;
  committerName: string | null;
  committerEmail: string | null;
};

export const gitIdentityCaptureSnippet = `
function captureGitIdentityEnv() {
  const configGlobal = process.env.GIT_CONFIG_GLOBAL || null;
  return {
    configGlobal,
    configGlobalContent: configGlobal && fs.existsSync(configGlobal)
      ? fs.readFileSync(configGlobal, "utf8")
      : null,
    authorName: process.env.GIT_AUTHOR_NAME || null,
    authorEmail: process.env.GIT_AUTHOR_EMAIL || null,
    committerName: process.env.GIT_COMMITTER_NAME || null,
    committerEmail: process.env.GIT_COMMITTER_EMAIL || null,
  };
}
`;

export function expectConfirmedGitIdentityCapture(capture: { gitIdentity: GitIdentityCapture }): void {
  expect(capture.gitIdentity.configGlobal).toEqual(expect.any(String));
  expect(capture.gitIdentity.configGlobal).toContain(".gitconfig");
  expect(capture.gitIdentity.configGlobalContent).toContain("useConfigOnly = true");
  expect(capture.gitIdentity.configGlobalContent).toContain("name = Confirmed Operator");
  expect(capture.gitIdentity.configGlobalContent).toContain("email = confirmed@example.com");
  expect(capture.gitIdentity.authorName).toBe("Confirmed Operator");
  expect(capture.gitIdentity.authorEmail).toBe("confirmed@example.com");
  expect(capture.gitIdentity.committerName).toBe("Confirmed Operator");
  expect(capture.gitIdentity.committerEmail).toBe("confirmed@example.com");
}
