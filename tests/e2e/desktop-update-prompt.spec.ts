import { expect, test, type Page } from "@playwright/test";

type DeferredUpdatePrompt = {
  promptId: string;
  title: string;
  message: string;
  detail: string;
  totalRuns: number;
  confirmLabel: string;
  forceLabel: string;
  cancelLabel: string;
};

async function installDesktopPromptStub(page: Page) {
  await page.addInitScript(() => {
    let listener: ((prompt: DeferredUpdatePrompt) => void) | null = null;
    Object.defineProperty(window, "desktopShell", {
      configurable: true,
      value: {
        getBootState: async () => ({
          runtime: { version: "0.3.6-canary.21", mode: "owned", ownerKind: "desktop" },
          paths: { instanceRoot: "/tmp/rudder-e2e" },
        }),
        onBootState: () => () => {},
        setDeferredUpdatePromptReady: async () => undefined,
        onDeferredUpdatePrompt: (nextListener: (prompt: DeferredUpdatePrompt) => void) => {
          listener = nextListener;
          return () => {
            listener = null;
          };
        },
        respondDeferredUpdatePrompt: async () => undefined,
      },
    });
    Object.defineProperty(window, "__emitDeferredUpdatePrompt", {
      configurable: true,
      value: (prompt: DeferredUpdatePrompt) => {
        listener?.(prompt);
      },
    });
  });
}

async function createOrganization(page: Page) {
  const orgRes = await page.request.post("/api/orgs", {
    data: {
      name: `Desktop Update Prompt ${Date.now()}`,
    },
  });
  expect(orgRes.ok()).toBe(true);
  return await orgRes.json() as { issuePrefix: string };
}

async function showDeferredUpdatePrompt(page: Page, issuePrefix: string) {
  await page.goto(`/${issuePrefix}/workspaces/backups`);
  await page.evaluate(() => {
    const emitPrompt = (window as typeof window & {
      __emitDeferredUpdatePrompt?: (prompt: DeferredUpdatePrompt) => void;
    }).__emitDeferredUpdatePrompt;
    emitPrompt?.({
      promptId: "prompt-e2e",
      title: "Rudder",
      message: "There are 2 active agent runs.",
      detail:
        "Rudder can download the installer now, keep active work running, then apply the update after the runs finish. "
        + "The desktop app may close and reopen automatically when it is safe to replace. "
        + "Choose Stop Runs and Update Now to cancel active runs, quit Rudder, and apply the update immediately.\n\n"
        + "Z Studio: 2 running",
      totalRuns: 2,
      confirmLabel: "Download and Update When Idle",
      forceLabel: "Stop Runs and Update Now",
      cancelLabel: "Cancel",
    });
  });
}

async function assertDialogActionsFit(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("There are 2 active agent runs.")).toBeVisible();
  await expect(dialog.getByText("Z Studio: 2 running")).toBeVisible();

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).toBeTruthy();

  for (const buttonName of ["Cancel", "Stop Runs and Update Now", "Download and Update When Idle"]) {
    const button = dialog.getByRole("button", { name: buttonName });
    const buttonBox = await button.boundingBox();
    expect(buttonBox, `${buttonName} button should render`).toBeTruthy();
    expect(buttonBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width);
    await expect.poll(() => button.evaluate((element) => ({
      clippedHorizontally: element.scrollWidth > element.clientWidth + 1,
      clippedVertically: element.scrollHeight > element.clientHeight + 1,
    })), { message: `${buttonName} label should not be clipped` }).toEqual({
      clippedHorizontally: false,
      clippedVertically: false,
    });
  }
}

test("desktop deferred update prompt keeps long actions inside the dialog", async ({ page }, testInfo) => {
  await installDesktopPromptStub(page);

  const organization = await createOrganization(page);
  await showDeferredUpdatePrompt(page, organization.issuePrefix);

  await assertDialogActionsFit(page);

  await page.screenshot({
    path: testInfo.outputPath("desktop-update-prompt.png"),
    fullPage: true,
  });
});

test("desktop deferred update prompt keeps wrapped actions readable on narrow dark viewports", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.addInitScript(() => {
    window.localStorage.setItem("rudder.theme", "dark");
  });
  await installDesktopPromptStub(page);

  const organization = await createOrganization(page);
  await showDeferredUpdatePrompt(page, organization.issuePrefix);
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

  await assertDialogActionsFit(page);

  await page.screenshot({
    path: testInfo.outputPath("desktop-update-prompt-narrow-dark.png"),
    fullPage: true,
  });
});
