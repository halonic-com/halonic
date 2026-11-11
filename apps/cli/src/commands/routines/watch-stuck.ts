// The ✕ line of `halonic routines watch` for a run whose step keeps failing
// (HAL-5064). `halonic run` stops at such a run; the watch runs unattended
// for days, so it says which run got stuck and keeps starting the others.

import { shortRunId } from "@halonicjs/app";
import type { RunStore } from "@halonicjs/ports";
import { type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { CommandContext } from "../../command.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { failuresBeforeStuck, type StuckTimer } from "../../stuck-timers.ts";

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
  context.printAhead(
    (placed === undefined
      ? routinesMessages.runStuck(shortRunId(runId))
      : routinesMessages.stuck(printable(placed.routine.name), shortRunId(runId))
    ).phrase,
  );
  context.debug(
    routinesMessages.stuckWhy(
      printable(runId),
      printable(timer.timerId),
      failuresBeforeStuck,
      printable(error instanceof Error ? error.message : String(error)),
    ).phrase,
  );
}
