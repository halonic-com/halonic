import { nearMatch } from "../near-match.ts";
import type { Mark } from "../output/paint.ts";
import { type CalendarDay, dayInWords } from "./dates.ts";
import { defineMessages } from "./define.ts";
import { dim, markPart, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** The four values `--status` takes, as the run log stores a run's status. */
export const statusFilters = ["running", "waiting", "completed", "failed"] as const;

/** One value of `--status`. */
export type StatusFilter = (typeof statusFilters)[number];

/**
 * What the list says a run is, with Studio's status words (cli-output 3.4):
 * a waiting run is `needsYou` when it waits for the user and `waiting` when
 * it waits for a time or a child run; a failed run is `stopped` when its
 * reason is `budget` or `cancelled`. `couldntTry` is a Try it or Test run
 * that ended at a step it couldn't try: neither done nor failed.
 */
export type ListedStatus =
  | "running"
  | "needsYou"
  | "waiting"
  | "done"
  | "failed"
  | "stopped"
  | "couldntTry";

/** The filters the user gave, kept so a suggested command can repeat them. */
export interface ListFilters {
  readonly status?: StatusFilter;
  /** The workflow id, as the user typed it. */
  readonly workflow?: string;
}

/** Filters with at least one of the two set: what "matches nothing" is about. */
export type GivenFilters =
  | (ListFilters & { readonly status: StatusFilter })
  | (ListFilters & { readonly workflow: string });

/**
 * When a run started, in the computer's own time zone, as the When column
 * writes it. Times are already written as "10:31".
 */
export type StartedAt =
  | { readonly day: "today"; readonly time: string }
  | { readonly day: "yesterday"; readonly time: string }
  | { readonly day: "thisYear"; readonly date: CalendarDay; readonly time: string }
  | { readonly day: "earlier"; readonly date: CalendarDay; readonly year: number };

/**
 * When a waiting run's timer is due, in the computer's own time zone, as the
 * What column writes it. Times are already written as "14:00".
 */
export type DueAt =
  | { readonly day: "today"; readonly time: string }
  | { readonly day: "tomorrow"; readonly time: string }
  | { readonly day: "later"; readonly date: CalendarDay; readonly time: string };

const statusLooks: Readonly<Record<ListedStatus, { readonly mark: Mark; readonly word: string }>> =
  {
    running: { mark: "working", word: "Running" },
    needsYou: { mark: "needsYou", word: "Needs you" },
    waiting: { mark: "working", word: "Waiting" },
    done: { mark: "done", word: "Done" },
    failed: { mark: "failed", word: "Failed" },
    stopped: { mark: "failed", word: "Stopped" },
    couldntTry: { mark: "needsYou", word: "Couldn't try" },
  };

/**
 * "runs" with what `--status` asked for, as the empty line and the cut-off
 * line name them: "live runs", "runs waiting for you", "finished runs",
 * "failed runs". With `--workflow`, "of support-reply" goes right after "runs".
 */
const runsAskedFor: Readonly<Record<StatusFilter | "any", (ofWorkflow: string) => string>> = {
  any: (ofWorkflow) => `runs${ofWorkflow}`,
  running: (ofWorkflow) => `live runs${ofWorkflow}`,
  waiting: (ofWorkflow) => `runs${ofWorkflow} waiting for you`,
  completed: (ofWorkflow) => `finished runs${ofWorkflow}`,
  failed: (ofWorkflow) => `failed runs${ofWorkflow}`,
};

/**
 * Studio's words for a status, which the list prints, mapped to the
 * `--status` value they mean, for "Did you mean" (cli-output 3.4).
 */
const studioStatusWords: ReadonlyMap<string, StatusFilter> = new Map([
  ["done", "completed"],
  ["needs-you", "waiting"],
  ["needs", "waiting"],
  ["live", "running"],
  ["stopped", "failed"],
]);

/**
 * The sentences of the bare `halonic runs` list (cli-output 3.4, "the list",
 * revisions 27 and 28): each column of a run's row, the line when `--limit`
 * leaves runs out, the lines for no runs and for filters that match nothing,
 * and the errors of the list's own options. Wherever a line names a
 * `halonic` command, `dir` is the user's own `--dir`.
 *
 * Money, durations and times come in already written, as the receipt's do.
 * Columns are padded and the When column dimmed by the list's printer, so
 * the words here stay the same in `--json`.
 */
export const runsListMessages = defineMessages("runsList", {
  /** The Status column: the mark and Studio's status word, "✓ Done". */
  status: (status: ListedStatus) =>
    phrase`${markPart(statusLooks[status].mark)} ${statusLooks[status].word}`,

  /** What: a running run, and a failed one other than Stopped, name their step. */
  inStep: (step: string) => phrase`In ${step}`,
  /** What: a run at a wait step, with the waiting line's own words. */
  waitingForYou: (description: string) => phrase`Waiting for you: ${description}`,
  /** What: a wait step without a description. */
  waitingInStep: (step: string) => phrase`Waiting for you in the step ${step}`,
  /**
   * What: a tool approval in an agent step (revision 31, M5). Studio's row
   * names the tool's action; until that catalogue key is on `main`, the
   * list names the step, never a guess at what the tool does.
   */
  waitingForApproval: (step: string) => phrase`Waiting for your approval in the step ${step}`,
  /** What: a run waiting for a time: "Waiting until 14:00", "until tomorrow 08:00", "until 3 Dec 08:00". */
  waitingUntil: (due: DueAt) => phrase`Waiting until ${dueInWords(due)}`,
  /** What: a run waiting for a child run, by the child's short id. */
  waitingForChildRun: (runId: string) => phrase`Waiting for child run ${runId}`,
  /** What: a waiting run with no approval, child run, event or timer to wait for. */
  waitingIn: (step: string) => phrase`Waiting in ${step}`,
  /**
   * What: a completed run without a tool call (revision 32), then its
   * estimated cost when it made a priced call: "Sent nothing · estimated
   * cost €0.02". On the test model just "Sent nothing".
   */
  sentNothing: (money?: string) =>
    money === undefined
      ? phrase`Sent nothing`
      : phrase`Sent nothing ${markPart("separator")} estimated cost ${money}`,
  /** What: a completed run with tool calls and a priced call. */
  estimatedCost: (money: string) => phrase`Estimated cost ${money}`,
  /** What: a completed run with tool calls but no priced call, by the step it finished in. */
  finishedIn: (step: string) => phrase`Finished in ${step}`,
  /** What: a run stopped at its budget. */
  budgetReached: (step: string) => phrase`Budget reached in ${step}`,
  /** What: a run cancelled with Ctrl C or SIGTERM. */
  cancelledIn: (step: string) => phrase`Cancelled in ${step}`,

  /** When: the start, then " · took 18 s" once the run has ended. Live rows have no "took". */
  when: (started: StartedAt, took?: string) => {
    const start = startedInWords(started);
    return took === undefined
      ? phrase`${start}`
      : phrase`${start} ${markPart("separator")} took ${took}`;
  },

  /** Dimmed, after the last row, when `--limit` left runs out. */
  leftOut: (shown: number, total: number, filters: ListFilters, dir?: string) => {
    const newest = shown === 1 ? "the newest" : `the ${shown} newest`;
    const everyRun = suggestedCommand(
      "runs",
      dir,
      [...filterOptions(filters), `--limit ${total}`].join(" "),
    );
    return [
      dim(`Showing ${newest} of ${total} ${runsNamed(filters)}. See them all with ${everyRun}.`),
    ];
  },

  /** No real runs at all, whatever the filters. */
  noRunsYet: (workspace: string, dir?: string) =>
    phrase`No runs in ${workspace} yet. Start one with ${suggestedCommand("run", dir, "<workflow>")}.`,
  /** Only test runs, which the list never shows. */
  onlyTestRuns: (workspace: string, dir?: string) =>
    phrase`No runs in ${workspace} yet, only test runs. Start one with ${suggestedCommand("run", dir, "<workflow>")}.`,
  /** Line 1 when the filters match nothing. Not an error: no mark, exit 0. */
  noMatch: (filters: GivenFilters, workspace: string) =>
    phrase`No ${runsNamed(filters)} in ${workspace}.`,
  /** Line 2 under {@link noMatch}, indented and dimmed: the command line's "Clear filters". */
  seeEveryRun: (dir?: string) => [dim(`See every run with ${suggestedCommand("runs", dir)}.`)],

  /** The help line of `--status <status>`. */
  statusOption: () =>
    phrase`Only the runs with this status: running, waiting, completed or failed.`,
  /** The help line of `--workflow <id>`. */
  workflowOption: () => phrase`Only the runs of this workflow, by its id.`,
  /** The help line of `--limit <n>`. */
  limitOption: () => phrase`How many of the newest runs to show; 20 if you leave it out.`,

  /** What the list was doing, for "✕ Couldn't list the runs in acme: …". */
  action: (place: string) => phrase`list the runs in ${place}`,
  /** Line 1 when `--status` isn't one of the four (usage). */
  statusNotOneOf: (given: string) =>
    phrase`--status takes running, waiting, completed or failed, and you gave "${given}".`,
  /** Line 2 under {@link statusNotOneOf}, when {@link statusYouMeant} has a guess. */
  statusNear: (near: StatusFilter) => phrase`Did you mean ${near}?`,
  /** Line 1 when `--limit` isn't a whole number of 1 or more (usage). */
  limitNotWhole: (given: string) =>
    phrase`--limit takes a whole number of 1 or more, and you gave "${given}".`,
});

/**
 * The `--status` value the user probably meant, for "Did you mean": Studio's
 * own status words first, because the list prints them, then any value
 * within two edits of one of the four (cli-output 1.3 and 3.4).
 *
 * @example
 * statusYouMeant("done"); // "completed"
 * statusYouMeant("faild"); // "failed"
 * statusYouMeant("purple"); // undefined
 */
export function statusYouMeant(given: string): StatusFilter | undefined {
  const typed = given.toLowerCase();
  return (
    studioStatusWords.get(typed) ?? (nearMatch(typed, statusFilters) as StatusFilter | undefined)
  );
}

/**
 * When a run started or ended, as the When column writes it: "10:31",
 * "yesterday 16:40", "3 Nov 09:12" or "3 Mar 2025". `runs show`'s heading
 * writes its times the same way (cli-output 3.4, revision 31).
 */
export function startedInWords(started: StartedAt): string {
  switch (started.day) {
    case "today":
      return started.time;
    case "yesterday":
      return `yesterday ${started.time}`;
    case "thisYear":
      return `${dayInWords(started.date)} ${started.time}`;
    case "earlier":
      return `${dayInWords(started.date)} ${started.year}`;
  }
}

/**
 * When something happened in a run, as a sentence ends with it: "at 14:02",
 * "yesterday at 16:40", "on 3 Nov at 09:12" or "on 3 Mar 2025". The When
 * column's words, made to read after a verb ("you approved at 14:02"); team
 * wording on HAL-2742, as HAL-2282 allows.
 */
export function happenedInWords(at: StartedAt): string {
  switch (at.day) {
    case "today":
      return `at ${at.time}`;
    case "yesterday":
      return `yesterday at ${at.time}`;
    case "thisYear":
      return `on ${dayInWords(at.date)} at ${at.time}`;
    case "earlier":
      return `on ${dayInWords(at.date)} ${at.year}`;
  }
}

function dueInWords(due: DueAt): string {
  switch (due.day) {
    case "today":
      return due.time;
    case "tomorrow":
      return `tomorrow ${due.time}`;
    case "later":
      return `${dayInWords(due.date)} ${due.time}`;
  }
}

function runsNamed(filters: ListFilters): string {
  const ofWorkflow = filters.workflow === undefined ? "" : ` of ${filters.workflow}`;
  return runsAskedFor[filters.status ?? "any"](ofWorkflow);
}

/** The user's own filters, written as options, so a suggested command keeps them. */
function filterOptions(filters: ListFilters): string[] {
  const options: string[] = [];
  if (filters.status !== undefined) {
    options.push(`--status ${filters.status}`);
  }
  if (filters.workflow !== undefined) {
    options.push(`--workflow ${filters.workflow}`);
  }
  return options;
}
