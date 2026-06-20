import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AUTH_BLOCKER_PATTERNS = [
  {
    code: "provider_503",
    pattern: /\b503\s+Service Unavailable\b|Service temporarily unavailable/i,
    message: "Provider endpoint returned 503 Service Unavailable.",
  },
  {
    code: "invalid_api_key",
    pattern: /\b401\s+Unauthorized\b|invalid_api_key|Incorrect API key/i,
    message: "Provider rejected the configured API key.",
  },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

function deriveCountsFromText(text, slug, marker) {
  const value = String(text ?? "");
  return {
    slugCount: slug ? value.split(slug).length - 1 : 0,
    markerCount: marker ? value.split(marker).length - 1 : 0,
  };
}

function markerCountInJsonFile(filePath, marker) {
  if (!marker) return null;
  if (!fs.existsSync(filePath)) return null;
  const text = readTextIfExists(filePath);
  return text.split(marker).length - 1;
}

export function parsePollutionScanText(input) {
  const text = String(input?.text ?? "");
  const surface = String(input?.surface ?? "worker_pollution_scan");
  const sourcePath = String(input?.path ?? "");
  const results = [];
  const countsByScope = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const absent = line.match(/^ABSENT\s+(.+)$/);
    if (absent) {
      results.push({
        surface,
        path: absent[1],
        slugCount: 0,
        markerCount: 0,
      });
      continue;
    }

    const present = line.match(/^PRESENT\s+(.+)$/);
    if (present) {
      results.push({
        surface,
        path: present[1],
        slugCount: 1,
        markerCount: 0,
      });
      continue;
    }

    const countMatch = line.match(/^(slug|marker)_in_([a-z0-9_]+)=([0-9]+)$/i);
    if (countMatch) {
      const kind = countMatch[1].toLowerCase();
      const scope = countMatch[2];
      const count = Number.parseInt(countMatch[3], 10);
      const existing = countsByScope.get(scope) ?? {
        surface,
        path: scope,
        slugCount: 0,
        markerCount: 0,
      };
      if (kind === "slug") existing.slugCount = count;
      else existing.markerCount = count;
      countsByScope.set(scope, existing);
      continue;
    }

    const existsMatch = line.match(/^([a-z0-9_]+)_exists=(yes|no)$/i);
    if (existsMatch && existsMatch[2].toLowerCase() === "yes") {
      results.push({
        surface,
        path: existsMatch[1],
        slugCount: 1,
        markerCount: 0,
      });
    }
  }

  results.push(...countsByScope.values());
  if (results.length > 0) return results;
  if (/^[a-z0-9_]+=/im.test(text)) return [];
  return [{
    surface,
    path: sourcePath,
    ...deriveCountsFromText(text, input?.slug ?? "", input?.marker ?? ""),
  }];
}

function countRecord(value) {
  return {
    slugCount: Number.isFinite(value?.slugCount) ? value.slugCount : 0,
    markerCount: Number.isFinite(value?.markerCount) ? value.markerCount : 0,
  };
}

function surfaceKey(entry) {
  return `${entry?.surface ?? "unknown"}\u0000${entry?.path ?? ""}`;
}

function metadataCleanupEntry(record) {
  return {
    path: String(record.file ?? record.path ?? ""),
    changed: Boolean(record.changed),
    removedSkillUsage: record.removedSkillUsage ?? null,
  };
}

export function buildPollutionDiff(input) {
  const beforeByKey = new Map(asArray(input?.before).map((entry) => [surfaceKey(entry), entry]));
  const afterByKey = new Map(asArray(input?.after).map((entry) => [surfaceKey(entry), entry]));
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const cleaned = [];
  const residue = [];
  const introduced = [];

  for (const key of keys) {
    const before = beforeByKey.get(key);
    const after = afterByKey.get(key);
    const source = after ?? before ?? {};
    const beforeCounts = countRecord(before);
    const afterCounts = countRecord(after);
    const entry = {
      surface: String(source.surface ?? "unknown"),
      path: String(source.path ?? ""),
      before: beforeCounts,
      after: afterCounts,
    };

    if ((beforeCounts.slugCount > 0 || beforeCounts.markerCount > 0) &&
      afterCounts.slugCount === 0 &&
      afterCounts.markerCount === 0) {
      cleaned.push(entry);
      continue;
    }

    if (afterCounts.slugCount > 0 || afterCounts.markerCount > 0) {
      const target = beforeCounts.slugCount === 0 && beforeCounts.markerCount === 0 ? introduced : residue;
      target.push(entry);
    }
  }

  return {
    slug: String(input?.slug ?? ""),
    marker: String(input?.marker ?? ""),
    cleaned,
    residue,
    introduced,
    metadataCleanup: asArray(input?.cleanupRecords).map(metadataCleanupEntry),
  };
}

function resultContains(text, marker) {
  return typeof text === "string" && marker.length > 0 && text.includes(marker);
}

function rudderCommentContains(comments, expected) {
  return asArray(comments).some((comment) => String(comment).includes(expected));
}

function markerCountsFromRudder(rudder) {
  if (Number.isFinite(rudder?.forbiddenMarkerCount)) {
    return {
      known: true,
      total: Number(rudder.forbiddenMarkerCount),
      counts: { total: Number(rudder.forbiddenMarkerCount) },
    };
  }
  const counts = rudder?.forbiddenMarkerCounts;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    const values = Object.values(counts).filter((value) => Number.isFinite(value));
    if (values.length > 0) {
      return {
        known: true,
        total: values.reduce((sum, value) => sum + Number(value), 0),
        counts,
      };
    }
  }
  return { known: false, total: null, counts: null };
}

function statMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function hasPositiveCleanupEvidence(pollutionDiff) {
  if (asArray(pollutionDiff.cleaned).length > 0) return true;
  return asArray(pollutionDiff.metadataCleanup).some((entry) => entry?.changed === true);
}

export function evaluateProviderProof(input) {
  const provider = String(input?.provider ?? "unknown");
  const runtime = String(input?.runtime ?? provider);
  const marker = String(input?.marker ?? "");
  const allowedMarker = String(input?.rudder?.allowedMarker ?? "");
  const claims = [];
  const blockers = [];
  const limitations = ["provider_native_discovery"];
  const nonProofSignals = [];
  const pollutionDiff = input?.pollutionDiff ?? buildPollutionDiff(input?.pollution ?? {});
  const positiveControl = input?.positiveControl ?? {};
  const rudder = input?.rudder ?? {};
  const markerCounts = markerCountsFromRudder(rudder);

  const positiveControlPassed =
    positiveControl.promptContainsMarker === false &&
    String(positiveControl.beforeResult ?? "").trim() === "SKILL_UNAVAILABLE" &&
    resultContains(String(positiveControl.afterResult ?? ""), marker);
  if (positiveControlPassed) claims.push("provider_home_positive_control_passed");
  else blockers.push({ code: "positive_control_missing", message: "Provider-home positive control did not prove the decoy marker." });

  const rudderNegativePassed =
    rudder.runStatus === "succeeded" &&
    rudder.issueStatus === "done" &&
    markerCounts.known &&
    markerCounts.total === 0 &&
    (allowedMarker.length === 0 || rudderCommentContains(rudder.comments, allowedMarker));
  if (rudderNegativePassed) claims.push("rudder_negative_control_passed");
  else if (!markerCounts.known) {
    blockers.push({ code: "forbidden_marker_counts_missing", message: "Rudder evidence did not include forbidden marker counts for checked run artifacts." });
  } else {
    blockers.push({ code: "rudder_negative_control_missing", message: "Rudder actor-run-chain did not prove allowed marker present with forbidden marker absent." });
  }

  if (asArray(pollutionDiff.residue).length > 0 || asArray(pollutionDiff.introduced).length > 0) {
    blockers.push({ code: "pollution_residue", message: "Provider proof left slug or marker residue on a checked surface." });
  } else if (!hasPositiveCleanupEvidence(pollutionDiff)) {
    blockers.push({ code: "cleanup_evidence_missing", message: "Provider proof did not include positive cleanup evidence." });
  } else {
    claims.push("pollution_cleanup_passed");
  }

  const status =
    blockers.length === 0 ? "passed" :
      blockers.every((blocker) => blocker.code === "forbidden_marker_counts_missing" || blocker.code === "cleanup_evidence_missing") ? "incomplete" :
        "failed";

  return {
    provider,
    runtime,
    status,
    claims,
    blockers,
    limitations,
    nonProofSignals,
    pollutionDiff,
  };
}

function classifyAuthBlockers(attempts) {
  const blockers = [];
  for (const attempt of asArray(attempts)) {
    const text = String(attempt?.text ?? "");
    for (const candidate of AUTH_BLOCKER_PATTERNS) {
      if (!candidate.pattern.test(text)) continue;
      if (blockers.some((blocker) => blocker.code === candidate.code)) continue;
      blockers.push({
        code: candidate.code,
        message: candidate.message,
        attempt: String(attempt?.name ?? ""),
      });
    }
  }
  return blockers;
}

export function evaluateCodexEvidence(input) {
  const authBlockers = classifyAuthBlockers(input?.attempts);
  const debugRegistry = input?.debugRegistry ?? {};
  const pollutionDiff = input?.pollutionDiff ?? buildPollutionDiff(input?.pollution ?? {});
  const blockers = [...authBlockers];

  if (asArray(pollutionDiff.residue).length > 0 || asArray(pollutionDiff.introduced).length > 0) {
    blockers.push({ code: "pollution_residue", message: "Codex proof left slug or marker residue on a checked surface." });
  }

  const nonAuthBlockers = blockers.filter((blocker) => !authBlockers.includes(blocker));

  const mustNotCountAsProof = [];
  if (debugRegistry.containsSlug === true) {
    mustNotCountAsProof.push("debug_registry_contains_slug");
  }

  return {
    provider: "codex",
    runtime: "codex",
    status: authBlockers.length > 0 && nonAuthBlockers.length > 0
      ? "blocked_auth_with_failures"
      : authBlockers.length > 0
        ? "blocked_auth"
        : blockers.length > 0
          ? "failed"
          : "incomplete",
    claims: [],
    blockers,
    nonProofSignals: mustNotCountAsProof,
    limitations: [],
    positiveControlPromptContainsMarker: Boolean(input?.positiveControlPromptContainsMarker),
    pollutionDiff,
  };
}

export function summarizeClaudeEvidence(input) {
  const summary = input?.summary ?? {};
  const marker = firstString(input?.marker, summary.forbiddenMarker);
  const slug = firstString(input?.slug, summary.slug);
  const comments = asArray(summary.rudder?.comment)
    .map((comment) => typeof comment === "string" ? comment : comment?.body)
    .filter((body) => typeof body === "string");
  const forbiddenMarkerCount = Number(
    summary.rudder?.adapter?.forbiddenMarkerCount ??
    summary.rudder?.forbiddenMarkerCount,
  );
  const evaluated = evaluateProviderProof({
    provider: "claude",
    slug,
    marker,
    positiveControl: summary.positiveControl,
    rudder: {
      runStatus: summary.rudder?.runStatus,
      issueStatus: summary.rudder?.issueStatus,
      comments,
      allowedMarker: firstString(input?.allowedMarker, summary.allowedOrgMarker),
      ...(Number.isFinite(forbiddenMarkerCount) ? { forbiddenMarkerCount } : {}),
      forbiddenMarkerCounts: summary.rudder?.adapter?.forbiddenMarkerCounts,
    },
    pollutionDiff: input?.pollutionDiff,
  });

  return {
    ...evaluated,
    proofMode: "replay",
    slug,
    marker,
    source: input?.source ?? null,
    rudder: {
      orgId: summary.rudder?.orgId ?? null,
      agentId: summary.rudder?.agentId ?? null,
      issueId: summary.rudder?.issueId ?? null,
      issueKey: summary.rudder?.issueKey ?? null,
      runId: summary.rudder?.runId ?? null,
      runStatus: summary.rudder?.runStatus ?? null,
      issueStatus: summary.rudder?.issueStatus ?? null,
      forbiddenMarkerCounts: summary.rudder?.adapter?.forbiddenMarkerCounts ?? null,
    },
  };
}

export function summarizeCodexEvidence(input) {
  const summaries = input?.summaries ?? {};
  const attempts = Object.entries(summaries).map(([name, value]) => ({
    name,
    text: firstString(value?.text, value?.textSample, JSON.stringify(value ?? {})),
  }));
  return {
    ...evaluateCodexEvidence({
      slug: input?.slug,
      marker: input?.marker,
      positiveControlPromptContainsMarker: input?.positiveControlPromptContainsMarker,
      attempts,
      debugRegistry: input?.debugPromptInputSummary,
      pollutionDiff: input?.pollutionDiff,
    }),
    proofMode: "replay",
    slug: firstString(input?.slug),
    marker: firstString(input?.marker),
    source: input?.source ?? null,
  };
}

function loadClaudeEvidence(evidenceDir) {
  const summary = readJsonIfExists(path.join(evidenceDir, "summary.json")) ?? {};
  const cleanup = readJsonIfExists(path.join(evidenceDir, "claude-metadata-pollution-cleanup.json")) ?? {};
  const slug = firstString(summary.slug, cleanup.slug);
  const marker = firstString(summary.forbiddenMarker);
  const beforeText = readTextIfExists(path.join(evidenceDir, "pollution-before.txt"));
  const afterText = readTextIfExists(path.join(evidenceDir, "pollution-after-cleanup.txt"));
  const before = beforeText ? parsePollutionScanText({
    surface: "provider_skill_dir",
    path: path.join(evidenceDir, "pollution-before.txt"),
    slug,
    marker,
    text: beforeText,
  }) : [];
  const after = afterText ? parsePollutionScanText({
    surface: "provider_skill_dir",
    path: path.join(evidenceDir, "pollution-after-cleanup.txt"),
    slug,
    marker,
    text: afterText,
  }) : [];
  const pollutionDiff = buildPollutionDiff({
    slug,
    marker,
    before,
    after,
    cleanupRecords: asArray(cleanup.files),
  });
  const forbiddenMarkerCounts = {
    runEvents: markerCountInJsonFile(path.join(evidenceDir, "run-events.json"), marker),
    finalIssue: markerCountInJsonFile(path.join(evidenceDir, "final-issue.json"), marker),
    finalComments: markerCountInJsonFile(path.join(evidenceDir, "final-comments.json"), marker),
    runLog: markerCountInJsonFile(path.join(evidenceDir, "run-log.json"), marker),
  };
  const availableCounts = Object.fromEntries(
    Object.entries(forbiddenMarkerCounts).filter((entry) => Number.isFinite(entry[1])),
  );
  const enrichedSummary = {
    ...summary,
    rudder: {
      ...(summary.rudder ?? {}),
      adapter: {
        ...(summary.rudder?.adapter ?? {}),
        forbiddenMarkerCounts: Object.keys(availableCounts).length > 0 ? availableCounts : summary.rudder?.adapter?.forbiddenMarkerCounts,
      },
    },
  };
  return summarizeClaudeEvidence({
    summary: enrichedSummary,
    pollutionDiff,
    source: {
      evidenceDir,
      summaryPath: path.join(evidenceDir, "summary.json"),
      summaryMtimeMs: statMtimeMs(path.join(evidenceDir, "summary.json")),
      runId: summary.rudder?.runId ?? null,
      generatedFromExistingEvidence: true,
    },
  });
}

function loadCodexEvidence(evidenceDir) {
  const summaries = {};
  for (const fileName of [
    "positive-control-summary.json",
    "positive-control-v2-summary.json",
    "codex-openai-probe-summary.json",
  ]) {
    const parsed = readJsonIfExists(path.join(evidenceDir, fileName));
    if (parsed) summaries[fileName] = parsed;
  }
  const debugPromptInputSummary = readJsonIfExists(path.join(evidenceDir, "positive-control-debug-prompt-input-summary.json")) ?? {};
  const createdEnv = readTextIfExists(path.join(evidenceDir, "positive-control-created.env"));
  const slug = firstString(
    createdEnv.match(/^SLUG=(.+)$/m)?.[1],
    readTextIfExists(path.join(evidenceDir, "positive-control-target-ls.txt")).match(/zst646-forbidden-[^\s/]+/)?.[0],
  );
  const marker = firstString(
    createdEnv.match(/^MARKER=(.+)$/m)?.[1],
    readTextIfExists(path.join(evidenceDir, "positive-control-prompt.txt")).match(/ZST646_FORBIDDEN_[A-Z0-9_]+/)?.[0],
  );
  const beforeText = readTextIfExists(path.join(evidenceDir, "pollution-before.env"));
  const afterText = readTextIfExists(path.join(evidenceDir, "pollution-final.env")) ||
    readTextIfExists(path.join(evidenceDir, "pollution-after-positive-control-cleanup.env"));
  const pollutionDiff = buildPollutionDiff({
    slug,
    marker,
    before: beforeText ? parsePollutionScanText({
      surface: "provider_skill_dir",
      path: path.join(evidenceDir, "pollution-before.env"),
      slug,
      marker,
      text: beforeText,
    }) : [],
    after: afterText ? parsePollutionScanText({
      surface: "provider_skill_dir",
      path: path.join(evidenceDir, "pollution-final.env"),
      slug,
      marker,
      text: afterText,
    }) : [],
  });
  return summarizeCodexEvidence({
    slug,
    marker,
    summaries,
    debugPromptInputSummary,
    pollutionDiff,
    source: {
      evidenceDir,
      summaryPaths: Object.keys(summaries).map((fileName) => path.join(evidenceDir, fileName)),
      summaryMtimeMsByPath: Object.fromEntries(
        Object.keys(summaries).map((fileName) => {
          const summaryPath = path.join(evidenceDir, fileName);
          return [summaryPath, statMtimeMs(summaryPath)];
        }),
      ),
      generatedFromExistingEvidence: true,
    },
  });
}

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1]?.startsWith("--") || argv[index + 1] === undefined ? "true" : argv[++index];
    args[key] = value;
  }
  return args;
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const provider = firstString(args.provider);
  const evidenceDir = firstString(args["evidence-dir"], args.evidenceDir);
  const output = firstString(args.output);
  if (!provider || !evidenceDir) {
    throw new Error("Usage: node scripts/runtime-skill-isolation-proof.mjs --provider <claude|codex> --evidence-dir <dir> [--output <file>]");
  }

  const result = provider === "claude"
    ? loadClaudeEvidence(evidenceDir)
    : provider === "codex"
      ? loadCodexEvidence(evidenceDir)
      : (() => { throw new Error(`Unsupported provider: ${provider}`); })();
  const json = `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceDir,
    result,
  }, null, 2)}\n`;
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, json, "utf8");
  } else {
    process.stdout.write(json);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
