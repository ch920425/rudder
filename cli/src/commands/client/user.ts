import type { UserActivityLedgerItem, UserActivityLedgerResponse } from "@rudderhq/shared";
import { Command } from "commander";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./common.js";

interface UserActivityOptions extends BaseClientOptions {
  orgId?: string;
  user?: string;
  since?: string;
  until?: string;
  include?: string;
  agentId?: string;
  projectId?: string;
  issueId?: string;
  limit?: string;
  cursor?: string;
}

function appendParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value && value.trim()) params.set(key, value.trim());
}

function formatUserActivityItem(item: UserActivityLedgerItem): string {
  const time = new Date(item.occurredAt);
  const hhmm = Number.isNaN(time.getTime())
    ? item.occurredAt
    : time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const related = item.related.find((entry) => entry.type === "issue" || entry.type === "chat" || entry.type === "approval");
  const label = related?.label || related?.id || item.source.id;
  const excerpt = item.excerpt ? ` - ${item.excerpt}` : "";
  return `${hhmm} ${item.kind} ${label}: ${item.summary}${excerpt}`;
}

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("User-oriented Rudder context commands");

  addCommonClientOptions(
    user
      .command("activity")
      .description("List a user's recent Rudder activity ledger")
      .option("-O, --org-id <id>", "Organization ID")
      .option("--user <id>", "User ID or 'me'", "me")
      .option("--since <value>", "Start time: today, 24h, 7d, or ISO timestamp", "today")
      .option("--until <value>", "End time: ISO timestamp")
      .option("--include <items>", "Comma-separated sources: chat,comments,issues,approvals,activity")
      .option("--agent-id <id>", "Filter by related agent ID")
      .option("--project-id <id>", "Filter by related project ID")
      .option("--issue-id <id>", "Filter by related issue ID")
      .option("--limit <n>", "Maximum items to return")
      .option("--cursor <cursor>", "Pagination cursor from a prior response")
      .action(async (opts: UserActivityOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const userId = opts.user?.trim() || "me";
          const params = new URLSearchParams();
          appendParam(params, "since", opts.since);
          appendParam(params, "until", opts.until);
          appendParam(params, "include", opts.include);
          appendParam(params, "agentId", opts.agentId);
          appendParam(params, "projectId", opts.projectId);
          appendParam(params, "issueId", opts.issueId);
          appendParam(params, "limit", opts.limit);
          appendParam(params, "cursor", opts.cursor);

          const query = params.toString();
          const path = `/api/orgs/${ctx.orgId}/users/${encodeURIComponent(userId)}/activity-ledger${query ? `?${query}` : ""}`;
          const result = await ctx.api.get<UserActivityLedgerResponse>(path);

          if (ctx.json) {
            printOutput(result, { json: true });
            return;
          }

          if (!result?.items?.length) {
            printOutput([], { json: false });
            return;
          }

          for (const item of result.items) {
            console.log(formatUserActivityItem(item));
          }
          if (result.nextCursor) {
            console.log(`nextCursor=${result.nextCursor}`);
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
