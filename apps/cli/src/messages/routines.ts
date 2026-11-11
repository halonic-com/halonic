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
 * The sentences of `halonic routines` (HAL-4844). cli-output has no section
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
});
