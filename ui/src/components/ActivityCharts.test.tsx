// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentSkillAnalytics } from "@rudderhq/shared";
import { SkillsUsageChart } from "./ActivityCharts";

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

function buildSkillAnalytics(overrides: Partial<AgentSkillAnalytics> = {}): AgentSkillAnalytics {
  return {
    agentId: "__all__",
    orgId: "org-1",
    windowDays: 7,
    startDate: "2026-05-06",
    endDate: "2026-05-12",
    totalCount: 1,
    totalRunsWithSkills: 1,
    evidenceCounts: { used: 1, requested: 0, loaded: 0 },
    skills: [
      {
        key: "build-advisor",
        label: "build-advisor",
        count: 1,
        evidence: "used",
        evidenceCounts: { used: 1, requested: 0, loaded: 0 },
      },
    ],
    days: [
      { date: "2026-05-06", totalCount: 0, runCount: 0, evidenceCounts: { used: 0, requested: 0, loaded: 0 }, skills: [] },
      { date: "2026-05-07", totalCount: 0, runCount: 0, evidenceCounts: { used: 0, requested: 0, loaded: 0 }, skills: [] },
      { date: "2026-05-08", totalCount: 0, runCount: 0, evidenceCounts: { used: 0, requested: 0, loaded: 0 }, skills: [] },
      { date: "2026-05-09", totalCount: 0, runCount: 0, evidenceCounts: { used: 0, requested: 0, loaded: 0 }, skills: [] },
      { date: "2026-05-10", totalCount: 0, runCount: 0, evidenceCounts: { used: 0, requested: 0, loaded: 0 }, skills: [] },
      { date: "2026-05-11", totalCount: 0, runCount: 0, evidenceCounts: { used: 0, requested: 0, loaded: 0 }, skills: [] },
      {
        date: "2026-05-12",
        totalCount: 1,
        runCount: 1,
        evidenceCounts: { used: 1, requested: 0, loaded: 0 },
        skills: [
          {
            key: "build-advisor",
            label: "build-advisor",
            count: 1,
            evidence: "used",
            evidenceCounts: { used: 1, requested: 0, loaded: 0 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("SkillsUsageChart", () => {
  it("uses a low-sample state instead of a large chart for one run with evidence", () => {
    const container = render(<SkillsUsageChart analytics={buildSkillAnalytics()} />);

    expect(container.querySelector('[data-testid="skill-evidence-low-sample"]')).toBeTruthy();
    expect(container.textContent).toContain("Not enough skill usage to chart yet.");
    expect(container.textContent).toContain("1 skill use across 1 run");
    expect(container.textContent).not.toContain("Skill Usage Distribution");
  });

  it("does not expose telemetry evidence categories in the user-facing chart", () => {
    const container = render(<SkillsUsageChart analytics={buildSkillAnalytics({
      totalCount: 3,
      totalRunsWithSkills: 3,
      evidenceCounts: { used: 1, requested: 1, loaded: 1 },
      days: [
        { date: "2026-05-06", totalCount: 1, runCount: 1, evidenceCounts: { used: 1, requested: 0, loaded: 0 }, skills: [{ key: "build-advisor", label: "build-advisor", count: 1, evidence: "used", evidenceCounts: { used: 1, requested: 0, loaded: 0 } }] },
        { date: "2026-05-07", totalCount: 1, runCount: 1, evidenceCounts: { used: 0, requested: 1, loaded: 0 }, skills: [{ key: "prompt-only", label: "prompt-only", count: 1, evidence: "requested", evidenceCounts: { used: 0, requested: 1, loaded: 0 } }] },
        { date: "2026-05-08", totalCount: 1, runCount: 1, evidenceCounts: { used: 0, requested: 0, loaded: 1 }, skills: [{ key: "loaded-only", label: "loaded-only", count: 1, evidence: "loaded", evidenceCounts: { used: 0, requested: 0, loaded: 1 } }] },
      ],
    })} />);

    expect(container.textContent).toContain("Skill Usage Timeline");
    expect(container.textContent).not.toContain("Prompt requested");
    expect(container.textContent).not.toContain("Loaded only");
  });
});
