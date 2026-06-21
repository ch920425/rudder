import type { AgentRun } from "@rudderhq/shared";
import { agentRunsApi } from "../api/agent-runs";

export async function retryAgentRun(run: Pick<AgentRun, "id">) {
  return agentRunsApi.retry(run.id);
}
