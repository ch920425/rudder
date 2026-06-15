import { describe, expect, it } from "vitest";
import { defaultPermissionsForRole, normalizeAgentPermissions } from "./agent-permissions.js";

describe("agent permission defaults", () => {
  it("allows every role to create agents by default", () => {
    expect(defaultPermissionsForRole("engineer").canCreateAgents).toBe(true);
    expect(defaultPermissionsForRole("reviewer").canCreateAgents).toBe(true);
    expect(defaultPermissionsForRole("ceo").canCreateAgents).toBe(true);
  });

  it("applies the creation default when stored permissions omit the field", () => {
    expect(normalizeAgentPermissions({}, "engineer").canCreateAgents).toBe(true);
    expect(normalizeAgentPermissions(null, "engineer").canCreateAgents).toBe(true);
  });

  it("preserves explicit agent creation denials", () => {
    expect(
      normalizeAgentPermissions({ canCreateAgents: false }, "engineer").canCreateAgents,
    ).toBe(false);
  });
});
