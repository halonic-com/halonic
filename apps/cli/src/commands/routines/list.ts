// `halonic routines`: the workspace's routines, one row each (HAL-4844). A
// thin command over `RoutineList`: this file opens the workspace and its
// runs, asks the service, and turns its answer into rows. Listing starts
// nothing and writes nothing, so it needs no trust, as `halonic runs`.

import { type ListedRoutine, RoutineList } from "@halonicjs/app";
import { loadWorkspace } from "@halonicjs/workspace";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dim, dimmed, type Phrase, phrase } from "../../messages/phrase.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { dueAt, type RunClock, startedAt } from "../../run-times.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import type { RunListSetup } from "../runs/list.ts";
import { listedStatus } from "../runs/listed-run.ts";

/**
 * Lists the workspace's routines, one lined-up row each: the name, what
 * starts it, its next run and its last run. No routines says so, and exits 0.
 *
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export async function listRoutines(
  input: CommandInput,
  context: CommandContext,
  setup: RunListSetup,
): Promise<CommandResult> {
  const workspace = await openWorkspaceDir(input, context);
  const clock = setup.clock();
  const list = new RoutineList(await openWorkspaceRuns(workspace.root, setup.profile));
  const loaded = await loadWorkspace(workspace.store);
  const routines = await list.listRoutines(loaded, clock.now, clock.timeZone ?? computerTimeZone());
  const json = { routines: routines.map(routineJson) };
  if (routines.length === 0) {
    // The workspace's name is outside text (cli-output section 5).
    return {
      exitCode: exitCode.ok,
      lines: [routinesMessages.noRoutines(printable(workspaceNameOf(loaded, workspace))).phrase],
      json,
    };
  }
  const withHub = spansHubs(routines);
  return {
    exitCode: exitCode.ok,
    lines: columns(routines.map((each) => routineRow(each, clock, withHub))),
    json,
  };
}

/**
 * One row of four cells: the name, the trigger in words, the next run and
 * the last run, dimmed. The name and the trigger's words come from the
 * routine's file, so they are made printable (cli-output section 5). With
 * `withHub`, the name is followed by its hub's id, dimmed, so two routines
 * of the same name in different hubs can be told apart (HAL-4888).
 */
export function routineRow(routine: ListedRoutine, clock: RunClock, withHub = false): Phrase[] {
  return [
    nameCell(routine, withHub),
    phrase`${printable(routine.trigger)}`,
    nextCell(routine, clock),
    dimmed(lastCell(routine, clock)),
  ];
}

/** The name, then the hub's id when asked; a routine at the workspace's root has no hub to name. */
function nameCell(routine: ListedRoutine, withHub: boolean): Phrase {
  if (!withHub || routine.hubId === null) {
    return phrase`${printable(routine.name)}`;
  }
  return phrase`${printable(routine.name)} ${dim(printable(routine.hubId))}`;
}

/** Whether the routines come from more than one hub (the workspace's root counts as one), so each row names its hub. */
function spansHubs(routines: readonly ListedRoutine[]): boolean {
  return new Set(routines.map((each) => each.hubId)).size > 1;
}

function nextCell(routine: ListedRoutine, clock: RunClock): Phrase {
  if (!routine.enabled) {
    return routinesMessages.off().phrase;
  }
  if (routine.nextRun === null) {
    return routinesMessages.noSetTime().phrase;
  }
  return routinesMessages.next(dueAt(new Date(routine.nextRun), clock)).phrase;
}

function lastCell(routine: ListedRoutine, clock: RunClock): Phrase {
  const run = routine.lastRun;
  if (run === null) {
    return routinesMessages.neverRan().phrase;
  }
  return routinesMessages.lastRun(startedAt(new Date(run.startedAt), clock), listedStatus(run))
    .phrase;
}

/**
 * A routine as `--json` gives it: the service's fields, with the last run
 * cut to its id, status and start, which `halonic runs show` takes further.
 */
function routineJson(routine: ListedRoutine): Record<string, unknown> {
  const { lastRun, ...rest } = routine;
  return {
    ...rest,
    lastRun:
      lastRun === null
        ? null
        : { runId: lastRun.id, status: lastRun.status, startedAt: lastRun.startedAt },
  };
}

/** This computer's IANA time zone, which a schedule without its own zone runs in. */
export function computerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
