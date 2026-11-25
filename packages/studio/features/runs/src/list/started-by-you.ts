import type { RunSummary } from "@halonicjs/events";

/**
 * Whether the person started the run themselves: the runs whose row says "You, …" (`startedBy`
 * in `run-row.ts`). That is Run, Run now, the Inbox, the terminal, and a trigger this Studio
 * doesn't know yet. A routine's clock, mail, a signal, a webhook or a parent run is not. The run
 * notifications' "When a run I started finishes" reads this, so it never disagrees with the row.
 */
export function startedByYou(summary: Pick<RunSummary, "trigger" | "parentRunId">): boolean {
  if (summary.parentRunId !== null) return false;
  switch (summary.trigger?.type) {
    case "schedule":
    case "every":
    case "mail":
    case "signal":
    case "webhook":
      return false;
    default:
      return true;
  }
}
