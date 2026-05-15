import type { HeartbeatRun } from "@rudderhq/shared";
import { stripBenignStderr } from "./benign-stderr";

type RunStderrExcerptInput = Pick<HeartbeatRun, "status" | "stderrExcerpt">;

export function getRunStderrExcerptDisplayText(run: RunStderrExcerptInput): string {
  return stripBenignStderr(run.stderrExcerpt ?? "");
}

export function shouldShowRunStderrExcerpt(run: RunStderrExcerptInput): boolean {
  if (!getRunStderrExcerptDisplayText(run)) return false;
  return run.status === "failed" || run.status === "timed_out";
}
