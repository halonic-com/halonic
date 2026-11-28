import { runPageWords } from "../run-words.ts";

/**
 * The words of the can't-run Callout (microcopy 23.3, "Can't run, workflow", "Can't run, agent",
 * "Can't run, routine", "Checking", "Works again", and HAL-19614's line while the host starts). The reason and the fix come from the one
 * catalogue, `sandboxStartWords`; these are the lines around them. Placeholders until HAL-1784 is
 * approved: reviewers check the keys, not the words.
 */
export const cantRunWords = {
  /** The first line, and the description of every control it disables. */
  cantRun: (name: string) => `${name} can't run: the sandbox can't start on this computer.`,
  /**
   * The line while the first check hasn't answered, and the description of every control it turns
   * off (HAL-19614).
   */
  hostStarting: "The agent host is still starting…",
  checkAgain: runPageWords.sandboxCheckAgain,
  checking: "Checking…",
  docsBase: runPageWords.sandboxDocsBase,
  /** Said once when **Check again** finds the sandbox ready; the Callout goes. */
  ready: (name: string) => `The sandbox works now. You can run ${name}.`,
  checkedRefused: runPageWords.sandboxCheckedRefused,
  checkFailed: runPageWords.sandboxCheckFailed,
} as const;
