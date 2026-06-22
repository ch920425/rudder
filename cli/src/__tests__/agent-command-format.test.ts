import { describe, expect, it } from "vitest";
import {
  formatAgentConfigurationListRow,
  formatAgentListRow,
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

  it("includes title in human-readable agent list rows", () => {
    const output = formatAgentListRow({
      id: "b9e52652-6652-4b9b-a6f2-5d9515f4f1b8",
      orgId: "7af5bf6d-195c-4792-8d8b-7fb7a7df3119",
      name: "Maya",
      title: "Meeting Notes Workflow Agent",
      role: "general",
      icon: null,
      status: "idle",
      shortRef: "agt_b9e52652",
      urlKey: "maya",
      reportsTo: "f359de4d-ba27-4357-ad15-22d7ca0adbb7",
      capabilities: null,
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      pauseReason: null,
      pausedAt: null,
      agentRuntimeType: "codex_local",
      agentRuntimeConfig: {},
      runtimeConfig: {},
      permissions: { canCreateAgents: false, canManageSkills: false },
      lastHeartbeatAt: null,
      metadata: null,
      createdAt: new Date("2026-06-22T20:52:37.950Z"),
      updatedAt: new Date("2026-06-22T20:52:37.950Z"),
    });

    expect(output).toContain("shortRef=agt_b9e52652");
    expect(output).toContain("name=Maya");
    expect(output).toContain("title=Meeting Notes Workflow Agent");
    expect(output).toContain("role=general");
  });
});
