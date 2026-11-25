import type { AllRunsRow } from "../app/source-rows.ts";
import type { NotifiableRun } from "./run-notices.ts";

/**
 * A row of the Runs app as the run notifications read it: the agent's name for a team's run, the
 * workflow's name for a workspace's run, and what the row's `notice` says.
 *
 * @example
 * watchRunNotifications({ read: async () => rows.map(notifiableRun), … }, notifier, options);
 */
export function notifiableRun(row: AllRunsRow): NotifiableRun {
  const { notice } = row;
  return {
    id: row.id,
    phase: row.phase,
    kind: row.by.kind,
    name: row.by.kind === "agent" ? row.by.name : row.title,
    where: row.where,
    startedAt: row.startedAt,
    startedByMe: notice.startedByMe,
    cost: row.cost,
    ...(notice.tookMs === undefined ? {} : { tookMs: notice.tookMs }),
    ...(notice.failedStep === undefined ? {} : { failedStep: notice.failedStep }),
    ...(notice.task === undefined ? {} : { task: notice.task }),
  };
}
