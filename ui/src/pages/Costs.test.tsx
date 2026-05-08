// @vitest-environment node

import type { CostTrendPoint } from "@rudderhq/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CostTrendChart } from "./Costs";

describe("CostTrendChart", () => {
  it("exposes exact daily cost data on each trend bar", () => {
    const rows: CostTrendPoint[] = [
      {
        date: "2026-05-07",
        costCents: 42,
        inputTokens: 1_000,
        cachedInputTokens: 250,
        outputTokens: 75,
        totalTokens: 1_325,
        eventCount: 3,
      },
    ];

    const html = renderToStaticMarkup(
      <CostTrendChart rows={rows} from="2026-05-07T00:00:00.000Z" to="2026-05-07T23:59:59.999Z" />,
    );

    expect(html).toContain(
      'aria-label="May 7, 2026: 1,325 tokens (1,000 input, 250 cached, 75 output), $0.42 estimated spend, 3 events"',
    );
    expect(html).toContain("data-slot=\"tooltip-trigger\"");
    expect(html).toContain("Tokens");
    expect(html).toContain("Estimated spend");
  });
});
