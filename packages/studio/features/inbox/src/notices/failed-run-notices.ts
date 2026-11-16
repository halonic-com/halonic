import type { RunSummary } from "@halonicjs/events";
import { clockTime } from "../plain/waiting-time.ts";

/** A routine's failed runs on one day, as one row of the Inbox's Notices. */
export interface FailedRunNotice {
  readonly kind: "failed-run";
  /** `failed-run:<routine>:<day>`. Holds no account, error text or amount (what a dismissal keeps). */
  readonly key: string;
  readonly routineId: string;
  /** The newest failed run of the day: **Open run** opens it, in its hub. */
  readonly runId: string;
  readonly hubId: string;
  /** ISO time the newest failed run ended. */
  readonly at: string;
  /** How many of the routine's runs failed that day. */
  readonly count: number;
  /** A routine run finished after the newest failed one, so the row says "Fixed". */
  readonly fixed: boolean;
  /** "Daily summary failed at 06:00" or "Daily summary failed · 3 times today". */
  readonly title: string;
}

/** The routine's name for the title, by its key `<hubId>/<routineId>`. */
export type RoutineName = (routineId: string) => string;

/**
 * The failed-run notices in these runs: one per routine per day, newest first. A run you started
 * by hand, a Try it or Test run, a cancelled run and a budget stop make none (requirement
 * `inbox.failed-run-notices`).
 *
 * @example
 * failedRunNotices(await store.list({ status: ["failed", "completed"] }), nameOf, new Date());
 */
export function failedRunNotices(
  runs: readonly RunSummary[],
  routineName: RoutineName,
  now: Date,
): FailedRunNotice[] {
  const failedByRoutineDay = new Map<string, RunSummary[]>();
  const finished = new Map<string, string>();
  for (const run of runs) {
    const routineId = run.trigger?.routineId;
    if (routineId === undefined || run.kind !== "run" || run.endedAt === null) continue;
    if (run.status === "completed") {
      const latest = finished.get(routineId);
      if (latest === undefined || latest < run.endedAt) finished.set(routineId, run.endedAt);
    } else if (run.status === "failed" && run.reason !== "cancelled" && run.reason !== "budget") {
      const key = noticeKey(routineId, localDay(run.endedAt));
      failedByRoutineDay.set(key, [...(failedByRoutineDay.get(key) ?? []), run]);
    }
  }
  const notices = [...failedByRoutineDay.entries()].map(([key, failed]) =>
    notice(key, failed, routineName, finished, now),
  );
  return notices.sort(newestFirst);
}

function notice(
  key: string,
  failed: readonly RunSummary[],
  routineName: RoutineName,
  finished: ReadonlyMap<string, string>,
  now: Date,
): FailedRunNotice {
  const newest = failed.reduce((a, b) => ((a.endedAt ?? "") >= (b.endedAt ?? "") ? a : b));
  const at = newest.endedAt ?? newest.startedAt;
  const routineId = newest.trigger?.routineId ?? "";
  const name = routineName(routineId);
  const day = localDay(at);
  const today = localDay(now.toISOString());
  const count = failed.length;
  const times = day === today ? "times today" : "times that day";
  const title =
    count > 1
      ? `${name} failed · ${count} ${times}`
      : `${name} failed at ${clockTime(new Date(at), now)}`;
  const fixedAt = finished.get(routineId);
  return {
    kind: "failed-run",
    key,
    routineId,
    runId: newest.id,
    hubId: newest.hubId,
    at,
    count,
    fixed: fixedAt !== undefined && fixedAt > at,
    title,
  };
}

function noticeKey(routineId: string, day: string): string {
  return `failed-run:${routineId}:${day}`;
}

function newestFirst(a: FailedRunNotice, b: FailedRunNotice): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}

function localDay(iso: string): string {
  const time = new Date(iso);
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
