// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopUpdateProgressProvider } from "@/context/DesktopUpdateProgressContext";
import { I18nProvider } from "@/context/I18nContext";
import type { DesktopUpdateProgressEvent, DesktopShellApi } from "@/lib/desktop-shell";
import { DesktopUpdateStatusCard } from "./DesktopUpdateStatusCard";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let cleanupFn: (() => void) | null = null;

function renderHarness(initialProgress: DesktopUpdateProgressEvent | null) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  let listener: ((event: DesktopUpdateProgressEvent) => void) | null = null;

  Object.defineProperty(window, "desktopShell", {
    configurable: true,
    value: {
      getUpdateProgress: vi.fn().mockResolvedValue(initialProgress),
      onUpdateProgress: vi.fn((nextListener: (event: DesktopUpdateProgressEvent) => void) => {
        listener = nextListener;
        return () => {
          listener = null;
        };
      }),
      installUpdate: vi.fn(),
      openExternal: vi.fn(),
    } as Partial<DesktopShellApi>,
  });

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <DesktopUpdateProgressProvider>
            <DesktopUpdateStatusCard />
          </DesktopUpdateProgressProvider>
        </I18nProvider>
      </QueryClientProvider>,
    );
  });

  cleanupFn = () => {
    act(() => root.unmount());
    container.remove();
    document.body.replaceChildren();
    delete (window as typeof window & { desktopShell?: unknown }).desktopShell;
  };

  return {
    emit(event: DesktopUpdateProgressEvent) {
      act(() => listener?.(event));
    },
  };
}

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
});

describe("DesktopUpdateStatusCard", () => {
  it("renders a compact bottom-right progress card for active desktop updates", async () => {
    renderHarness({
      updateId: "update-1",
      version: "0.2.1",
      phase: "downloading_asset",
      message: "Downloading desktop asset",
      percent: 42,
      transferredBytes: 42,
      totalBytes: 100,
      at: new Date().toISOString(),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Updating to v0.2.1");
    expect(document.body.textContent).toContain("42%");
    expect(document.body.textContent).toContain("Downloading desktop asset");
  });

  it("updates when the desktop shell publishes a new progress event", async () => {
    const harness = renderHarness(null);

    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body.textContent).not.toContain("Updating to");

    harness.emit({
      updateId: "update-2",
      version: "0.2.2",
      phase: "verifying_checksum",
      message: "Verifying checksum",
      at: new Date().toISOString(),
    });

    expect(document.body.textContent).toContain("Updating to v0.2.2");
    expect(document.body.textContent).toContain("Verifying checksum");
  });
});
