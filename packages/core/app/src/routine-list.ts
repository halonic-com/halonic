// A workspace's routines as a list, for `halonic routines` (HAL-4844): what
// starts each one in words, when it runs next on its own, and the last run it
// started. The words and times come from `@halonicjs/routines`, so the list
// says what the routine scheduler does.

import type { RunSummary } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { CronError, describeTrigger, nextRun, routineKey } from "@halonicjs/routines";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { placedRoutines } from "./workspace-routines.ts";

/** One routine of the list. */
export interface ListedRoutine {
  /** `<hub>/<routine id>`, or `@workspace/<routine id>` outside a hub: its runs' `trigger.routineId`. */
  key: string;
  /** The hub folder it sits in, or `null` at the workspace root. */
  hubId: string | null;
  routineId: string;
  name: string;
  /** Whether it is on (`enabled`); one that is off never runs on its own. */
  enabled: boolean;
  /** What starts it, in words: "Mondays at 09:00", "Every 15 minutes", "Manual only". */
  trigger: string;
  /**
   * The ISO time it next runs on its own. `null` when it is off, when its
   * trigger isn't a clock (manual, signal, mail), or when its schedule
   * doesn't parse, which `trigger` then says.
   */
  nextRun: string | null;
  /** The newest real run it started, or `null` if it never started one. */
  lastRun: RunSummary | null;
}

/** Lists a workspace's routines with their next and last runs, from its {@link RunStore}. */
export class RoutineList {
  readonly #runs: Pick<RunStore, "list">;

  constructor(runs: Pick<RunStore, "list">) {
    this.#runs = runs;
  }

  /**
   * Every routine file of the workspace that parsed, in the order of the
   * files' paths (requirement `app.routine-list`).
   *
   * @param now - the next run is the first one after it
   * @param timeZone - the zone of a schedule that names none: the computer's
   *   own, as the routine scheduler's tick policy has it
   *
   * @example
   * await new RoutineList(runStore).listRoutines(workspace, new Date(), "Europe/Amsterdam");
   * // [{ key: "reports/weekly-report", trigger: "Mondays at 09:00", nextRun: "2026-11-16T08:00:00.000Z", lastRun: null, … }]
   */
  async listRoutines(
    workspace: LoadedWorkspace,
    now: Date,
    timeZone: string,
  ): Promise<ListedRoutine[]> {
    const lastRuns = newestPerRoutine(await this.#runs.list({ kind: "run" }));
    return placedRoutines(workspace).map((placed) => {
      const { routine } = placed;
      const key = routineKey(placed);
      return {
        key,
        hubId: placed.hub,
        routineId: routine.id,
        name: routine.name,
        enabled: routine.enabled,
        trigger: describeTrigger(routine.trigger),
        nextRun: routine.enabled ? nextRunOf(routine.trigger, now, timeZone) : null,
        lastRun: lastRuns.get(key) ?? null,
      };
    });
  }
}

/** The newest run of each routine, by its key; `runs` come newest first, as `RunStore.list` gives them. */
function newestPerRoutine(runs: readonly RunSummary[]): Map<string, RunSummary> {
  const newest = new Map<string, RunSummary>();
  for (const run of runs) {
    const key = run.trigger?.routineId;
    if (key !== undefined && !newest.has(key)) {
      newest.set(key, run);
    }
  }
  return newest;
}

/**
 * The next run as ISO text, or `null`. A schedule that doesn't parse has no
 * next run: `describeTrigger` already says it doesn't parse, and the routine
 * scheduler skips it, so the list doesn't fail for one broken routine.
 */
function nextRunOf(
  trigger: Parameters<typeof nextRun>[0],
  now: Date,
  timeZone: string,
): string | null {
  try {
    return nextRun(trigger, now, timeZone)?.toISOString() ?? null;
  } catch (error) {
    if (error instanceof CronError) {
      return null;
    }
    throw error;
  }
}
