import { describe, expect, it } from "vitest";
import {
  buildPollutionDiff,
  evaluateCodexEvidence,
  evaluateProviderProof,
  parsePollutionScanText,
  summarizeClaudeEvidence,
  summarizeCodexEvidence,
} from "./runtime-skill-isolation-proof.mjs";

describe("ZST-646 provider forbidden-marker proof harness", () => {
  it("treats provider metadata cleanup as first-class pollutionDiff evidence", () => {
    const diff = buildPollutionDiff({
      slug: "zst646-forbidden-claude",
      marker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      before: [
        { surface: "provider_metadata", path: "/Users/test/.claude.json", slugCount: 1, markerCount: 0 },
        { surface: "provider_skill_dir", path: "/Users/test/.claude/skills/zst646-forbidden-claude", slugCount: 1, markerCount: 1 },
      ],
      after: [
        { surface: "provider_metadata", path: "/Users/test/.claude.json", slugCount: 0, markerCount: 0 },
        { surface: "provider_skill_dir", path: "/Users/test/.claude/skills/zst646-forbidden-claude", slugCount: 0, markerCount: 0 },
      ],
      cleanupRecords: [
        {
          file: "/Users/test/.claude.json",
          changed: true,
          removedSkillUsage: { usageCount: 1, lastUsedAt: 1781990034091 },
        },
      ],
    });

    expect(diff.residue).toEqual([]);
    expect(diff.cleaned).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: "provider_metadata",
        path: "/Users/test/.claude.json",
        before: { slugCount: 1, markerCount: 0 },
        after: { slugCount: 0, markerCount: 0 },
      }),
      expect.objectContaining({
        surface: "provider_skill_dir",
        path: "/Users/test/.claude/skills/zst646-forbidden-claude",
      }),
    ]));
    expect(diff.metadataCleanup).toEqual([
      expect.objectContaining({
        path: "/Users/test/.claude.json",
        removedSkillUsage: { usageCount: 1, lastUsedAt: 1781990034091 },
      }),
    ]);
  });

  it("parses worker pollution scan status instead of counting slugs in ABSENT evidence lines", () => {
    expect(parsePollutionScanText({
      surface: "provider_skill_dir",
      path: "/tmp/pollution-after-cleanup.txt",
      slug: "zst646-forbidden-claude",
      marker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      text: [
        "timestamp=2026-06-20T21:28:39Z",
        "after_cleanup",
        "ABSENT /Users/test/.claude/skills/zst646-forbidden-claude",
      ].join("\n"),
    })).toEqual([
      {
        surface: "provider_skill_dir",
        path: "/Users/test/.claude/skills/zst646-forbidden-claude",
        slugCount: 0,
        markerCount: 0,
      },
    ]);

    expect(parsePollutionScanText({
      surface: "provider_skill_dir",
      path: "/tmp/pollution-final.env",
      slug: "zst646-forbidden-codex",
      marker: "ZST646_FORBIDDEN_CODEX_GLOBAL",
      text: [
        "global_path=/Users/test/.codex/skills/zst646-forbidden-codex",
        "global_exists=no",
        "marker_in_codex_skills=0",
        "slug_in_codex_skills=0",
      ].join("\n"),
    })).toEqual([
      expect.objectContaining({
        surface: "provider_skill_dir",
        path: "codex_skills",
        slugCount: 0,
        markerCount: 0,
      }),
    ]);

    expect(parsePollutionScanText({
      surface: "provider_skill_dir",
      path: "/tmp/pollution-before.env",
      slug: "zst646-forbidden-codex",
      marker: "ZST646_FORBIDDEN_CODEX_GLOBAL",
      text: [
        "slug=zst646-forbidden-codex",
        "global_target=/Users/test/.codex/skills/zst646-forbidden-codex",
        "global_before_exists=no",
        "agents_home_before_exists=no",
      ].join("\n"),
    })).toEqual([]);
  });

  it("passes a Claude proof only when positive control, Rudder negative control, and cleanup all hold", () => {
    const result = evaluateProviderProof({
      provider: "claude",
      slug: "zst646-forbidden-claude",
      marker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      positiveControl: {
        promptContainsMarker: false,
        beforeResult: "SKILL_UNAVAILABLE",
        afterResult: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      },
      rudder: {
        runStatus: "succeeded",
        issueStatus: "done",
        comments: ["ZST646_ALLOWED_CLAUDE_ORG_SKILL\n\nFORBIDDEN_MARKER_ABSENT"],
        allowedMarker: "ZST646_ALLOWED_CLAUDE_ORG_SKILL",
        forbiddenMarkerCount: 0,
      },
      pollutionDiff: {
        residue: [],
        cleaned: [{ surface: "provider_metadata", path: "/Users/test/.claude.json" }],
        introduced: [],
        metadataCleanup: [{ path: "/Users/test/.claude.json", changed: true }],
      },
    });

    expect(result.status).toBe("passed");
    expect(result.claims).toContain("provider_home_positive_control_passed");
    expect(result.claims).toContain("rudder_negative_control_passed");
    expect(result.limitations).toContain("provider_native_discovery");
  });

  it("does not pass a provider proof when forbidden marker counts are missing", () => {
    const result = evaluateProviderProof({
      provider: "claude",
      slug: "zst646-forbidden-claude",
      marker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      positiveControl: {
        promptContainsMarker: false,
        beforeResult: "SKILL_UNAVAILABLE",
        afterResult: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      },
      rudder: {
        runStatus: "succeeded",
        issueStatus: "done",
        comments: ["ZST646_ALLOWED_CLAUDE_ORG_SKILL\n\nFORBIDDEN_MARKER_ABSENT"],
        allowedMarker: "ZST646_ALLOWED_CLAUDE_ORG_SKILL",
      },
      pollutionDiff: {
        residue: [],
        cleaned: [{ surface: "provider_skill_dir", path: "/Users/test/.claude/skills/zst646-forbidden-claude" }],
        introduced: [],
        metadataCleanup: [],
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "forbidden_marker_counts_missing",
    }));
  });

  it("does not pass cleanup when no cleanup evidence was captured", () => {
    const result = evaluateProviderProof({
      provider: "claude",
      slug: "zst646-forbidden-claude",
      marker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      positiveControl: {
        promptContainsMarker: false,
        beforeResult: "SKILL_UNAVAILABLE",
        afterResult: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      },
      rudder: {
        runStatus: "succeeded",
        issueStatus: "done",
        comments: ["ZST646_ALLOWED_CLAUDE_ORG_SKILL\n\nFORBIDDEN_MARKER_ABSENT"],
        allowedMarker: "ZST646_ALLOWED_CLAUDE_ORG_SKILL",
        forbiddenMarkerCount: 0,
      },
      pollutionDiff: {
        residue: [],
        cleaned: [],
        introduced: [],
        metadataCleanup: [],
      },
    });

    expect(result.status).toBe("incomplete");
    expect(result.blockers).toContainEqual(expect.objectContaining({
      code: "cleanup_evidence_missing",
    }));
  });

  it("classifies Codex sampling failures as blocked_auth instead of proof failure", () => {
    const result = evaluateCodexEvidence({
      slug: "zst646-forbidden-codex",
      marker: "ZST646_FORBIDDEN_CODEX_GLOBAL",
      positiveControlPromptContainsMarker: false,
      attempts: [
        {
          name: "custom-endpoint",
          text: "unexpected status 503 Service Unavailable: Service temporarily unavailable",
        },
        {
          name: "direct-openai",
          text: "unexpected status 401 Unauthorized: Incorrect API key provided; auth error code: invalid_api_key",
        },
      ],
      debugRegistry: {
        containsSlug: true,
        containsMarker: false,
      },
      pollutionDiff: {
        residue: [],
        cleaned: [{ surface: "provider_skill_dir", path: "/Users/test/.codex/skills/zst646-forbidden-codex" }],
        introduced: [],
        metadataCleanup: [],
      },
    });

    expect(result.status).toBe("blocked_auth");
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "provider_503" }),
      expect.objectContaining({ code: "invalid_api_key" }),
    ]));
    expect(result.nonProofSignals).toContain("debug_registry_contains_slug");
  });

  it("does not let blocked_auth mask non-auth cleanup failures", () => {
    const result = evaluateCodexEvidence({
      slug: "zst646-forbidden-codex",
      marker: "ZST646_FORBIDDEN_CODEX_GLOBAL",
      positiveControlPromptContainsMarker: false,
      attempts: [
        {
          name: "custom-endpoint",
          text: "unexpected status 503 Service Unavailable: Service temporarily unavailable",
        },
      ],
      debugRegistry: {
        containsSlug: true,
        containsMarker: false,
      },
      pollutionDiff: {
        residue: [{ surface: "provider_skill_dir", path: "/Users/test/.codex/skills/zst646-forbidden-codex" }],
        cleaned: [],
        introduced: [],
        metadataCleanup: [],
      },
    });

    expect(result.status).toBe("blocked_auth_with_failures");
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      "provider_503",
      "pollution_residue",
    ]));
  });

  it("normalizes existing Claude worker evidence into the reusable result schema", () => {
    const result = summarizeClaudeEvidence({
      summary: {
        slug: "zst646-forbidden-claude",
        forbiddenMarker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
        positiveControl: {
          promptContainsMarker: false,
          beforeResult: "SKILL_UNAVAILABLE",
          afterResult: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
        },
        rudder: {
          runStatus: "succeeded",
          issueStatus: "done",
          comment: [{ body: "ZST646_ALLOWED_CLAUDE_ORG_SKILL\nFORBIDDEN_MARKER_ABSENT" }],
          adapter: { forbiddenMarkerCounts: { runEvents: 0, finalIssue: 0, finalComments: 0, runLog: 0 } },
        },
        allowedOrgMarker: "ZST646_ALLOWED_CLAUDE_ORG_SKILL",
      },
      source: {
        summaryPath: "/tmp/proof/summary.json",
        summaryMtimeMs: 1781991000000,
        runId: "run-1",
        generatedFromExistingEvidence: true,
      },
      pollutionDiff: {
        residue: [],
        cleaned: [{ surface: "provider_metadata", path: "/Users/test/.claude.json" }],
        introduced: [],
        metadataCleanup: [{ path: "/Users/test/.claude.json", changed: true }],
      },
    });

    expect(result).toEqual(expect.objectContaining({
      provider: "claude",
      runtime: "claude",
      status: "passed",
      proofMode: "replay",
      source: {
        summaryPath: "/tmp/proof/summary.json",
        summaryMtimeMs: 1781991000000,
        runId: "run-1",
        generatedFromExistingEvidence: true,
      },
      slug: "zst646-forbidden-claude",
      marker: "ZST646_FORBIDDEN_CLAUDE_GLOBAL",
      nonProofSignals: [],
    }));
    expect(result.limitations).toContain("provider_native_discovery");
    expect(result.rudder).toEqual(expect.objectContaining({
      runStatus: "succeeded",
      issueStatus: "done",
      runId: null,
      forbiddenMarkerCounts: { runEvents: 0, finalIssue: 0, finalComments: 0, runLog: 0 },
    }));
  });

  it("normalizes existing Codex worker summaries into blocked_auth schema", () => {
    const result = summarizeCodexEvidence({
      slug: "zst646-forbidden-codex",
      marker: "ZST646_FORBIDDEN_CODEX_GLOBAL",
      summaries: {
        "positive-control-v2-summary.json": {
          textSample: "unexpected status 503 Service Unavailable: Service temporarily unavailable",
        },
        "codex-openai-probe-summary.json": {
          text: "unexpected status 401 Unauthorized: auth error code: invalid_api_key",
        },
      },
      debugPromptInputSummary: {
        containsSlug: true,
        containsMarker: false,
      },
      pollutionDiff: {
        residue: [],
        cleaned: [{ surface: "provider_skill_dir", path: "/Users/test/.codex/skills/zst646-forbidden-codex" }],
        introduced: [],
        metadataCleanup: [],
      },
    });

    expect(result.status).toBe("blocked_auth");
    expect(result.runtime).toBe("codex");
    expect(result.claims).toEqual([]);
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      "provider_503",
      "invalid_api_key",
    ]));
    expect(result.nonProofSignals).toContain("debug_registry_contains_slug");
  });
});
