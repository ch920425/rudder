// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductTourOverlay, hasCompletedProductTour } from "./ProductTourOverlay";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const closeProductTour = vi.hoisted(() => vi.fn());

vi.mock("@/context/DialogContext", () => ({
  useDialog: () => ({
    productTourOpen: true,
    closeProductTour,
  }),
}));

vi.mock("@/context/I18nContext", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        "productTour.checklist.title": "Complete your first work loop",
        "productTour.checklist.workspace": "Read the control plane",
        "productTour.checklist.create": "Create a small task",
        "productTour.checklist.issues": "Track issue state",
        "productTour.checklist.inspect": "Inspect work output",
        "productTour.checklist.settings": "Find the tour again",
        "productTour.stepCounter": "{{current}} / {{total}}",
        "productTour.step.workspace.title": "Rudder is the control plane for agent work",
        "productTour.step.workspace.body": "The rail keeps the main work surfaces close.",
        "productTour.step.create.title": "Start with one task an agent can actually move",
        "productTour.step.create.body": "The create menu is where new work begins.",
        "productTour.step.issues.title": "Issues are the executable units of work",
        "productTour.step.issues.body": "The Issue surface shows work state.",
        "productTour.step.inspect.title": "Inspect the work before you approve or continue",
        "productTour.step.inspect.body": "The main workspace shows details and outputs.",
        "productTour.step.settings.title": "You can replay this tour from Settings",
        "productTour.step.settings.body": "Open System settings, then Profile.",
        "productTour.back": "Back",
        "productTour.next": "Next",
        "productTour.finish": "Finish",
        "productTour.skip": "Skip tour",
      };
      return (messages[key] ?? key).replaceAll(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(params?.[name] ?? _match),
      );
    },
  }),
}));

let cleanupFn: (() => void) | null = null;

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
  closeProductTour.mockReset();
});

function click(element: Element) {
  (element as HTMLElement).click();
}

function renderOverlay() {
  const target = document.createElement("button");
  target.dataset.tourTarget = "primary-rail";
  document.body.appendChild(target);

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
    root.render(<ProductTourOverlay />);
  });

  return container;
}

describe("ProductTourOverlay", () => {
  it("steps through the guided tour and marks it complete on finish", async () => {
    const container = renderOverlay();

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Rudder is the control plane for agent work");
    expect(container.textContent).toContain("1 / 5");

    for (let index = 0; index < 4; index += 1) {
      const nextButton = Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Next"));
      expect(nextButton).toBeTruthy();
      act(() => {
        click(nextButton!);
      });
    }

    expect(container.textContent).toContain("You can replay this tour from Settings");

    const finishButton = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Finish"));
    expect(finishButton).toBeTruthy();

    act(() => {
      click(finishButton!);
    });

    expect(closeProductTour).toHaveBeenCalledTimes(1);
    expect(hasCompletedProductTour()).toBe(true);
  });
});
