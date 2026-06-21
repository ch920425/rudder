import type { InstanceSchedulerHeartbeatAgent } from "@rudderhq/shared";
import {
  AGENT_RUN_LIST_AGENT_LIMIT,
  AGENT_RUN_LIST_COMPACT_LIMIT,
  AGENT_RUN_LIST_DEFAULT_LIMIT,
  AGENT_RUN_LIST_HISTORY_LIMIT,
  agentRunsApi,
  type ActiveRunForIssue,
  type AgentRunListFilters,
  type LiveRunForIssue,
} from "./agent-runs";
import { api } from "./client";

export {
  AGENT_RUN_LIST_AGENT_LIMIT as HEARTBEAT_RUN_LIST_AGENT_LIMIT,
  AGENT_RUN_LIST_COMPACT_LIMIT as HEARTBEAT_RUN_LIST_COMPACT_LIMIT,
  AGENT_RUN_LIST_DEFAULT_LIMIT as HEARTBEAT_RUN_LIST_DEFAULT_LIMIT,
  AGENT_RUN_LIST_HISTORY_LIMIT as HEARTBEAT_RUN_LIST_HISTORY_LIMIT,
  type ActiveRunForIssue,
  type AgentRunListFilters as HeartbeatRunListFilters,
  type LiveRunForIssue,
};

export const schedulerHeartbeatsApi = {
  listInstanceSchedulerAgents: () =>
    api.get<InstanceSchedulerHeartbeatAgent[]>("/instance/scheduler-heartbeats"),
};

export const heartbeatsApi = {
  ...agentRunsApi,
  listInstanceSchedulerAgents: schedulerHeartbeatsApi.listInstanceSchedulerAgents,
};
