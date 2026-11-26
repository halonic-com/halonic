import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * The debug-log lines of the auto approvals shadow runner under `halonic serve`
 * (`cli.commands.serve.auto-approvals-shadow`). A reason is one of the runner's own codes, such
 * as `read.status`, never Paperclip's text.
 */
export const serveShadowMessages = defineMessages("serveShadow", {
  /** The profile's `auto-approvals/shadow.json` can't be read or has the wrong shape. */
  configProblem: (problem: string) =>
    phrase`The auto approvals shadow runner didn't start: its config is ${problem}.`,
  /** The config names a connection without a stored Paperclip key. */
  noStoredKey: () =>
    phrase`The auto approvals shadow runner didn't start: its connection has no stored Paperclip key.`,
  /** The runner halted; only a person restarting `serve` starts it again. */
  halted: (reason: string) =>
    phrase`The auto approvals shadow runner halted (${reason}). Restart serve once you've looked.`,
  /** One poll stopped early; the runner polls again later. */
  pollStopped: (reason: string) => phrase`An auto approvals shadow poll stopped: ${reason}.`,
});
