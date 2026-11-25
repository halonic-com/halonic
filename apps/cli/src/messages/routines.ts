import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { dim, markPart, type Phrase, phrase } from "./phrase.ts";
import { runMessages } from "./run.ts";
import {
  type DueAt,
  dueInWords,
  type ListedStatus,
  runsListMessages,
  type StartedAt,
  startedInWords,
} from "./runs-list.ts";
import { suggestedCommand } from "./suggested-command.ts";
import { type RefusedFile, trustMessages } from "./trust.ts";

/**
 * The fix for a routine whose agent is in a harness: `watch` has no
 * `--harness` to move it, as `run` does, so the agent or the routine changes
 * (HAL-11908). It names the control, the agent's Harness page, as the CLI's
 * other harness fixes do (C665 row 110).
 */
function harnessFix(agent: string) {
  return phrase`Set ${agent} to Halonic on its Harness page, or turn the routine off.`;
}

/**
 * Joined to "commit" with "or" in a line that asks for one: the Studio's
 * Make live does the same, so either way works (C642 #7, Sofia on HAL-15877).
 */
const inStudio = "in Halonic Studio";

/**
 * Why a routine that starts an agent on its own can't start, and the fix in
 * the file's terms, in the words the Studio's Starts card and `serve`'s
 * webhook line use (HAL-15607): the list and the watch say it alike (C672 #1).
 */
function agentOnItsOwn() {
  return phrase`Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow.`;
}

/** "Friday digest can't start until its file is fixed · halonic validate", for the list and the watch. */
function untilFileFixed(name: string, dir: string | undefined) {
  return phrase`${name} can't start until its file is fixed ${markPart("separator")} ${suggestedCommand("validate", dir)}`;
}

/**
 * The sentences of `halonic routines` and `halonic routines watch` (HAL-4844). cli-output has no section
 * for it yet, so these are team wording built on the `halonic runs` list, as
 * HAL-2282 allows: the same columns, times and status words. The trigger's
 * own words come from `describeTrigger` in `@halonicjs/routines`, as the
 * Studio writes them.
 */
export const routinesMessages = defineMessages("routines", {
  summary: () => phrase`List the workspace's routines, or start them on time`,
  /** `list`'s line in `halonic routines --help`: the same list as `halonic routines` (HAL-15082). */
  listSummary: () => phrase`List the workspace's routines`,
  /** What the list was doing, for "✕ Couldn't list the routines in acme: …". */
  action: (place: string) => phrase`list the routines in ${place}`,

  /** The Next column: "Next 16 Nov 09:00", "Next tomorrow 08:00", "Next 14:00". */
  next: (due: DueAt) => phrase`Next ${dueInWords(due)}`,
  /**
   * The Next column of a schedule in its own time zone, other than this
   * computer's, so the time reads as the routine's file has it (HAL-14299):
   * "Next 16:00 (Europe/Amsterdam)".
   */
  nextIn: (due: DueAt, timeZone: string) => phrase`Next ${dueInWords(due)} ${dim(`(${timeZone})`)}`,
  /**
   * The Next column of a routine whose file has errors: it can't start until
   * they are fixed (HAL-14299), in the Studio's word for it (HAL-15082). Also
   * for a routine that starts an agent on its own (HAL-15607).
   */
  cantStart: () => phrase`${markPart("failed")} Can't start`,
  /**
   * The line above the list counting the routines that can't start for a
   * reason of their own, file errors (HAL-14299) or an agent on its own
   * (HAL-15607): "! 3 routines can't start. The lines under the list say
   * why." Each has its own line there, since `validate` names only the file
   * errors (C672 #1).
   */
  routinesCantStart: (count: number) =>
    phrase`${markPart("needsYou")} ${counted(count, "routine", "routines")} can't start. ${count === 1 ? "The line under the list says" : "The lines under the list say"} why.`,
  /**
   * The line under the list for a routine whose file has errors, in the
   * watch's words, so it names the routine and the command that shows why
   * (C672 #1). `dir` is the user's own `--dir`.
   */
  fileCantStart: (name: string, dir?: string) =>
    phrase`${markPart("needsYou")} ${untilFileFixed(name, dir)}`,
  /**
   * The line above the list when routines' live versions have errors that
   * their saved files no longer have (C642 #2): `validate` reads the saved
   * files and finds nothing, so this line names the commit instead.
   */
  routinesFixNotLive: (count: number) =>
    phrase`${markPart("needsYou")} ${counted(count, "routine", "routines")} can't start until ${count === 1 ? "its fix is" : "their fixes are"} committed`,
  /**
   * The line above the list when webhook routines that are on won't start,
   * which exits 1 (C570): "! 1 routine can't start on a web request ·
   * halonic serve", which says why under each one's address.
   */
  webhookRoutinesCantStart: (count: number, dir?: string) =>
    phrase`${markPart("needsYou")} ${counted(count, "routine", "routines")} can't start on a web request ${markPart("separator")} ${suggestedCommand("serve", dir)}`,
  /**
   * The Next column of a routine that is on in a workspace that isn't
   * trusted here, so nothing starts it: the Studio's chip (HAL-15525).
   */
  pausedUntilTrusted: () => phrase`${markPart("needsYou")} Paused until trusted`,
  /**
   * The line above the list when the workspace isn't trusted on this
   * computer, so `watch` and the Studio start none of its routines
   * (HAL-15525): "! Acme isn't trusted on this computer yet, so its
   * routines don't start · halonic trust". `dir` is the user's own `--dir`.
   */
  notTrustedPaused: (workspace: string, dir?: string) =>
    phrase`${markPart("needsYou")} ${workspace} isn't trusted on this computer yet, so its routines don't start ${markPart("separator")} ${suggestedCommand("trust", dir)}`,
  /** The same, when the workspace changed since it was trusted, in `run`'s words. */
  changedPaused: (workspace: string, dir?: string) =>
    phrase`${markPart("needsYou")} ${workspace} changed since you trusted it, so its routines don't start ${markPart("separator")} ${suggestedCommand("trust", dir)}`,
  /**
   * The same, when a file names something trust can't cover, such as a URL
   * with user info: `halonic trust` would refuse too, so the line says which
   * file and why, in `trust`'s words, and how to fix it. Fixing the file
   * doesn't trust the workspace, so it ends with `halonic trust` rather than
   * `trust`'s "then try again", which here would only list again (C676). The
   * address is never shown, as it may hold a password.
   */
  refusedPaused: (workspace: string, refused: readonly RefusedFile[], dir?: string) =>
    phrase`${markPart("needsYou")} ${workspace}'s routines don't start: ${trustMessages.refused(refused).phrase} Fix the address in that file, then trust the workspace with ${suggestedCommand("trust", dir)}.`,
  /**
   * The line under the list for a routine that starts an agent on its own,
   * which Halonic can't run yet (HAL-15607): why, and the fix in the file's
   * terms, since the routine's `run` names what it starts. A routine whose
   * file has errors gets {@link fileCantStart} instead, since an agent that
   * isn't there is the first thing to fix (C672 #1).
   */
  agentCantStart: (name: string) =>
    phrase`${markPart("needsYou")} ${name} can't start: ${agentOnItsOwn()}`,
  /** The Next column of a routine that is off. */
  off: () => phrase`Off`,
  /** The Next column of a routine no clock starts: manual, a signal, mail, or a schedule that doesn't parse. */
  noSetTime: () => phrase`No set time`,
  /** The Next column of a routine that is on but no commit has, so the watch doesn't run it (HAL-15664). */
  notLiveYet: () => phrase`Not live yet`,

  /** The Last column: "Last yesterday 09:00 · ✓ Done", with the `runs` list's status words. */
  lastRun: (started: StartedAt, status: ListedStatus) =>
    phrase`Last ${startedInWords(started)} ${markPart("separator")} ${runsListMessages.status(status).phrase}`,
  /** The Last column of a routine that never started a run. */
  neverRan: () => phrase`Never ran`,

  /** The whole list when the workspace has no routine files. Not an error: exit 0. */
  noRoutines: (workspace: string) => [
    ...phrase`No routines in ${workspace} yet. `,
    dim("Add one as workflows/routines/<id>.routine.yaml in a hub."),
  ],

  /**
   * The line under the list for a routine whose saved file isn't live yet:
   * `watch` and the Studio start the last commit's (HAL-15204), as the
   * Studio's "Changes not live yet" says. In the words of `run`'s
   * {@link runMessages.changesNotLive}, since a commit makes it live.
   */
  changesNotLive: (name: string) =>
    phrase`${markPart("needsYou")} ${name} has changes that aren't live yet. It runs as last committed until you commit them or make them live ${inStudio}.`,
  /**
   * The line under the list instead, when the live version has errors and
   * the saved file has none (C642 #2): the fix is saved but not committed,
   * so the routine doesn't run as last committed either.
   */
  fixNotLive: (name: string) =>
    phrase`${markPart("needsYou")} ${name}'s fix isn't live yet, so it can't start. To start it, commit the fix or make it live ${inStudio}.`,
  /**
   * The line under the list instead, when those saved changes have errors
   * while the last commit's routine can start (HAL-15664): the row shows the
   * live version, so the errors are named here. `dir` is the user's own `--dir`.
   */
  changesNotLiveWithErrors: (name: string, dir?: string) =>
    phrase`${markPart("needsYou")} ${name} has changes that aren't live yet, with errors. It runs as last committed. See the errors with ${suggestedCommand("validate", dir)}.`,
  /**
   * The line under the list for a routine that is on but no commit has
   * (HAL-15664), in the words of the Studio's routine page: the watch and
   * the Studio don't run it until it is committed.
   */
  neverLive: (name: string) =>
    phrase`${markPart("needsYou")} ${name} isn't live yet, so it doesn't run. To start it, commit it or make it live ${inStudio}.`,
  /**
   * Ends the reason when git can't start, so the list can't tell which
   * routines' changes are live (HAL-15204), after `run`'s reason. It starts
   * with "This list", since the reason before it already has a "so" (HAL-15504).
   */
  liveNotChecked: () =>
    phrase`This list can't show which routines have changes that aren't live yet.`,
  /**
   * The line under the list when git can't start, with `run`'s reason: "! Couldn't check what's
   * live: git can't start on this computer, so the live version can't be read. This list …".
   * The list still shows, since listing needs no git; the fix follows, dimmed.
   */
  liveCheckFailed: (reason: Phrase) =>
    phrase`${markPart("needsYou")} Couldn't check what's live: ${reason}`,

  /**
   * The dim line under the list: a routine starts on time only while `watch`
   * or `serve` runs or its workspace is open in Halonic Studio, since the
   * Studio's engine and `serve` start the workspace's routines too (HAL-14205,
   * HAL-15204, HAL-18602). "Halonic
   * Studio" in full, as the allow-address error says it, since plain
   * "Halonic" is ambiguous in a terminal (HAL-15504).
   */
  watchHint: () => [
    dim(
      "Routines start on time only while this workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is running.",
    ),
  ],

  /** `watch`'s line in `halonic routines --help`. */
  watchSummary: () => phrase`Start the routines on time until you stop it`,
  /** What `watch` was doing, for "✕ Couldn't watch the routines in acme: …". */
  watchAction: (place: string) => phrase`watch the routines in ${place}`,
  /**
   * The first line of `watch`: how many routines are on a clock, and how to
   * stop. The runs that wait for a time move on while it watches too.
   */
  watching: (onAClock: number, workspace: string) =>
    phrase`Watching ${counted(onAClock, "routine", "routines")} in ${workspace}. Stop with Ctrl C.`,
  /**
   * That line instead when none is on a clock because those that are can't
   * start, each with its ✕ line above (C666 #2): the watch goes on and starts
   * one once it can, so it says to leave it running.
   */
  watchingUntilOneCanStart: (workspace: string) =>
    phrase`Watching 0 routines in ${workspace} for now. Once a routine above can start, the watch starts it on time, so leave this running. Stop with Ctrl C.`,
  /**
   * A line of `watch` for a routine whose file has errors, in the list's
   * words: the watch leaves it out, runs the others on time (HAL-15372) and
   * starts it again by itself once its file is fixed (C609).
   * "✕ Friday digest can't start until its file is fixed · halonic validate".
   * `dir` is the user's own `--dir`.
   */
  routineCantStart: (name: string, dir?: string) =>
    phrase`${markPart("failed")} ${untilFileFixed(name, dir)}`,
  /**
   * A line of `watch` for a routine that is on and starts an agent on its
   * own, which the engine refuses (C672 #1): the watch leaves it out, as the
   * list shows it "Can't start", instead of failing it when it is due.
   */
  agentRoutineCantStart: (name: string) =>
    phrase`${markPart("failed")} ${name} can't start: ${agentOnItsOwn()}`,
  /**
   * The line of `watch` before {@link watching} for the routines that are on
   * but no commit has, which the watch doesn't run (HAL-15664), so they
   * aren't missing from its count without a word (C672 #1).
   */
  routinesNeverLive: (count: number) =>
    count === 1
      ? phrase`${markPart("needsYou")} 1 routine isn't live yet, so this watch doesn't run it. To start it, commit it or make it live ${inStudio}.`
      : phrase`${markPart("needsYou")} ${counted(count, "routine", "routines")} aren't live yet, so this watch doesn't run them. To start them, commit them or make them live ${inStudio}.`,
  /**
   * That line instead when the saved file has no errors (C642 #2): the fix
   * is saved, so `validate` finds nothing, and the watch starts the routine
   * once it is committed.
   */
  routineFixNotLive: (name: string) =>
    phrase`${markPart("failed")} ${name} can't start until its fix is committed or made live ${inStudio}`,
  /**
   * A line of `watch` for a routine that is on and runs an agent in a harness
   * (Claude Code or Codex): the watch leaves it out and starts the others
   * (HAL-15396), as it does a routine whose file has errors. `harness` is the
   * id an agent file writes; the line shows its name, as doctor does.
   * "✕ Daily notes can't start: Coder runs in Claude Code, which routines
   * can't start yet. Set Coder to Halonic on its Harness page, or turn the
   * routine off.", in the Studio's shape for the same refusal (C665 row 110).
   */
  harnessRoutineCantStart: (routine: string, agent: string, harness: string) => {
    const name = trustMessages.harnessName(harness).phrase;
    return phrase`${markPart("failed")} ${routine} can't start: ${agent} runs in ${name}, which routines can't start yet. ${harnessFix(agent)}`;
  },
  /**
   * The line under {@link watching} for each webhook routine that is on: the
   * watch never starts it, `halonic serve` does (HAL-14299).
   */
  startsOnWebRequest: (name: string) =>
    phrase`${name} starts on a web request: run halonic serve for it.`,
  /** A routine run that started: "✓ Started Weekly report · run 01jd8q · due 09:00". */
  started: (name: string, runId: string, due: StartedAt) =>
    phrase`${markPart("done")} Started ${name} ${markPart("separator")} run ${runId} ${markPart("separator")} due ${startedInWords(due)}`,
  /**
   * A routine run a signal started (HAL-14305): "✓ Started On paid · run 01jd8q · signal paid 09:02",
   * with the time the signal was sent where a timed start has its due time.
   */
  startedOnSignal: (name: string, runId: string, signal: string, sent: StartedAt) =>
    phrase`${markPart("done")} Started ${name} ${markPart("separator")} run ${runId} ${markPart("separator")} signal ${signal} ${startedInWords(sent)}`,
  /**
   * The dim line for a signal start the loop guard refused (`routines.signal-loop`): the
   * signal may come from routines starting each other, or the guard couldn't check that.
   */
  refusedLoop: (name: string, signal: string) =>
    phrase`${dim(`${name} didn't start on signal ${signal}: it may come from routines starting each other. Add a "when" that stops the loop.`)}`,
  /**
   * The watch's line when a routine that couldn't start has its file fixed
   * (HAL-15664), so a server's log shows the fix was picked up.
   */
  canStartNow: (name: string) => phrase`${markPart("done")} ${name} can start now`,
  /** A routine run that didn't start; its error shows with `--debug`, as a step's retries do. */
  notStarted: (name: string, due: StartedAt) =>
    phrase`${markPart("failed")} ${name} didn't start ${markPart("separator")} due ${startedInWords(due)} ${markPart("separator")} ${dim("see why with --debug")}`,
  /** The `--debug` line under {@link notStarted}: the routine's key and the start's own error. */
  notStartedWhy: (key: string, reason: string) => phrase`Routine ${key} didn't start: ${reason}`,
  /**
   * Why a routine run of a newer version didn't start, under {@link notStartedWhy}:
   * the engine keeps the local only it was opened with (HAL-6084). When the
   * saved workspace.yaml turned it on or off, which isn't a version yet, the
   * line names that file (C755 #2): `saved` says whether Local only is on
   * through that file now, and whether it was when the watch started.
   */
  localOnlyChanged: (workspace: string, saved: SavedLocalOnly = notSaved) =>
    localOnlyChangedBy(workspace, saved),
  /**
   * Why a routine run that reads a commit didn't start in a workspace whose
   * history the watch didn't open: never expected, since only a watch with
   * history hands out a commit.
   */
  noHistoryForVersion: (commit: string) =>
    phrase`This workspace has no history, so version ${commit} can't be read.`,
  /**
   * An agent's file that the version a run reads doesn't have: the harness
   * check on "On this computer" can't read it, so the agent doesn't start.
   */
  noAgentFileInVersion: (hubId: string, agentId: string) =>
    phrase`The version this run reads has no agent ${agentId} in hub ${hubId}.`,
  /**
   * The reason when an enabled routine's agent, or an agent of its workflow,
   * is in a harness (Claude Code or Codex): `unavailable`, exit 9. `run`
   * starts such agents (HAL-6477), but `watch` doesn't yet, so the line names
   * routines rather than Halonic (HAL-13857). `harness` is the id an agent
   * file writes; the line shows its name, as doctor does.
   */
  harnessNotAvailable: (agent: string, harness: string) => {
    const name = trustMessages.harnessName(harness).phrase;
    return phrase`${agent} runs in ${name}, which routines can't start yet. ${runMessages.nothingRan().phrase}`;
  },
  /**
   * The fix when a routine's agent is in a harness: `watch` has no `--harness`
   * to move it, as `run` does, so the agent or the routine changes (HAL-11908).
   */
  harnessNotAvailableFix: (agent: string) => harnessFix(agent),
  /** A skill an agent selected that the version a run reads doesn't have: the harness run doesn't start. */
  noSkillInVersion: (hubId: string, skillId: string) =>
    phrase`The version this run reads has no skill ${skillId} for hub ${hubId}.`,
  /** The same for a run that names no version, which has nothing to read the agent's file from. */
  noVersionForAgentFile: (runId: string) =>
    phrase`Run ${runId} doesn't name the version it read, so its agent's file can't be checked.`,
  /**
   * A run of a routine whose step keeps failing: "✕ Hourly follow-up got stuck · run 01jd8q · see why with --debug".
   * The watch goes on, and the engine keeps retrying the step.
   */
  stuck: (name: string, runId: string) =>
    phrase`${markPart("failed")} ${name} got stuck ${markPart("separator")} run ${runId} ${markPart("separator")} ${dim("see why with --debug")}`,
  /** The same for a run no routine started, such as one `halonic run` left waiting. */
  runStuck: (runId: string) =>
    phrase`${markPart("failed")} A run got stuck ${markPart("separator")} run ${runId} ${markPart("separator")} ${dim("see why with --debug")}`,
  /** The `--debug` line under {@link stuck}: the run, its timer, and the step's last error. */
  stuckWhy: (runId: string, timer: string, failures: number, reason: string) =>
    phrase`Run ${runId} is stuck: its timer ${timer} failed ${failures} times, and the engine keeps retrying it: ${reason}`,
  /**
   * A run of a routine whose step kept failing for an hour, which the watch
   * cancelled: "✕ Gave up on Hourly follow-up after an hour · run 01jd8q · see why with --debug".
   */
  gaveUp: (name: string, runId: string) =>
    phrase`${markPart("failed")} Gave up on ${name} after an hour ${markPart("separator")} run ${runId} ${markPart("separator")} ${dim("see why with --debug")}`,
  /** The same for a run no routine started. */
  runGaveUp: (runId: string) =>
    phrase`${markPart("failed")} Gave up on a run after an hour ${markPart("separator")} run ${runId} ${markPart("separator")} ${dim("see why with --debug")}`,
  /** The `--debug` line under {@link gaveUp} when the run was cancelled. */
  gaveUpCancelled: (runId: string, timer: string, reason: string) =>
    phrase`Gave up on run ${runId}: its timer ${timer} kept failing for an hour, so the run was cancelled: ${reason}`,
  /** The `--debug` line under {@link gaveUp} when cancelling the run failed too. */
  gaveUpHeld: (runId: string, timer: string, reason: string, cancelReason: string) =>
    phrase`Gave up on run ${runId}: its timer ${timer} kept failing for an hour: ${reason}. Cancelling the run failed too, so its step isn't tried again until the next watch or run: ${cancelReason}`,
  /** The `--debug` line when the run log can't say which routine started a stuck run. */
  stuckRoutineUnknown: (runId: string, reason: string) =>
    phrase`Couldn't read which routine started run ${runId}: ${reason}`,
});

/** Whether Local only is on only through the saved workspace.yaml, now and when the watch started. */
export interface SavedLocalOnly {
  readonly now: boolean;
  readonly atStart: boolean;
}

const notSaved: SavedLocalOnly = { now: false, atStart: false };

/**
 * The line {@link routinesMessages.localOnlyChanged} says, by what turned local only on or off since the
 * watch started: on through the saved file now, or on only through it at the start and so turned off there.
 */
function localOnlyChangedBy(workspace: string, saved: SavedLocalOnly): Phrase {
  if (saved.now) {
    return phrase`Your saved workspace.yaml turns local only on, which counts even before it's live, but a running watch can't change local only. Stop the watch and start it again to run the routine.`;
  }
  if (saved.atStart) {
    return phrase`Your saved workspace.yaml turns local only back off, and a running watch can't change local only. Stop the watch and start it again to run the routine.`;
  }
  return phrase`This version of ${workspace} turns local only on or off, which a running watch can't change. Stop the watch and start it again to run it.`;
}
