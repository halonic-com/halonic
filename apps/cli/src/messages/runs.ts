import { defineMessages } from "./define.ts";
import { dim, markPart, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/**
 * The sentences of `halonic runs send <run-id> <event>` and
 * `halonic runs show <run-id>` (cli-output 1.9 and 3.4). `runs show` prints
 * a run's steps and receipt with `run`'s own sentences; only its heading is
 * here. Wherever a fix names a `halonic` command, `dir` is the user's own
 * `--dir`.
 */
export const runsMessages = defineMessages("runs", {
  summary: () => phrase`Show what a run did, or answer a run that's waiting for you`,
  /** What `runs send` was doing, for "✕ Couldn't send approve to run 01JD8Q: …". */
  sendAction: (event: string, runId: string) => phrase`send ${event} to run ${runId}`,
  /** The same, when there's no such run: "✕ Couldn't send approve: …". */
  sendActionNoRun: (event: string) => phrase`send ${event}`,

  sent: (event: string, runId: string, title: string) =>
    phrase`Sent ${event} to run ${runId}. ${title} goes on.`,
  /** Indented and dimmed under {@link sent}. */
  followIt: (runId: string, dir?: string) => [
    dim(`Follow it: ${suggestedCommand("runs show", dir, runId)}`),
  ],
  /** The run isn't waiting (`conflict`), with when it finished, such as "2 min ago". */
  notWaiting: (finished: string) => phrase`it isn't waiting for you. It finished ${finished}.`,
  notWaitingFix: (runId: string, dir?: string) =>
    phrase`See it with ${suggestedCommand("runs show", dir, runId)}.`,
  /** No such run, as the reason after "Couldn't send approve:" (`not_found`). */
  noRun: (runId: string, workspace: string) => phrase`there's no run ${runId} in ${workspace}.`,
  noRunFix: () => phrase`Check the run id: it's in the line that said "Waiting for you".`,

  /** "Support reply in acme · run 01JD8Q · started 14:01, finished 14:02". */
  showHeading: (
    title: string,
    workspace: string,
    runId: string,
    started: string,
    finished: string,
  ) =>
    phrase`${title} in ${workspace} ${markPart("separator")} run ${runId} ${markPart("separator")} started ${started}, finished ${finished}`,
  /**
   * After the wait step's name, in place of a time, with a ! (cli-output 3.4,
   * revision 24). Only the exact events `approve` and `reject` get their own
   * verb; any other reads "you answered hold at 14:02", as written in the
   * workflow, so Halonic never guesses what an event means.
   */
  youAnswered: (event: string, time: string) => {
    if (event === "approve") {
      return phrase`you approved at ${time}`;
    }
    if (event === "reject") {
      return phrase`you rejected at ${time}`;
    }
    return phrase`you answered ${event} at ${time}`;
  },
  /** The same place, while the run is still waiting for the answer. */
  waitingSince: (time: string) => phrase`waiting for you since ${time}`,
  /** `runs show` with an unknown id (`not_found`), the error's whole line 1. */
  showNoRun: (runId: string, workspace: string) => phrase`There's no run ${runId} in ${workspace}.`,
  /** Same shape as {@link notWaitingFix}: names the list, with the user's `--dir`. */
  showNoRunFix: (dir?: string) => phrase`See recent runs with ${suggestedCommand("runs", dir)}.`,
});
