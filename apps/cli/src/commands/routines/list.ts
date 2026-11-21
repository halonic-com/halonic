// `halonic routines`: the workspace's routines, one row each (HAL-4844). A
// thin command over `RoutineList`: this file opens the workspace and its
// runs, asks the service, and turns its answer into rows. Listing starts
// nothing and writes nothing, so it needs no trust, as `halonic runs`. A
// routine whose file has errors shows "Can't start", and the list exits 1,
// so "will it run?" is answered where people look for it (HAL-14299). A
// routine whose saved changes aren't live yet gets a line under the list,
// since it runs as last committed until then (HAL-15204). In a workspace
// that isn't trusted here, a routine that is on says "Paused until
// trusted", as the Studio does, since `watch` would refuse it (HAL-15525).

import { type ListedRoutine, RoutineList } from "@halonicjs/app/routines";
import { loadWorkspace } from "@halonicjs/workspace";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dim, dimmed, type Phrase, phrase } from "../../messages/phrase.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { dueAt, type RunClock, startedAt } from "../../run-times.ts";
import type { OpenWorkspaceHistory } from "../../run-workspace.ts";
import { givenDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import {
  type WorkspaceTrustMachine,
  type WorkspaceTrustState,
  workspaceNameOf,
  workspaceTrustState,
} from "../../workspace-trust.ts";
import type { RunListSetup } from "../runs/list.ts";
import { listedStatus } from "../runs/listed-run.ts";
import { type NotLiveRoutines, notLiveRoutines } from "./not-live.ts";

/**
 * Lists the workspace's routines, one lined-up row each: the name, what
 * starts it, its next run and its last run. No routines says so, and exits 0.
 * Routines whose files have errors are counted above the list, which then
 * exits 1. Routines with saved changes that aren't live yet get a line each
 * under it. A workspace that isn't trusted here gets a line above it with
 * `halonic trust`, and its routines that are on read "Paused until trusted".
 *
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export async function listRoutines(
  input: CommandInput,
  context: CommandContext,
  setup: RoutineListSetup,
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
  const typedDir = givenDir(input, workspace);
  const trust = await workspaceTrustState(workspace, setup.trust(), loaded);
  const row: RowOptions = { withHub: spansHubs(routines), paused: !startsHere(trust) };
  const withProblems = routines.filter((each) => each.problems > 0).length;
  const problemsLine =
    withProblems === 0 ? [] : [routinesMessages.routinesCantStart(withProblems, typedDir).phrase];
  const pausedLine = routines.some((each) => isPaused(each, row))
    ? [pausedMessage(trust)(printable(workspaceNameOf(loaded, workspace)), typedDir).phrase]
    : [];
  const notLive = await notLiveRoutines(workspace, loaded, setup.history);
  return {
    exitCode: withProblems === 0 ? exitCode.ok : exitCode.failed,
    lines: [
      ...problemsLine,
      ...pausedLine,
      ...columns(routines.map((each) => routineRow(each, clock, row))),
      ...notLiveLines(routines, notLive),
      routinesMessages.watchHint().phrase,
    ],
    json: { ...json, trusted: startsHere(trust) },
  };
}

/**
 * What {@link listRoutines} needs: the `runs` list's clock and profile, the
 * trust records it reads, as `routines watch` does, and the history the
 * live version is read from (git on the `PATH` by default).
 */
export interface RoutineListSetup extends RunListSetup {
  trust(): WorkspaceTrustMachine;
  readonly history?: OpenWorkspaceHistory;
}

/** How each row is written: with its hub's id, and whether trust holds the routines back. */
export interface RowOptions {
  readonly withHub: boolean;
  /** The workspace isn't trusted here, so no routine of it starts. */
  readonly paused: boolean;
}

/** Whether routines can start in a workspace with this trust: trusted, or reaching only the test model. */
function startsHere(trust: WorkspaceTrustState): boolean {
  return trust === "trusted" || trust === "not-needed";
}

/** Whether the routine's Next column says "Paused until trusted": it would start, but trust holds it back. */
function isPaused(routine: ListedRoutine, row: RowOptions): boolean {
  return row.paused && routine.problems === 0 && routine.enabled;
}

/** The line above the list for a workspace that isn't trusted: changed since, or not trusted yet. */
function pausedMessage(trust: WorkspaceTrustState): typeof routinesMessages.notTrustedPaused {
  return trust === "changed" ? routinesMessages.changedPaused : routinesMessages.notTrustedPaused;
}

/**
 * One line for each routine whose saved changes aren't live yet, in the
 * list's order, or why that couldn't be checked and its fix, dimmed.
 */
function notLiveLines(routines: readonly ListedRoutine[], notLive: NotLiveRoutines): Phrase[] {
  if (!notLive.checked) {
    return [
      routinesMessages.liveCheckFailed(notLive.reason.phrase).phrase,
      dimmed(notLive.fix.phrase),
    ];
  }
  return routines
    .filter((each) => notLive.keys.has(each.key))
    .map((each) => routinesMessages.changesNotLive(printable(each.name)).phrase);
}

/**
 * One row of four cells: the name, the trigger in words, the next run and
 * the last run, dimmed. The name and the trigger's words come from the
 * routine's file, so they are made printable (cli-output section 5). With
 * `row.withHub`, the name is followed by a · and its hub's id, dimmed, so two
 * routines of the same name in different hubs can be told apart (HAL-4888)
 * and the hub doesn't read as part of the name (HAL-12323).
 */
export function routineRow(
  routine: ListedRoutine,
  clock: RunClock,
  row: RowOptions = { withHub: false, paused: false },
): Phrase[] {
  return [
    nameCell(routine, row.withHub),
    phrase`${printable(routine.trigger)}`,
    nextCell(routine, clock, row),
    dimmed(lastCell(routine, clock)),
  ];
}

/** The name, then the hub's id when asked; a routine at the workspace's root has no hub to name. */
function nameCell(routine: ListedRoutine, withHub: boolean): Phrase {
  if (!withHub || routine.hubId === null) {
    return phrase`${printable(routine.name)}`;
  }
  return phrase`${printable(routine.name)} ${dim(`· ${printable(routine.hubId)}`)}`;
}

/** Whether the routines come from more than one hub (the workspace's root counts as one), so each row names its hub. */
function spansHubs(routines: readonly ListedRoutine[]): boolean {
  return new Set(routines.map((each) => each.hubId)).size > 1;
}

/**
 * The Next column. A routine with errors can't start, even when it is on
 * or has a next time, and one that is on in an untrusted workspace is
 * paused, as the Studio's chip says, before its time. A schedule in a zone other than this computer's is
 * written in its own zone, and says which, so its time matches its file.
 */
function nextCell(routine: ListedRoutine, clock: RunClock, row: RowOptions): Phrase {
  if (routine.problems > 0) {
    return routinesMessages.cantStart().phrase;
  }
  if (!routine.enabled) {
    return routinesMessages.off().phrase;
  }
  if (isPaused(routine, row)) {
    return routinesMessages.pausedUntilTrusted().phrase;
  }
  if (routine.nextRun === null) {
    return routinesMessages.noSetTime().phrase;
  }
  const due = new Date(routine.nextRun);
  const zone = routine.timeZone;
  if (zone === null || zone === (clock.timeZone ?? computerTimeZone())) {
    return routinesMessages.next(dueAt(due, clock)).phrase;
  }
  return routinesMessages.nextIn(dueAt(due, { ...clock, timeZone: zone }), printable(zone)).phrase;
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
 * A routine with errors can't start, so it has no next run (HAL-15082).
 */
function routineJson(routine: ListedRoutine): Record<string, unknown> {
  const { lastRun, ...rest } = routine;
  return {
    ...rest,
    nextRun: routine.problems > 0 ? null : routine.nextRun,
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
