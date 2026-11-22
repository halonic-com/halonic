// The routines `halonic routines watch` leaves out because they can't start
// (HAL-15372): their own files have errors, they start an agent on its own,
// which the engine can't run yet (C672 #1), or the agent they run is in a
// harness, which the watch doesn't start yet (HAL-15396). `halonic routines`
// lists a routine whose file has errors as "Can't start" and the others with
// their next run, and the Studio's scheduler starts the others too, so the
// watch does the same: it says which can't start, once each, and starts the
// rest. Errors in any other file still stop the whole watch, since they can
// change what every run reaches (`cli.workspace-file-problems`). A routine
// whose saved file is fixed but not committed still can't start, since the
// watch runs the live version, and its line says so instead of pointing to
// `validate`, which reads the saved file and finds nothing (C642 #2).

import { placedRoutines } from "@halonicjs/app";
import { type PlacedRoutine, routineKey } from "@halonicjs/routines";
import type { LoadedFileOf, LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandContext } from "../../command.ts";
import type { Message } from "../../messages/define.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { programAgentsOf } from "../../sandbox-gate.ts";
import { routinesWithProblemsOf } from "../../workspace-problems.ts";

/** A routine the watch leaves out, by its key, with the line that says why. */
interface CantStart {
  readonly key: string;
  /** Whether its own file has errors in the version read, which a saved fix may mend. */
  readonly fileHasErrors: boolean;
  /** Its line; `fixSaved` says its saved file has no errors (C642 #2). */
  readonly line: (fixSaved: boolean) => Message;
}

/**
 * `routines` without those that can't start in `workspace`, the version
 * they were read from.
 */
export function withoutCantStart(
  workspace: LoadedWorkspace,
  routines: readonly PlacedRoutine[],
): PlacedRoutine[] {
  const keys = new Set(cantStartOf(workspace, routines, undefined).map((each) => each.key));
  return routines.filter((each) => !keys.has(routineKey(each)));
}

/**
 * How many routines are on in the saved files but in no routine file of the
 * live version: the watch reads the live version, so it doesn't run them
 * (HAL-15664), and says how many instead of leaving them out without a word
 * (C672 #1). With history off the two are the same files, so none.
 */
export function routinesNotLiveYet(saved: LoadedWorkspace, live: LoadedWorkspace): number {
  const liveKeys = new Set(placedRoutines(live).map(routineKey));
  return placedRoutines(saved).filter(
    (each) => each.routine.enabled && !liveKeys.has(routineKey(each)),
  ).length;
}

/**
 * Leaves out the routines that can't start, on every tick, and prints the
 * line of each the first time it is left out: "✕ Friday digest can't start
 * until its file is fixed · halonic validate" for a file with errors, "✕
 * Friday digest can't start until its fix is committed or made live in
 * Halonic Studio" when its saved file has none, the list's reason for an
 * agent on its own, the harness reason for an agent in a harness. A routine
 * that is fixed starts again from that tick on, says "✓ Friday digest can
 * start now" (HAL-15664), and gets its line again if it can't start again.
 */
export class RoutinesThatCantStart {
  readonly #context: CommandContext;
  readonly #typedDir: string | undefined;
  readonly #saved: () => Promise<LoadedWorkspace>;
  /** The keys of the routines whose line is printed, until they are fixed. */
  readonly #said = new Set<string>();

  /**
   * @param typedDir - the user's own `--dir`, for the suggested `halonic validate`
   * @param saved - loads the saved files, read only when a file's line is due
   */
  constructor(
    context: CommandContext,
    typedDir: string | undefined,
    saved: () => Promise<LoadedWorkspace>,
  ) {
    this.#context = context;
    this.#typedDir = typedDir;
    this.#saved = saved;
  }

  /** How many routines are left out now, each with its line printed. */
  get leftOut(): number {
    return this.#said.size;
  }

  /**
   * `routines` without those that can't start in `workspace`, the version
   * they were read from, after printing the line of each one not said yet.
   */
  async leaveOut(
    workspace: LoadedWorkspace,
    routines: readonly PlacedRoutine[],
  ): Promise<PlacedRoutine[]> {
    const cantStart = cantStartOf(workspace, routines, this.#typedDir);
    const keys = new Set(cantStart.map((each) => each.key));
    for (const key of this.#said) {
      if (keys.has(key)) continue;
      this.#said.delete(key);
      // A routine whose file is gone, rather than fixed, has nothing to say.
      const fixed = routines.find((each) => routineKey(each) === key);
      if (fixed !== undefined) {
        this.#context.printAhead(
          routinesMessages.canStartNow(printable(fixed.routine.name)).phrase,
        );
      }
    }
    const unsaid = cantStart.filter(({ key }) => !this.#said.has(key));
    const savedWithErrors = unsaid.some((each) => each.fileHasErrors)
      ? new Set(routinesWithProblemsOf(await this.#saved()).map((each) => each.key))
      : new Set<string>();
    for (const { key, fileHasErrors, line } of unsaid) {
      this.#said.add(key);
      this.#context.printAhead(line(fileHasErrors && !savedWithErrors.has(key)).phrase);
    }
    return routines.filter((each) => !keys.has(routineKey(each)));
  }
}

/**
 * The routines that can't start: those whose files have errors, in the
 * order of their paths, then each routine that is on and starts an agent on
 * its own or runs an agent in a harness, in the order of `routines`. Names
 * come from the routines' files, so they are made printable (cli-output
 * section 5).
 */
function cantStartOf(
  workspace: LoadedWorkspace,
  routines: readonly PlacedRoutine[],
  typedDir: string | undefined,
): CantStart[] {
  const withProblems: CantStart[] = routinesWithProblemsOf(workspace).map(({ key, name }) => ({
    key,
    fileHasErrors: true,
    line: (fixSaved) =>
      fixSaved
        ? routinesMessages.routineFixNotLive(printable(name))
        : routinesMessages.routineCantStart(printable(name), typedDir),
  }));
  const byAgent: CantStart[] = [];
  for (const placed of routines) {
    const key = routineKey(placed);
    if (withProblems.some((each) => each.key === key)) continue;
    if (startsAgentOnItsOwn(placed)) {
      const name = printable(placed.routine.name);
      byAgent.push({
        key,
        fileHasErrors: false,
        line: () => routinesMessages.agentRoutineCantStart(name),
      });
      continue;
    }
    const agent = harnessAgentOf(workspace, placed);
    if (agent === undefined) continue;
    byAgent.push({
      key,
      fileHasErrors: false,
      line: () =>
        routinesMessages.harnessRoutineCantStart(
          printable(placed.routine.name),
          printable(agent.value.name),
          printable(agent.value.harness ?? ""),
        ),
    });
  }
  return [...withProblems, ...byAgent];
}

/**
 * Whether an enabled routine starts one agent rather than a workflow: the
 * engine refuses that run (`AgentRunsNotAvailable`), so the watch leaves it
 * out up front, as `halonic routines` shows it "Can't start" (C672 #1).
 */
function startsAgentOnItsOwn({ routine }: PlacedRoutine): boolean {
  return routine.enabled && "agent" in routine.run;
}

/**
 * The first agent in a harness of the workflow an enabled routine starts.
 * `run` starts such agents and keeps what they change as a proposal for
 * `halonic proposals` (HAL-6477); a routine runs unattended, so the watch
 * doesn't start them yet. A routine that starts one agent can't start
 * whatever its harness, so {@link startsAgentOnItsOwn} says so first.
 */
function harnessAgentOf(
  workspace: LoadedWorkspace,
  placed: PlacedRoutine,
): LoadedFileOf<"agent"> | undefined {
  const { routine } = placed;
  const hubId = routine.run.hub ?? placed.hub;
  if (!routine.enabled || hubId === null || !("workflow" in routine.run)) return undefined;
  return programAgentsOf(workspace, { hubId, workflowId: routine.run.workflow })[0];
}
