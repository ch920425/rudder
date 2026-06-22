import { describe, expect, it } from "vitest";
import {
  formatAgentConfigurationListRow,
  type AgentConfigurationRow,
} from "../commands/client/agent.js";

describe("agent command formatting", () => {
  it("includes both title and role in human-readable agent config list rows", () => {
    const row: AgentConfigurationRow = {
      id: "f359de4d-ba27-4357-ad15-22d7ca0adbb7",
      orgId: "7af5bf6d-195c-4792-8d8b-7fb7a7df3119",
      name: "Wesley",
      title: "Operator Assistant",
      role: "ceo",
      status: "idle",
      reportsTo: null,
      agentRuntimeType: "codex_local",
      agentRuntimeConfig: { model: "gpt-5.5" },
      runtimeConfig: {},
      permissions: { canCreateAgents: true },
      updatedAt: "2026-06-22T20:52:37.973Z",
    };

    const output = formatAgentConfigurationListRow(row);

    expect(output).toContain("id=f359de4dba27");
    expect(output).toContain("name=Wesley");
    expect(output).toContain("title=Operator Assistant");
    expect(output).toContain("role=ceo");
    expect(output).toContain("agentRuntimeType=codex_local");
  });
});
