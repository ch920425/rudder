import type { HeartbeatRun } from "@rudderhq/shared";

type RunStderrExcerptInput = Pick<HeartbeatRun, "status" | "stderrExcerpt">;

export function shouldShowRunStderrExcerpt(run: RunStderrExcerptInput): boolean {
  if (!run.stderrExcerpt?.trim()) return false;
  return run.status === "failed" || run.status === "timed_out";
}
