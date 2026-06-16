import type { UsageSummary } from "@rudderhq/agent-runtime-utils";

export type CodexTokenPrice = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const CODEX_MODEL_PRICES: Array<{ pattern: RegExp; price: CodexTokenPrice }> = [
  {
    pattern: /^gpt-5\.5(?:$|-)/i,
    price: { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 },
  },
  {
    pattern: /^gpt-5\.4-mini(?:$|-)/i,
    price: { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
  },
  {
    pattern: /^gpt-5\.4(?:$|-)/i,
    price: { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  },
  {
    pattern: /^gpt-5\.3-codex(?:$|-)/i,
    price: { inputUsdPerMillion: 1.75, cachedInputUsdPerMillion: 0.175, outputUsdPerMillion: 14 },
  },
];

function tokenCount(value: number | null | undefined): number {
  return Math.max(0, Math.floor(typeof value === "number" && Number.isFinite(value) ? value : 0));
}

export function resolveCodexTokenPrice(model: string): CodexTokenPrice | null {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return null;
  return CODEX_MODEL_PRICES.find((entry) => entry.pattern.test(normalized))?.price ?? null;
}

export function estimateCodexCostUsd(model: string, usage: UsageSummary | null | undefined): number | null {
  const price = resolveCodexTokenPrice(model);
  if (!price || !usage) return null;

  const inputTokens = tokenCount(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, tokenCount(usage.cachedInputTokens));
  const outputTokens = tokenCount(usage.outputTokens);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const costUsd =
    (uncachedInputTokens * price.inputUsdPerMillion
      + cachedInputTokens * price.cachedInputUsdPerMillion
      + outputTokens * price.outputUsdPerMillion)
    / 1_000_000;

  return costUsd > 0 ? costUsd : null;
}
