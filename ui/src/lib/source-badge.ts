export type SourceBadge = {
  key: "feishu";
  label: "Feishu";
};

const SOURCE_KEYS = new Set([
  "channel",
  "channelLabel",
  "channelType",
  "externalSource",
  "from",
  "imProvider",
  "integration",
  "integrationLabel",
  "integrationType",
  "origin",
  "originKind",
  "platform",
  "platformType",
  "provider",
  "source",
  "sourceKind",
  "sourceLabel",
  "sourceName",
  "sourceType",
]);

const NESTED_SOURCE_KEYS = new Set([
  "channel",
  "context",
  "external",
  "integration",
  "metadata",
  "origin",
  "platform",
  "provider",
  "source",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectSourceValues(value: unknown, depth = 0): string[] {
  if (depth > 3 || !isRecord(value)) return [];
  const values: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (SOURCE_KEYS.has(key) && typeof entry === "string") {
      values.push(entry);
      continue;
    }
    if ((SOURCE_KEYS.has(key) || NESTED_SOURCE_KEYS.has(key)) && isRecord(entry)) {
      values.push(...collectSourceValues(entry, depth + 1));
    }
  }
  return values;
}

export function resolveSourceBadge(...sources: unknown[]): SourceBadge | null {
  const values = sources.flatMap((source) => collectSourceValues(source));
  if (values.some((value) => value.trim().toLowerCase().includes("feishu"))) {
    return { key: "feishu", label: "Feishu" };
  }
  return null;
}
