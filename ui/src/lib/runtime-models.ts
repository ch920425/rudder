import { models as claudeLocalModels } from "@rudderhq/agent-runtime-claude-local";
import { models as codexLocalModels } from "@rudderhq/agent-runtime-codex-local";
import { models as cursorLocalModels } from "@rudderhq/agent-runtime-cursor-local";
import { models as geminiLocalModels } from "@rudderhq/agent-runtime-gemini-local";
import type { AgentRuntimeModel } from "../api/agents";

const FALLBACK_MODELS_BY_RUNTIME: Record<string, readonly AgentRuntimeModel[]> = {
  claude_local: claudeLocalModels,
  codex_local: codexLocalModels,
  cursor: cursorLocalModels,
  gemini_local: geminiLocalModels,
};

export const PROVIDER_MODEL_RUNTIME_TYPES = ["opencode_local", "pi_local"] as const;

export function requiresExplicitProviderModel(agentRuntimeType: string): boolean {
  return PROVIDER_MODEL_RUNTIME_TYPES.includes(
    agentRuntimeType as (typeof PROVIDER_MODEL_RUNTIME_TYPES)[number],
  );
}

export function isProviderModelFormat(model: string): boolean {
  const [provider, modelId] = model.split("/", 2).map((part) => part.trim());
  return Boolean(provider && modelId);
}

export function runtimeModelEmptyLabel(agentRuntimeType: string, required = false): string {
  if (requiresExplicitProviderModel(agentRuntimeType)) return "Select or enter provider/model";
  if (required) return "Select model";
  return "Default";
}

export function runtimeModelSearchPlaceholder(agentRuntimeType: string): string {
  return requiresExplicitProviderModel(agentRuntimeType)
    ? "Search or enter provider/model..."
    : "Search models...";
}

export function runtimeModelEmptyMessage(agentRuntimeType: string, loading = false): string {
  if (loading) return "Loading models...";
  if (agentRuntimeType === "pi_local") {
    return "No models discovered. Run `pi --list-models`, authenticate the provider, or enter provider/model and run Test now.";
  }
  if (agentRuntimeType === "opencode_local") {
    return "No models discovered. Run `opencode models`, authenticate the provider, or enter provider/model and run Test now.";
  }
  return "No models found.";
}

export function explicitProviderModelError(agentRuntimeType: string): string {
  if (agentRuntimeType === "pi_local") {
    return "Pi requires provider/model, for example kimi-coding/kimi-for-coding.";
  }
  if (agentRuntimeType === "opencode_local") {
    return "OpenCode requires provider/model, for example opencode/deepseek-v4-flash-free.";
  }
  return "This runtime requires provider/model.";
}

export function resolveRuntimeModels(
  agentRuntimeType: string,
  ...modelLists: Array<readonly AgentRuntimeModel[] | null | undefined>
): AgentRuntimeModel[] {
  if (agentRuntimeType === "codex_local") {
    return [...codexLocalModels];
  }

  const candidates = [
    ...modelLists.flatMap((models) => models ?? []),
    ...(FALLBACK_MODELS_BY_RUNTIME[agentRuntimeType] ?? []),
  ];
  const seen = new Set<string>();
  const resolved: AgentRuntimeModel[] = [];

  for (const candidate of candidates) {
    const id = candidate.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    resolved.push({
      id,
      label: candidate.label.trim() || id,
    });
  }

  return resolved;
}
