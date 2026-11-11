// The ✕ lines of `halonic routines watch` for a run whose step keeps failing
// (HAL-5064). `halonic run` stops at such a run; the watch runs unattended
// for days, so it says which run got stuck and keeps starting the others.
// After an hour it says it gave up on that run (HAL-5294).

import { shortRunId } from "@halonicjs/app";
import type { RunStore } from "@halonicjs/ports";
import { type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { CommandContext } from "../../command.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { failuresBeforeStuck, type GaveUpRun, type StuckTimer } from "../../stuck-timers.ts";

/**
 * Prints the ✕ line of a run whose step keeps failing, with its routine's
 * name when a routine started it, and why under `--debug`. The run log
 * says which routine, so a run an earlier watch started is named too.
 * Never rejects: a run log that can't say leaves the name out.
 *
 * @example
 * onStuck: (stuck) => void reportStuck(context, routines, runStore, stuck),
 */
export async function reportStuck(
  context: CommandContext,
  routines: readonly PlacedRoutine[],
  runs: RunStore | undefined,
  { error, timer }: StuckTimer,
): Promise<void> {
  const runId = timer.key;
  const name = await routineNameOf(context, routines, runs, runId);
  context.printAhead(
    (name === undefined
      ? routinesMessages.runStuck(shortRunId(runId))
      : routinesMessages.stuck(name, shortRunId(runId))
    ).phrase,
  );
  context.debug(
    routinesMessages.stuckWhy(
      printable(runId),
      printable(timer.timerId),
      failuresBeforeStuck,
      reasonOf(error),
    ).phrase,
  );
}

/**
 * Prints the ✕ line of a run the watch gave up on, named as by
 * {@link reportStuck}, and under `--debug` why and whether it was
 * cancelled. Never rejects.
 *
 * @example
 * onGaveUp: (gaveUp) => void reportGaveUp(context, routines, runStore, gaveUp),
 */
export async function reportGaveUp(
  context: CommandContext,
  routines: readonly PlacedRoutine[],
  runs: RunStore | undefined,
  gaveUp: GaveUpRun,
): Promise<void> {
  const runId = gaveUp.timer.key;
  const name = await routineNameOf(context, routines, runs, runId);
  context.printAhead(
    (name === undefined
      ? routinesMessages.runGaveUp(shortRunId(runId))
      : routinesMessages.gaveUp(name, shortRunId(runId))
    ).phrase,
  );
  const timer = printable(gaveUp.timer.timerId);
  context.debug(
    (gaveUp.cancelled
      ? routinesMessages.gaveUpCancelled(printable(runId), timer, reasonOf(gaveUp.error))
      : routinesMessages.gaveUpHeld(
          printable(runId),
          timer,
          reasonOf(gaveUp.error),
          reasonOf(gaveUp.cancelError),
        )
    ).phrase,
  );
}

/** The printable name of the routine that started the run, from its run log; none when it can't say. */
async function routineNameOf(
  context: CommandContext,
  routines: readonly PlacedRoutine[],
  runs: RunStore | undefined,
  runId: string,
): Promise<string | undefined> {
  const key = await runs?.get(runId).then(
    (run) => run?.trigger?.routineId,
    (lookupError: unknown) => {
      context.debug(
        routinesMessages.stuckRoutineUnknown(printable(runId), printable(String(lookupError)))
          .phrase,
      );
      return undefined;
    },
  );
  const placed = routines.find((routine) => routineKey(routine) === key);
  return placed === undefined ? undefined : printable(placed.routine.name);
}

function reasonOf(error: unknown): string {
  return printable(error instanceof Error ? error.message : String(error));
}
