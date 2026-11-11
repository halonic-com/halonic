import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { dim, markPart, phrase } from "./phrase.ts";
import {
  type DueAt,
  dueInWords,
  type ListedStatus,
  runsListMessages,
  type StartedAt,
  startedInWords,
} from "./runs-list.ts";

/**
 * The sentences of `halonic routines` and `halonic routines watch` (HAL-4844). cli-output has no section
 * for it yet, so these are team wording built on the `halonic runs` list, as
 * HAL-2282 allows: the same columns, times and status words. The trigger's
 * own words come from `describeTrigger` in `@halonicjs/routines`, as the
 * Studio writes them.
 */
export const routinesMessages = defineMessages("routines", {
  summary: () => phrase`List the workspace's routines`,
  /** What the list was doing, for "✕ Couldn't list the routines in acme: …". */
  action: (place: string) => phrase`list the routines in ${place}`,

  /** The Next column: "Next 16 Nov 09:00", "Next tomorrow 08:00", "Next 14:00". */
  next: (due: DueAt) => phrase`Next ${dueInWords(due)}`,
  /** The Next column of a routine that is off. */
  off: () => phrase`Off`,
  /** The Next column of a routine no clock starts: manual, a signal, mail, or a schedule that doesn't parse. */
  noSetTime: () => phrase`No set time`,

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
  /** A routine run that started: "✓ Started Weekly report · run 01jd8q · due 09:00". */
  started: (name: string, runId: string, due: StartedAt) =>
    phrase`${markPart("done")} Started ${name} ${markPart("separator")} run ${runId} ${markPart("separator")} due ${startedInWords(due)}`,
  /** A routine run that didn't start; its error shows with `--debug`, as a step's retries do. */
  notStarted: (name: string, due: StartedAt) =>
    phrase`${markPart("failed")} ${name} didn't start ${markPart("separator")} due ${startedInWords(due)} ${markPart("separator")} ${dim("see why with --debug")}`,
  /** The `--debug` line under {@link notStarted}: the routine's key and the start's own error. */
  notStartedWhy: (key: string, reason: string) => phrase`Routine ${key} didn't start: ${reason}`,
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
