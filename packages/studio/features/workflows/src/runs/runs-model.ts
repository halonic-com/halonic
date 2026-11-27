import {
  type RunRow,
  type RunsSource,
  runRow,
  type SourcedRun,
} from "@halonicjs/studio-feature-runs/api";
import { shortTime } from "@halonicjs/studio-kit";
import type { WorkflowRef } from "../api.ts";
import type { RunsLoad } from "./use-runs.ts";

/** How many finished runs the view lists before **See all** (mc 9.7). */
export const EARLIER_LIMIT = 20;

/** The runs of one workflow that a person started or a routine did: test runs are not shown here. */
export function realRunsOf(runs: readonly SourcedRun[], workflow: WorkflowRef): SourcedRun[] {
  return runs.filter(
    ({ summary }) =>
      summary.kind !== "test" &&
      summary.hubId === workflow.hubId &&
      summary.workflowId === workflow.id,
  );
}

/** The two sections of the Runs view: runs still going, then the newest finished ones. */
export interface RunSections {
  readonly now: readonly RunRow[];
  readonly earlier: readonly RunRow[];
  /** Runs that wait for the person, for the amber count on the Runs tab. */
  readonly needYou: number;
}

const going: ReadonlySet<RunRow["standing"]> = new Set(["running", "needs-you", "waiting"]);

/** Whether the run has ended: a run still going has no result to save as a test. */
export function isFinished(row: RunRow): boolean {
  return !going.has(row.standing);
}

/** Splits rows, newest first as given, into Now and the 20 newest Earlier. */
export function runSections(rows: readonly RunRow[]): RunSections {
  return {
    now: rows.filter((row) => going.has(row.standing)),
    earlier: rows.filter(isFinished).slice(0, EARLIER_LIMIT),
    needYou: rows.filter((row) => row.standing === "needs-you").length,
  };
}

/**
 * The rows of the workflow's real runs, in the order given. A row's name says when the run
 * started as its row shows it, the kit's short time in `locale`'s way (`kit.time-stamp`), since
 * this view has no day headings.
 */
export function runRowsOf(
  runs: readonly SourcedRun[],
  workflow: WorkflowRef,
  source: Pick<RunsSource, "workflow" | "routine" | "currency">,
  now: Date,
  locale?: string,
): RunRow[] {
  const currency = source.currency();
  return realRunsOf(runs, workflow).map((run) => {
    const key = run.summary.trigger?.routineId;
    return runRow(run, {
      workflow: source.workflow(run.summary.hubId, run.summary.workflowId),
      routine: key === undefined ? undefined : source.routine(key),
      currency,
      now,
      spokenTime: (startedAt) => spokenShortTime(startedAt, now, locale),
    });
  });
}

/** The kit's short time for a row's name; none for a start the run log couldn't date. */
function spokenShortTime(at: Date, now: Date, locale: string | undefined): string | undefined {
  // `shortTime` throws on an invalid date, which would take the whole view down.
  return Number.isNaN(at.getTime()) ? undefined : shortTime(at, now, locale);
}

/** The amber count on the Runs tab: this workflow's runs that wait for the person; 0 until they load. */
export function runCount(
  load: RunsLoad,
  workflow: WorkflowRef,
  source: Pick<RunsSource, "workflow" | "routine" | "currency">,
): number {
  if (load.kind !== "ready") return 0;
  return runSections(runRowsOf(load.runs, workflow, source, new Date())).needYou;
}
