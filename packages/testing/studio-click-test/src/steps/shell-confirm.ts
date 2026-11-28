import type { StepContext, StepOutcome } from "../runner.ts";
import { buttonLabels } from "../words.ts";

/**
 * How long the shell's confirmation gets to show after Approve: the agent host reads the item's
 * source again before it asks (HAL-20441), one Paperclip read.
 */
const confirmWaitMs = 30_000;

/**
 * Says yes in the shell's own "Approve this?" dialog, which an Approve of a risky item, such as
 * an approval or a hire, opens before anything reaches Paperclip (`risky-answer-confirm`). A step
 * calls it right after its Approve click, on any surface; without it the answer stays pending
 * (HAL-21189). It fails as `NO_SHELL_CONFIRMATION` when the dialog never showed or its button
 * couldn't be pressed, with the shell log's agent host lines.
 */
export async function confirmApproveInShell(context: StepContext): Promise<StepOutcome> {
  const refused = await context.pressShellDialog(
    buttonLabels.riskyApproveTitle.text,
    buttonLabels.riskyApproveButton.text,
    confirmWaitMs,
  );
  if (refused === undefined) return { passed: true };
  const log = await context.shellLog();
  return { passed: false, code: "NO_SHELL_CONFIRMATION", note: `${refused}\nshell.log:\n${log}` };
}
