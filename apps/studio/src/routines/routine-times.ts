import type { RunSummary } from "@halonicjs/events";
import { CronError, describeCron, nextRun, occurrences, routineKey } from "@halonicjs/routines";
import type { RoutineNextTimes } from "@halonicjs/studio-feature-routines/api";
import { type PlacedFile, runsOf } from "./routine-reads.ts";

/** How far ahead the next times of a schedule are looked for. */
const LOOK_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** What a routine's times are worked out with: the host's clock, time zone and runs. */
export interface RoutineClock {
  readonly now: () => Date;
  /** The time zone of a schedule that names none. */
  readonly timeZone: string;
  readonly runs: { list(): Promise<readonly { readonly summary: RunSummary }[]> };
}

/** The next `count` times the routine in `hubId` starts on its own; none when it is turned off. */
export async function nextTimesOf(
  hubId: string | null,
  value: PlacedFile["value"],
  count: number,
  clock: RoutineClock,
): Promise<RoutineNextTimes> {
  const none = { times: [], atNextCheck: false };
  if (!value.enabled) return none;
  const now = clock.now();
  try {
    if ("schedule" in value.trigger) {
      const to = new Date(now.getTime() + LOOK_AHEAD_MS);
      const times = occurrences(value.trigger, now, to, count, clock.timeZone);
      return { times: times.map((time) => time.toISOString()), atNextCheck: false };
    }
    if (!("every" in value.trigger)) return none;
    const ran = runsOf(await clock.runs.list(), routineKey({ hub: hubId, routine: value }));
    if (ran.length === 0) return { times: [], atNextCheck: true };
    const times: string[] = [];
    for (let after = now; times.length < count; ) {
      const next = nextRun(value.trigger, after, clock.timeZone);
      if (next === null) break;
      times.push(next.toISOString());
      after = next;
    }
    return { times, atNextCheck: false };
  } catch (error) {
    // A cron or an interval that doesn't parse has no times; `read` lists it among the problems.
    if (error instanceof CronError) return none;
    throw error;
  }
}

/** What the checks of the schedule or interval say, which the file's own checks don't. */
export function triggerProblems(file: PlacedFile, clock: RoutineClock): string[] {
  try {
    const { trigger } = file.value;
    if ("schedule" in trigger) describeCron(trigger.schedule);
    nextRun(trigger, clock.now(), clock.timeZone);
    return [];
  } catch (error) {
    if (error instanceof CronError) return [error.message];
    throw error;
  }
}
