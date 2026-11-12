// What a run a routine started can say about that routine (HAL-7094): its
// name, and when it runs in `halonic routines`' words, for the Runs list's
// Started by column.

import type { RoutineTrigger } from "@halonicjs/format";
import { CronError, describeCron, describeTrigger, routineKey } from "@halonicjs/routines";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { placedRoutines } from "./workspace-routines.ts";

/** A routine as the runs it started name it. */
export interface RoutineClock {
  readonly name: string;
  /**
   * When it runs on its own: a schedule without its time zone, "Weekdays at
   * 08:00", or an interval, "Every 2 hours (UTC)". `undefined` when its
   * trigger isn't a clock, or its schedule doesn't parse.
   */
  readonly schedule: string | undefined;
}

/**
 * Every routine of the workspace by its key, the `trigger.routineId` of the
 * runs it starts.
 *
 * @example
 * routineClocks(workspace).get("reports/weekly");
 * // { name: "Weekly report", schedule: "Mondays at 09:00" }
 */
export function routineClocks(workspace: LoadedWorkspace): Map<string, RoutineClock> {
  return new Map(
    placedRoutines(workspace).map((placed) => [
      routineKey(placed),
      { name: placed.routine.name, schedule: scheduleWords(placed.routine.trigger) },
    ]),
  );
}

// A run's row already says when it started, so the time zone would only
// repeat it. An interval keeps its "(UTC)": its slots count in UTC.
function scheduleWords(trigger: RoutineTrigger): string | undefined {
  if ("every" in trigger) return describeTrigger(trigger);
  if (!("schedule" in trigger)) return undefined;
  try {
    return describeCron(trigger.schedule);
  } catch (error) {
    if (error instanceof CronError) return undefined;
    throw error;
  }
}
