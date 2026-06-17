// @vitest-environment jsdom

import type { ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelDropdown } from "./AgentConfigForm.model-dropdown";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
});

function render(element: ReactElement) {
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

describe("ModelDropdown", () => {
  it("lets provider/model runtimes enter a custom model that was not discovered", () => {
    const onChange = vi.fn();

    render(
      <ModelDropdown
        label="Model"
        models={[
          {
            id: "kimi-coding/kimi-for-coding",
            label: "kimi-coding/kimi-for-coding",
          },
        ]}
        value=""
        onChange={onChange}
        open
        onOpenChange={() => {}}
        allowDefault={false}
        required
        groupByProvider
        emptyLabel="Select or enter provider/model"
        searchPlaceholder="Search or enter provider/model..."
        emptyMessage="No models discovered. Enter provider/model and run Test now."
        allowCustom
      />,
    );

    const input = document.querySelector<HTMLInputElement>(
      "input[placeholder='Search or enter provider/model...']",
    );
    expect(input).toBeTruthy();

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "deepseek/deepseek-chat");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const customButton = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes('Use "deepseek/deepseek-chat"'));
    expect(customButton).toBeTruthy();

    act(() => {
      customButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("deepseek/deepseek-chat");
  });
});
