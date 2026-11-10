import type { Mark } from "../output/paint.ts";
import { countInWords, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";
import { runMessages } from "./run.ts";
import { happenedInWords, type StartedAt } from "./runs-list.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** Where a run was when someone cancelled it, for {@link runsMessages}' `showCancelled`. */
export type CancelledAt =
  | { readonly kind: "in-step"; readonly step: string }
  /** Between steps: `step` is the next one, which never started. */
  | { readonly kind: "before-step"; readonly step: string }
  | { readonly kind: "before-start" };

/**
 * Why a run can't take an event, by its status (cli-output 3.4, revision 31):
 * how long ago it ended, written as "2 minutes ago", or the step it's running.
 */
export type NotWaiting =
  | { readonly status: "finished" | "failed" | "stopped"; readonly ago: string }
  | { readonly status: "running"; readonly step: string };

/**
 * How `runs show`'s heading ends, after "started 16:40": what happened and
 * when, with times already written by the list's When rule.
 */
export type ShownEnd =
  | { readonly status: "finished" | "failed" | "stopped" | "couldntTry"; readonly at: string }
  | { readonly status: "waiting"; readonly since: string }
  | { readonly status: "running" };

/**
 * The sentences of `halonic runs send <run-id> <event>` and
 * `halonic runs show <run-id>` (cli-output 1.9 and 3.4). `runs show` prints
 * a run's steps and receipt with `run`'s own sentences; only its heading is
 * here. Wherever a fix names a `halonic` command, `dir` is the user's own
 * `--dir`.
 */
export const runsMessages = defineMessages("runs", {
  summary: () => phrase`List runs or show what one did`,
  /**
   * `show`'s line in `halonic runs --help`, from the words of {@link summary}
   * (team wording on HAL-2742, as HAL-2282 allows).
   */
  showSummary: () => phrase`Show what one run did`,
  /** What `runs show` was doing, for "✕ Couldn't show run 01JD8Q: there's no workspace.yaml here.". */
  showAction: (runId: string) => phrase`show run ${runId}`,
  /** `send`'s line in `halonic runs --help`, from the words of {@link summary}. */
  sendSummary: () => phrase`Answer a run that's waiting for you`,
  /** What `runs send` was doing, for "✕ Couldn't send approve to run 01JD8Q: …". */
  sendAction: (event: string, runId: string) => phrase`send ${event} to run ${runId}`,
  /** The same, when there's no such run: "✕ Couldn't send approve: …". */
  sendActionNoRun: (event: string) => phrase`send ${event}`,

  sent: (event: string, runId: string, title: string) =>
    phrase`Sent ${event} to run ${runId}. ${title} goes on.`,
  /**
   * A Try it or Test run that ended at steps it couldn't try, because they
   * need changes left out of it (HAL-4285): "! Support reply couldn't try everything."
   */
  showCantTry: (title: string) => phrase`${title} couldn't try everything.`,
  /** Indented under {@link showCantTry}: the steps it didn't run, by name; none when it ran no step. */
  cantTrySteps: (steps: readonly string[]) =>
    steps.length === 0
      ? phrase`It needs changes you haven't accepted yet.`
      : phrase`It didn't run ${listInWords(steps)}: they need changes you haven't accepted yet.`,
  /** The run isn't waiting (`conflict`): when it ended, or the step it's running. */
  notWaiting: (why: NotWaiting) => phrase`it isn't waiting for you. ${notWaitingInWords(why)}`,
  notWaitingFix: (runId: string, dir?: string) =>
    phrase`See it with ${suggestedCommand("runs show", dir, runId)}.`,
  /** No such run, as the reason after "Couldn't send approve:" (`not_found`). */
  noRun: (runId: string, workspace: string) => phrase`there's no run ${runId} in ${workspace}.`,
  /** The list is where a waiting run's id is (revision 31, M12). */
  noRunFix: (dir?: string) =>
    phrase`See the runs waiting for you with ${suggestedCommand("runs", dir, "--status waiting")}.`,
  /**
   * An event the waiting step doesn't take (`invalid_input`), as the reason
   * after "Couldn't send aprove to run 01JD8Q:". `accepts` in the step's order.
   */
  eventNotTaken: (step: string, accepts: readonly string[]) =>
    phrase`the step ${step} takes ${listInWords(accepts, "or")}.`,
  /** The fix when one of the step's events is close to what was typed (cli-output 1.3). */
  eventNear: (near: string) => phrase`Did you mean ${near}?`,
  /** The fix when none is close. */
  seeTheStep: (runId: string, dir?: string) =>
    phrase`Run ${suggestedCommand("runs show", dir, runId)} to see the step.`,

  /**
   * `runs show` with a short id that two runs end in (`invalid_input`), the
   * error's whole line 1. `shortId` as stored, as the list printed it,
   * whatever case the user typed (revision 37).
   */
  showSeveralRuns: (shortId: string, workspace: string) =>
    phrase`Two runs in ${workspace} end in ${shortId}.`,
  /** The same, as the reason after "Couldn't send approve:". */
  severalRuns: (shortId: string, workspace: string) =>
    phrase`two runs in ${workspace} end in ${shortId}.`,
  /** The fix for both: the list's `--json` has the full ids. */
  severalRunsFix: (dir?: string) =>
    phrase`Use the full id, as ${suggestedCommand("runs", dir, "--json")} shows it.`,

  /**
   * "Support reply in acme · run 01jd8q · started 14:01, finished 14:02", or
   * "… · test run 01jd8q · started 10:40, waiting for you since 10:41".
   */
  showHeading: (
    title: string,
    workspace: string,
    run: { readonly id: string; readonly test: boolean },
    started: string,
    end: ShownEnd,
  ) =>
    phrase`${title} in ${workspace} ${markPart("separator")} ${run.test ? "test run" : "run"} ${run.id} ${markPart("separator")} started ${started}, ${shownEndInWords(end)}`,
  /**
   * After the wait step's name, in place of a time, with a ! (cli-output 3.4,
   * revision 24). Only the exact events `approve` and `reject` get their own
   * verb; any other reads "you answered hold at 14:02", as written in the
   * workflow, so Halonic never guesses what an event means. An answer from
   * an earlier day says which: "you approved yesterday at 16:40".
   */
  youAnswered: (event: string, at: StartedAt) => {
    const when = happenedInWords(at);
    if (event === "approve") {
      return phrase`you approved ${when}`;
    }
    if (event === "reject") {
      return phrase`you rejected ${when}`;
    }
    return phrase`you answered ${event} ${when}`;
  },
  /** The same place, while the run is still waiting for the answer. */
  waitingSince: (time: string) => phrase`waiting for you since ${time}`,
  /**
   * What a running step's line in `runs show` says after its name, a
   * snapshot: its agent and model alias, then "running since 10:53". A step
   * without an agent says only the time.
   */
  runningSince: (facts: readonly string[], time: string) =>
    facts.length === 0
      ? phrase`running since ${time}`
      : phrase`${runMessages.stepFacts(facts).phrase} ${markPart("separator")} running since ${time}`,
  /** The first column of a step's line in `runs show`: its mark and its name, "✓ Read the email". */
  step: (mark: Mark, name: string) => phrase`${markPart(mark)} ${name}`,
  /** `runs show` with an unknown id (`not_found`), the error's whole line 1. */
  showNoRun: (runId: string, workspace: string) => phrase`There's no run ${runId} in ${workspace}.`,
  /** Same shape as {@link notWaitingFix}: names the list, with the user's `--dir`. */
  showNoRunFix: (dir?: string) => phrase`See recent runs with ${suggestedCommand("runs", dir)}.`,
  /**
   * A run cancelled somewhere else, such as Studio or another shell, with no
   * line 2 (HAL-2745). Ctrl C in this shell prints cli-output 1.5's "Stopped." line instead.
   */
  showCancelled: (title: string, at: CancelledAt) => {
    if (at.kind === "in-step") {
      return phrase`${title} was cancelled in the step ${at.step}. Nothing after it ran.`;
    }
    if (at.kind === "before-step") {
      return phrase`${title} was cancelled before the step ${at.step}. Nothing after it ran.`;
    }
    return phrase`${title} was cancelled before it started.`;
  },
  /**
   * `runs show` without a run id, or with more than one (usage, exit 2); the
   * usage line is line 2. The shape of `init`'s "takes one folder name"
   * (cli-output 1.3); team wording on HAL-2742, as HAL-2282 allows.
   */
  showTakesOneRunId: (given: readonly string[]) =>
    given.length === 0
      ? phrase`halonic runs show needs a run id.`
      : phrase`halonic runs show takes one run id, and you gave ${countInWords(given.length)}: ${given.join(", ")}.`,
  /**
   * `runs send` without its run id and event, or with more (usage, exit 2);
   * the usage line is line 2. The shape of {@link showTakesOneRunId}; team
   * wording on HAL-2742, as HAL-2282 allows.
   */
  sendTakesRunIdAndEvent: (given: readonly string[]) =>
    given.length < 2
      ? phrase`halonic runs send needs a run id and an event.`
      : phrase`halonic runs send takes a run id and an event, and you gave ${countInWords(given.length)}: ${given.join(", ")}.`,
});

function notWaitingInWords(why: NotWaiting): string {
  switch (why.status) {
    case "finished":
      return `It finished ${why.ago}.`;
    case "failed":
      return `It failed ${why.ago}.`;
    case "stopped":
      return `It stopped ${why.ago}.`;
    case "running":
      return `It's running, in the step ${why.step}.`;
  }
}

function shownEndInWords(end: ShownEnd): string {
  switch (end.status) {
    case "finished":
    case "failed":
    case "stopped":
      return `${end.status} ${end.at}`;
    case "couldntTry":
      return `ended ${end.at}, couldn't try everything`;
    case "waiting":
      return `waiting for you since ${end.since}`;
    case "running":
      return "still running";
  }
}
