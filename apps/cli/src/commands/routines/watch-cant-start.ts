// The routines `halonic routines watch` leaves out because their own files
// have errors (HAL-15372). `halonic routines` lists such a routine as "Can't
// start" and the others with their next run, and the Studio's scheduler
// starts the others too, so the watch does the same: it says which can't
// start, once each, and starts the rest. Errors in any other file still stop
// the whole watch, since they can change what every run reaches
// (`cli.workspace-file-problems`).

import { type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandContext } from "../../command.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { routinesWithProblemsOf } from "../../workspace-problems.ts";

/**
 * `routines` without those whose files have errors in `workspace`, the
 * version they were read from.
 */
export function withoutProblems(
  workspace: LoadedWorkspace,
  routines: readonly PlacedRoutine[],
): PlacedRoutine[] {
  const keys = new Set(routinesWithProblemsOf(workspace).map((each) => each.key));
  return routines.filter((each) => !keys.has(routineKey(each)));
}

/** Whether a schedule or an interval starts the routine, rather than a web request. */
export function isOnAClock(routine: PlacedRoutine["routine"]): boolean {
  return "schedule" in routine.trigger || "every" in routine.trigger;
}

/**
 * Leaves out the routines whose files have errors, on every tick, and
 * prints "✕ Friday digest can't start until its file is fixed · halonic
 * validate" the first time
 * each one is left out. A routine whose file is fixed starts again from
 * that tick on, with "✓ Friday digest is fixed and starts on time again."
 * (C630), and gets its ✕ line again if it breaks again.
 */
export class RoutinesThatCantStart {
  readonly #context: CommandContext;
  readonly #typedDir: string | undefined;
  /** The routines whose ✕ line is printed, until their files are fixed: their names by key. */
  readonly #said = new Map<string, string>();

  /** @param typedDir - the user's own `--dir`, for the suggested `halonic validate` */
  constructor(context: CommandContext, typedDir: string | undefined) {
    this.#context = context;
    this.#typedDir = typedDir;
  }

  /**
   * `routines` without those whose files have errors in `workspace`, the
   * version they were read from, after printing the ✓ line of each one
   * fixed since the last tick and the ✕ line of each one not said yet.
   */
  leaveOut(workspace: LoadedWorkspace, routines: readonly PlacedRoutine[]): PlacedRoutine[] {
    const cantStart = routinesWithProblemsOf(workspace);
    const keys = new Set(cantStart.map((each) => each.key));
    for (const key of [...this.#said.keys()]) {
      if (keys.has(key)) continue;
      this.#said.delete(key);
      // A routine whose file was removed rather than fixed is gone, and gets no line.
      const fixed = routines.find((each) => routineKey(each) === key);
      if (fixed !== undefined) this.#sayFixed(fixed.routine);
    }
    for (const { key, name } of cantStart) {
      if (this.#said.has(key)) continue;
      this.#said.set(key, name);
      // The name comes from the routine's file, so it is made printable (cli-output section 5).
      this.#context.printAhead(
        routinesMessages.routineCantStart(printable(name), this.#typedDir).phrase,
      );
    }
    return routines.filter((each) => !keys.has(routineKey(each)));
  }

  /**
   * "✓ Friday digest is fixed and starts on time again." for a routine
   * that is on and on a clock; a routine that is off or that a web request
   * starts isn't started by the watch, so its line only says it is fixed.
   */
  #sayFixed(routine: PlacedRoutine["routine"]): void {
    const name = printable(routine.name);
    const startsOnTime = routine.enabled && isOnAClock(routine);
    this.#context.printAhead(
      (startsOnTime
        ? routinesMessages.routineFixedStartsOnTime(name)
        : routinesMessages.routineFixed(name)
      ).phrase,
    );
  }
}
