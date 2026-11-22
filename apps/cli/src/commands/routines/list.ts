// `halonic routines`: the workspace's routines, one row each (HAL-4844). A
// thin command over `RoutineList`: this file opens the workspace and its
// runs, asks the service, and turns its answer into rows. Listing starts
// nothing and writes nothing, so it needs no trust, as `halonic runs`. A
// routine whose file has errors shows "Can't start", and the list exits 1,
// so "will it run?" is answered where people look for it (HAL-14299). So does
// a webhook routine that `halonic serve` marks with ✕, by serve's own check
// (C570). A routine whose saved changes aren't live yet gets a line under the
// list, since it runs as last committed until then (HAL-15204), and the rows
// show its trigger and next run as the watch runs it, from the live version
// (HAL-15479), with that version's errors. A routine no commit has isn't run
// by the watch, so it gets no next run and a line of its own (HAL-15664). In
// a workspace that isn't trusted here, a routine that is on says "Paused until
// trusted", as the Studio does, since `watch` would refuse it (HAL-15525). A
// routine that starts an agent on its own shows "Can't start" too, with why
// under the list, since Halonic runs an agent only as a step in a workflow
// (HAL-15607).

import { placedRoutines } from "@halonicjs/app";
import { type ListedRoutine, RoutineList } from "@halonicjs/app/routines";
import type { Secrets } from "@halonicjs/ports";
import { routineKey } from "@halonicjs/routines";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
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
import { webhookStartBlocks } from "../serve/webhook-routines.ts";
import { listAsLive, type NotLiveRoutines } from "./not-live.ts";

/**
 * Lists the workspace's routines, one lined-up row each: the name, what
 * starts it, its next run and its last run. No routines says so, and exits 0.
 * Routines whose files have errors, and webhook routines `halonic serve`
 * says can't start, are counted above the list, which then exits 1.
 * Routines with saved changes that aren't live yet are listed as the watch
 * runs them, from the live version, and get a line each under it.
 * A workspace that isn't trusted here gets a line above it with
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
  const timeZone = clock.timeZone ?? computerTimeZone();
  const { routines, notLive } = await listAsLive(
    workspace,
    (live) => list.listRoutines(loaded, clock.now, timeZone, live),
    setup.history,
  );
  const json = { routines: routines.map(routineJson) };
  if (routines.length === 0) {
    // The workspace's name is outside text (cli-output section 5).
    return {
      exitCode: exitCode.ok,
      lines: [routinesMessages.noRoutines(printable(workspaceNameOf(loaded, workspace))).phrase],
      json,
    };
  }
  const dir = givenDir(input, workspace);
  const trust = await workspaceTrustState(workspace, setup.trust(), loaded);
  const row: RowOptions = { withHub: spansHubs(routines), paused: !startsHere(trust) };
  const blocked = await webhookRoutinesThatWontStart(loaded, context.secrets);
  const withProblems = routines.filter((each) => each.problems > 0);
  // A fix that is saved but not committed: validate reads the saved file and finds nothing (C642 #2).
  const fixNotLive = withProblems.filter(isFixNotLive).length;
  const toValidate = withProblems.length - fixNotLive;
  // A routine with file errors is counted once, under validate, which shows them,
  // and one that starts an agent once, on its own line under the list.
  const webOnly = routines.filter((each) => !cantStart(each) && blocked.has(each.key)).length;
  const pausedLine = routines.some((each) => isPaused(each, row))
    ? [pausedMessage(trust)(printable(workspaceNameOf(loaded, workspace)), dir).phrase]
    : [];
  return {
    exitCode: withProblems.length + webOnly === 0 ? exitCode.ok : exitCode.failed,
    lines: [
      ...(toValidate === 0 ? [] : [routinesMessages.routinesCantStart(toValidate, dir).phrase]),
      ...(fixNotLive === 0 ? [] : [routinesMessages.routinesFixNotLive(fixNotLive).phrase]),
      ...(webOnly === 0 ? [] : [routinesMessages.webhookRoutinesCantStart(webOnly, dir).phrase]),
      ...pausedLine,
      ...columns(routines.map((each) => routineRow(each, clock, row, blocked.has(each.key)))),
      ...agentLines(routines),
      ...notLiveLines(routines, notLive, dir),
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

/**
 * Whether the routine's Next column says "Paused until trusted": it would
 * start, but trust holds it back. One never live doesn't run even once
 * trusted, so it reads "Not live yet" instead (HAL-15664), and one that
 * can't start reads "Can't start" (HAL-15607).
 */
function isPaused(routine: ListedRoutine, row: RowOptions): boolean {
  return row.paused && !cantStart(routine) && routine.enabled && routine.liveState !== "never-live";
}

/** The line above the list for a workspace that isn't trusted: changed since, or not trusted yet. */
function pausedMessage(trust: WorkspaceTrustState): typeof routinesMessages.notTrustedPaused {
  return trust === "changed" ? routinesMessages.changedPaused : routinesMessages.notTrustedPaused;
}

/** One line for each routine that starts an agent on its own, in the list's order: why it can't start and the fix. */
function agentLines(routines: readonly ListedRoutine[]): Phrase[] {
  return routines
    .filter((each) => each.startsAgent)
    .map((each) => routinesMessages.agentCantStart(printable(each.name)).phrase);
}

/**
 * Whether the routine can't start whatever its trigger: its file has errors,
 * or it starts an agent on its own, which Halonic can't run yet.
 */
function cantStart(routine: ListedRoutine): boolean {
  return routine.problems > 0 || routine.startsAgent;
}

/**
 * One line for each routine whose saved changes aren't live yet, or that is
 * on and starts but was never live, in the list's order; or why that
 * couldn't be checked and its fix, dimmed. `dir` is the user's own `--dir`.
 */
function notLiveLines(
  routines: readonly ListedRoutine[],
  notLive: NotLiveRoutines,
  dir: string | undefined,
): Phrase[] {
  if (!notLive.checked) {
    return [
      routinesMessages.liveCheckFailed(notLive.reason.phrase).phrase,
      dimmed(notLive.fix.phrase),
    ];
  }
  return routines.flatMap((each) => {
    const line = notLiveLine(each, dir);
    return line === null ? [] : [line];
  });
}

/** The line under the list for one routine, or `null` for one that runs as saved, or can't or won't start anyway. */
function notLiveLine(routine: ListedRoutine, dir: string | undefined): Phrase | null {
  // The name comes from the routine's file, so it is made printable (cli-output section 5).
  const name = printable(routine.name);
  if (isFixNotLive(routine)) {
    return routinesMessages.fixNotLive(name).phrase;
  }
  if (routine.liveState === "not-live") {
    return routine.savedProblems > 0
      ? routinesMessages.changesNotLiveWithErrors(name, dir).phrase
      : routinesMessages.changesNotLive(name).phrase;
  }
  if (routine.liveState === "never-live" && routine.enabled && !cantStart(routine)) {
    return routinesMessages.neverLive(name).phrase;
  }
  return null;
}

/**
 * Whether the live version, the one that starts, has errors that the saved
 * file no longer has: the fix is saved but not committed (C642 #2).
 */
function isFixNotLive(routine: ListedRoutine): boolean {
  return routine.liveState === "not-live" && routine.problems > 0 && routine.savedProblems === 0;
}

/**
 * The keys of the webhook routines that are on and that `halonic serve`
 * says won't start: by the same check, so the two never disagree (C570).
 */
async function webhookRoutinesThatWontStart(
  workspace: LoadedWorkspace,
  secrets: Secrets,
): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const placed of placedRoutines(workspace)) {
    if (!placed.routine.enabled) continue;
    if ((await webhookStartBlocks(placed, secrets)).length > 0) keys.add(routineKey(placed));
  }
  return keys;
}

/**
 * One row of four cells: the name, the trigger in words, the next run and
 * the last run, dimmed. The name and the trigger's words come from the
 * routine's file, so they are made printable (cli-output section 5). With
 * `row.withHub`, the name is followed by a · and its hub's id, dimmed, so two
 * routines of the same name in different hubs can be told apart (HAL-4888)
 * and the hub doesn't read as part of the name (HAL-12323). `wontStart` is a
 * webhook routine `halonic serve` says won't start.
 */
export function routineRow(
  routine: ListedRoutine,
  clock: RunClock,
  row: RowOptions = { withHub: false, paused: false },
  wontStart = false,
): Phrase[] {
  return [
    nameCell(routine, row.withHub),
    phrase`${printable(routine.trigger)}`,
    wontStart ? routinesMessages.cantStart().phrase : nextCell(routine, clock, row),
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
 * The Next column. A routine with errors, or one that starts an agent on its
 * own, can't start, even when it is on or has a next time, and one that is on
 * but never live doesn't run. One that is on in an untrusted workspace is
 * paused, as the Studio's chip says, before its time. A schedule in a zone
 * other than this computer's is written in its own zone, and says which, so
 * its time matches its file.
 */
function nextCell(routine: ListedRoutine, clock: RunClock, row: RowOptions): Phrase {
  if (cantStart(routine)) {
    return routinesMessages.cantStart().phrase;
  }
  if (!routine.enabled) {
    return routinesMessages.off().phrase;
  }
  if (routine.liveState === "never-live") {
    return routinesMessages.notLiveYet().phrase;
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
 * A routine that can't start has no next run (HAL-15082, HAL-15607).
 */
function routineJson(routine: ListedRoutine): Record<string, unknown> {
  const { lastRun, ...rest } = routine;
  return {
    ...rest,
    nextRun: cantStart(routine) ? null : routine.nextRun,
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
