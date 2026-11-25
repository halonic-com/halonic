// When the engine's next routine is due, for the tray's "next routine at
// 14:00" (HAL-18279): the same next run the Routines list shows, the earliest
// of the routines that are on.
import { CronError, nextRun, type PlacedRoutine } from "@halonicjs/routines";

/**
 * When the first of `routines` is due to start on its own after `after`, as
 * an ISO time, or `null` when none is. A routine that is off, has no clock
 * (manual, signal, mail and webhook triggers) or whose schedule doesn't parse
 * has no next start; the scheduler skips a broken one too, so it doesn't hide
 * the others.
 *
 * @param timeZone the zone for schedules that name none, as the scheduler's tick policy has it
 */
export function nextRoutineAt(
  routines: readonly PlacedRoutine[],
  after: Date,
  timeZone: string,
): string | null {
  let earliest: Date | null = null;
  for (const { routine } of routines) {
    if (!routine.enabled) continue;
    const next = nextStart(routine.trigger, after, timeZone);
    if (next !== null && (earliest === null || next < earliest)) earliest = next;
  }
  return earliest?.toISOString() ?? null;
}

function nextStart(
  trigger: PlacedRoutine["routine"]["trigger"],
  after: Date,
  timeZone: string,
): Date | null {
  try {
    return nextRun(trigger, after, timeZone);
  } catch (error) {
    if (error instanceof CronError) return null;
    throw error;
  }
}
