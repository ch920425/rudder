export interface TokenUsageParts {
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
}

export interface TokenUsageSummary {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  uncachedInputTokens: number;
  promptTokens: number;
  totalTokens: number;
}

function tokenCount(value: number | null | undefined): number {
  return Math.max(0, Math.floor(typeof value === "number" && Number.isFinite(value) ? value : 0));
}

export function summarizeTokenUsage(parts: TokenUsageParts): TokenUsageSummary {
  const inputTokens = tokenCount(parts.inputTokens);
  const cachedInputTokens = tokenCount(parts.cachedInputTokens);
  const outputTokens = tokenCount(parts.outputTokens);
  const cachedIsInputSubset = cachedInputTokens <= inputTokens;
  const uncachedInputTokens = cachedIsInputSubset
    ? inputTokens - cachedInputTokens
    : inputTokens;
  const promptTokens = cachedIsInputSubset
    ? inputTokens
    : inputTokens + cachedInputTokens;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    uncachedInputTokens,
    promptTokens,
    totalTokens: promptTokens + outputTokens,
  };
}

export function tokenUsageCacheRatio(parts: TokenUsageParts): number | null {
  const summary = summarizeTokenUsage(parts);
  if (summary.promptTokens <= 0) return null;
  return summary.cachedInputTokens / summary.promptTokens;
}

export function hasTokenUsage(parts: TokenUsageParts): boolean {
  const summary = summarizeTokenUsage(parts);
  return summary.totalTokens > 0 || summary.cachedInputTokens > 0;
}
