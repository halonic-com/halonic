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

/**
 * Leaves out the routines whose files have errors, on every tick, and
 * prints "✕ Friday digest can't start · halonic validate" the first time
 * each one is left out. A routine whose file is fixed starts again from
 * that tick on, and gets its line again if it breaks again.
 */
export class RoutinesThatCantStart {
  readonly #context: CommandContext;
  readonly #typedDir: string | undefined;
  /** The keys of the routines whose line is printed, until their files are fixed. */
  readonly #said = new Set<string>();

  /** @param typedDir - the user's own `--dir`, for the suggested `halonic validate` */
  constructor(context: CommandContext, typedDir: string | undefined) {
    this.#context = context;
    this.#typedDir = typedDir;
  }

  /**
   * `routines` without those whose files have errors in `workspace`, the
   * version they were read from, after printing the line of each one not
   * said yet.
   */
  leaveOut(workspace: LoadedWorkspace, routines: readonly PlacedRoutine[]): PlacedRoutine[] {
    const cantStart = routinesWithProblemsOf(workspace);
    const keys = new Set(cantStart.map((each) => each.key));
    for (const key of this.#said) {
      if (!keys.has(key)) this.#said.delete(key);
    }
    for (const { key, name } of cantStart) {
      if (this.#said.has(key)) continue;
      this.#said.add(key);
      // The name comes from the routine's file, so it is made printable (cli-output section 5).
      this.#context.printAhead(
        routinesMessages.routineCantStart(printable(name), this.#typedDir).phrase,
      );
    }
    return routines.filter((each) => !keys.has(routineKey(each)));
  }
}
