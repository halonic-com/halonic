// The lines `halonic routines watch` prints for the runs its ticks start.
// They wait until the watching line is out (HAL-5164): the catch-up tick runs
// before that line, and a scheduled tick that fires while it is slow would
// otherwise print its runs above the line that says the watch has begun.

import { shortRunId } from "@halonicjs/app";
import type { RoutineTickResult } from "@halonicjs/app/routines";
import { type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { CommandContext } from "../../command.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { type RunClock, startedAt } from "../../run-times.ts";

/** A routine run the watch started, as `--json` gives it. */
export interface StartedRoutineRun {
  readonly key: string;
  readonly runId: string;
  /** ISO time it was due, or the time its signal was sent. */
  readonly at: string;
}

/** Prints the runs of each tick, from {@link WatchReport.open} on. */
export interface WatchReport {
  /** Keeps the tick's started runs for `--json`, and prints a line for each run it started or failed to start. */
  tick(result: RoutineTickResult): void;
  /** Prints the lines held until now, in the order their ticks ended, and every later tick's straight away. */
  open(): void;
  readonly started: readonly StartedRoutineRun[];
}

/**
 * The report of a watch over `routines`, the routines as the last tick
 * listed them, so a routine renamed in a newer version shows its new name.
 * It holds every line until {@link WatchReport.open}, which the watch calls
 * once its watching line is out.
 */
export function watchReport(
  context: Pick<CommandContext, "printAhead" | "debug">,
  clock: () => RunClock,
  routines: () => readonly PlacedRoutine[],
): WatchReport {
  const routineOf = (key: string) =>
    routines().find((placed) => routineKey(placed) === key)?.routine;
  const nameOf = (key: string) => printable(routineOf(key)?.name ?? key);
  // The signal a routine starts on, by name; a signal's id names only the run that sent it.
  const signalOf = (key: string) => {
    const trigger = routineOf(key)?.trigger;
    return printable(trigger && "signal" in trigger ? trigger.signal.name : "");
  };
  const started: StartedRoutineRun[] = [];
  let held: RoutineTickResult[] | undefined = [];

  const print = (result: RoutineTickResult) => {
    const now = clock();
    for (const run of result.started) {
      const { key, runId, at } = startedRun(run);
      const onSignal = run.trigger?.type === "signal";
      const when = startedAt(new Date(at), now);
      const line = onSignal
        ? routinesMessages.startedOnSignal(nameOf(key), shortRunId(runId), signalOf(key), when)
        : routinesMessages.started(nameOf(key), shortRunId(runId), when);
      context.printAhead(line.phrase);
    }
    for (const { key } of result.refusedLoops) {
      context.printAhead(routinesMessages.refusedLoop(nameOf(key), signalOf(key)).phrase);
    }
    for (const failure of result.failed) {
      context.printAhead(
        routinesMessages.notStarted(nameOf(failure.key), startedAt(new Date(failure.at), now))
          .phrase,
      );
      context.debug(
        routinesMessages.notStartedWhy(printable(failure.key), printable(failure.error.message))
          .phrase,
      );
    }
  };

  return {
    started,
    tick(result) {
      started.push(...result.started.map(startedRun));
      if (held === undefined) print(result);
      else held.push(result);
    },
    open() {
      const due = held ?? [];
      held = undefined;
      for (const result of due) print(result);
    },
  };
}

function startedRun(run: RoutineTickResult["started"][number]): StartedRoutineRun {
  return { key: run.trigger?.routineId ?? "", runId: run.id, at: run.trigger?.at ?? run.startedAt };
}
