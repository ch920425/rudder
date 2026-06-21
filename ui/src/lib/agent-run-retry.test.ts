// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentRunsApi } from "../api/agent-runs";
import { retryAgentRun } from "./agent-run-retry";

describe("retryAgentRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the dedicated agent run retry API with the original run id", async () => {
    const retrySpy = vi.spyOn(agentRunsApi, "retry").mockResolvedValue({ id: "retry-run-1" } as any);

    await retryAgentRun({ id: "run-1" });

    expect(retrySpy).toHaveBeenCalledWith("run-1");
  });
});
