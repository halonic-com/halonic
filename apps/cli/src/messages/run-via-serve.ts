import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/**
 * The lines of `halonic run` when `halonic serve` holds the workspace's engine and starts the run
 * itself (`cli.local-engine-lock`, HAL-19396), so it shows in the phone's Inbox.
 */
export const runViaServeMessages = defineMessages("runViaServe", {
  /** The run started in the running `serve`; it goes on there, not in this terminal. */
  started: (runId: string) =>
    phrase`${markPart("done")} Started in the running Studio as run ${runId}. Approve it on your phone when it asks.`,
  /** Under {@link started}: where to see how far it got. */
  seeIt: (runId: string, dir?: string) =>
    phrase`See where it is: ${suggestedCommand("runs show", dir, runId)}`,
  /** `serve` refused the start; `reason` is its own sentence, such as what changed since trust. */
  notStarted: (reason: string) => phrase`halonic serve didn't start the run: ${reason}`,
  /** `serve` found no such workflow, as when its live version doesn't have it yet. */
  notInServe: () =>
    phrase`halonic serve didn't start the run: its live version has no such workflow.`,
  /** `serve` failed to start it for a reason none of Halonic's checks gave; only its log says why. */
  startFailed: () => phrase`halonic serve couldn't start the run.`,
  /** The fix under {@link startFailed}. */
  startFailedFix: () => phrase`Start halonic serve with --debug to see why, then run again.`,
  /** The input is longer than the console channel takes, in KB. */
  inputTooBig: (limitKb: number) =>
    phrase`The input is too big to hand to the running Studio (over ${String(limitKb)} KB). Nothing ran.`,
  /** The fix under {@link inputTooBig}. */
  inputTooBigFix: () => phrase`Stop halonic serve with Ctrl C there, then run again.`,
});
