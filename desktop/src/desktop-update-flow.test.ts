import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getName: vi.fn(() => "Rudder"),
    getPath: vi.fn(() => "/tmp/rudder-desktop-test"),
    getVersion: vi.fn(() => "0.3.3"),
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showMessageBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

const { createDesktopUpdateFlow } = await import("./desktop-update-flow.js");

class MockReadableStream extends EventEmitter {
  setEncoding = vi.fn();
}

function createMockUpdateChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: MockReadableStream;
    stderr: MockReadableStream;
    stdin: { destroyed: boolean; write: (chunk: string, callback?: (error?: Error | null) => void) => void };
    unref: () => void;
  };
  child.stdout = new MockReadableStream();
  child.stderr = new MockReadableStream();
  child.stdin = {
    destroyed: false,
    write: (_chunk, callback) => callback?.(null),
  };
  child.unref = vi.fn();
  return child;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createFlow(overrides: Partial<Parameters<typeof createDesktopUpdateFlow>[0]> = {}) {
  const sentProgressEvents: unknown[] = [];
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (_channel: string, event: unknown) => {
        sentProgressEvents.push(event);
      },
    },
  };
  const flow = createDesktopUpdateFlow({
    appName: "Rudder",
    getMainWindow: () => mainWindow,
    getServerHandle: () => ({ runtime: { version: "0.3.3" } }),
    getBootState: () => ({ runtime: { localEnv: "prod_local", version: "0.3.3" } }),
    listActiveRunsForQuit: async () => ({ totalRuns: 0 }),
    formatQuitRunDetail: () => "",
    showMainWindow: vi.fn(),
    ...overrides,
  });
  return { flow, sentProgressEvents };
}

describe("desktop update flow", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("waits for child close before publishing final failed update diagnostics", async () => {
    const child = createMockUpdateChild();
    spawnMock.mockReturnValue(child);
    const { flow } = createFlow();

    await expect(flow.installUpdate("0.3.4")).resolves.toMatchObject({
      status: "started",
      version: "0.3.4",
    });

    child.emit("exit", 1);
    child.stderr.emit("data", "No checksummed Rudder Desktop asset found\n");
    child.emit("close", 1);

    expect(flow.getDesktopUpdateProgress()).toMatchObject({
      phase: "failed",
      message: "Update installer exited with code 1.",
      error: "No checksummed Rudder Desktop asset found",
    });
  });

  it("does not overwrite a child spawn error when close also fires", async () => {
    const child = createMockUpdateChild();
    spawnMock.mockReturnValue(child);
    const { flow } = createFlow();

    await flow.installUpdate("0.3.4");
    child.emit("error", new Error("spawn EACCES"));
    child.stderr.emit("data", "later stderr\n");
    child.emit("close", 1);

    expect(flow.getDesktopUpdateProgress()).toMatchObject({
      phase: "failed",
      message: "Update failed to start.",
      error: "spawn EACCES",
    });
  });

  it("reuses the active update attempt instead of starting a second version download", async () => {
    const child = createMockUpdateChild();
    spawnMock.mockReturnValue(child);
    const activeRuns = createDeferred<{ totalRuns: number }>();
    const { flow } = createFlow({
      listActiveRunsForQuit: vi.fn(() => activeRuns.promise),
    });

    const firstInstall = flow.installUpdate("0.3.5-canary.8");
    const secondInstall = flow.installUpdate("0.3.5-canary.9");
    expect(spawnMock).not.toHaveBeenCalled();

    activeRuns.resolve({ totalRuns: 0 });
    const [firstResult, secondResult] = await Promise.all([firstInstall, secondInstall]);

    expect(firstResult).toMatchObject({
      status: "started",
      version: "0.3.5-canary.8",
      updateId: secondResult.updateId,
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("clears the active attempt when setup fails synchronously", async () => {
    const child = createMockUpdateChild();
    spawnMock.mockReturnValue(child);
    let failProgressSend = true;
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: () => {
          if (failProgressSend) throw new Error("send failed");
        },
      },
    };
    const { flow } = createFlow({
      getMainWindow: () => mainWindow,
    });

    await expect(flow.installUpdate("0.3.5-canary.8")).rejects.toThrow("send failed");

    failProgressSend = false;
    await expect(flow.installUpdate("0.3.5-canary.9")).resolves.toMatchObject({
      status: "started",
      version: "0.3.5-canary.9",
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the waiting result when an update is deferred for active runs", async () => {
    const child = createMockUpdateChild();
    spawnMock.mockReturnValue(child);
    const { flow } = createFlow({
      listActiveRunsForQuit: vi.fn(async () => ({ totalRuns: 2 })),
      promptForDeferredUpdate: vi.fn(async () => "wait"),
    });

    const firstResult = await flow.installUpdate("0.3.5-canary.8");
    const secondResult = await flow.installUpdate("0.3.5-canary.9");

    expect(secondResult).toMatchObject({
      status: "waiting",
      version: "0.3.5-canary.8",
      updateId: firstResult.updateId,
      totalRuns: 2,
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a spawned update child exclusive while it is downloading or waiting to apply", async () => {
    const child = createMockUpdateChild();
    spawnMock.mockReturnValue(child);
    const { flow } = createFlow();

    const firstResult = await flow.installUpdate("0.3.5-canary.8");
    const secondResult = await flow.installUpdate("0.3.5-canary.9");

    expect(secondResult).toMatchObject({
      status: "started",
      version: "0.3.5-canary.8",
      updateId: firstResult.updateId,
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("releases the update lock after the child closes so a later update can start", async () => {
    const firstChild = createMockUpdateChild();
    const secondChild = createMockUpdateChild();
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const { flow } = createFlow();

    await expect(flow.installUpdate("0.3.5-canary.8")).resolves.toMatchObject({
      status: "started",
      version: "0.3.5-canary.8",
    });

    firstChild.emit("close", 0);

    await expect(flow.installUpdate("0.3.5-canary.9")).resolves.toMatchObject({
      status: "started",
      version: "0.3.5-canary.9",
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
