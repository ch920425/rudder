// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { WorkspaceLaunchTargetIcon } from "./OrganizationWorkspaces";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderIcon(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}

describe("WorkspaceLaunchTargetIcon", () => {
  it("renders app icon data inside a visible icon slot", () => {
    const { container, unmount } = renderIcon(
      <WorkspaceLaunchTargetIcon
        target={{
          id: "vscode",
          label: "VS Code",
          kind: "ide",
          iconDataUrl: "data:image/png;base64,abc",
        }}
        className="h-5 w-5"
      />,
    );

    const slot = container.querySelector("[data-workspace-launch-target-icon='vscode']");
    const image = container.querySelector("img");
    expect(slot?.className).toContain("bg-white");
    expect(slot?.className).toContain("border");
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,abc");

    unmount();
  });

  it("falls back to a visible native glyph when image loading fails", () => {
    const { container, unmount } = renderIcon(
      <WorkspaceLaunchTargetIcon
        target={{
          id: "terminal",
          label: "Terminal",
          kind: "terminal",
          iconDataUrl: "data:image/png;base64,broken",
        }}
      />,
    );

    const image = container.querySelector("img");
    act(() => {
      image?.dispatchEvent(new Event("error", { bubbles: false }));
    });

    const fallback = container.querySelector("[data-fallback-icon='true']");
    expect(fallback).not.toBeNull();
    expect(fallback?.className).toContain("text-foreground");

    unmount();
  });
});
