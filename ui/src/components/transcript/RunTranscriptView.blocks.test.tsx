// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ExpandableTranscriptResponsePre } from "./RunTranscriptView.blocks";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
});

function render(element: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanupFn = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  act(() => {
    root.render(element);
  });
  return container;
}

describe("ExpandableTranscriptResponsePre", () => {
  it("limits responses that overflow only after narrow-container wrapping", () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    const wrappedResponse = `{"payload":"${"wrapped-json-fragment".repeat(54)}"}`;

    expect(wrappedResponse.length).toBeLessThan(1400);
    expect(wrappedResponse).not.toContain("\n");

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.tagName === "PRE" ? 720 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.tagName === "PRE" ? 288 : 0;
      },
    });

    try {
      const container = render(<ExpandableTranscriptResponsePre text={wrappedResponse} />);
      const pre = container.querySelector("pre");
      const button = container.querySelector("button");

      expect(pre?.className).toContain("max-h-72");
      expect(pre?.getAttribute("data-transcript-response-collapsed")).toBe("true");
      expect(button?.textContent).toBe("Show full response");

      act(() => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(pre?.className).not.toContain("max-h-72");
      expect(pre?.getAttribute("data-transcript-response-collapsed")).toBeNull();
      expect(button?.getAttribute("aria-expanded")).toBe("true");
      expect(button?.textContent).toBe("Show less");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
      }
      if (originalClientHeight) {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
      }
    }
  });
});
