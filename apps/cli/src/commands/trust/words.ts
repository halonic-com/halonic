import { UsageError } from "../../command.ts";
import type { Message } from "../../messages/define.ts";
import { usageMessages } from "../../messages/general.ts";
import { trustMessages } from "../../messages/trust.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";

/** Words people type for an option of `trust`, for "Did you mean" (HAL-14124). */
const optionWords: Readonly<Record<string, string>> = {
  revoke: "--remove",
  remove: "--remove",
  delete: "--remove",
  forget: "--remove",
  untrust: "--remove",
  list: "--list",
  ls: "--list",
};

/**
 * The fix line when `trust`, which takes only options, gets a word: `revoke`
 * gets the option it likely means, "Did you mean --remove?" (HAL-14124), and
 * any other word `--dir` with it, as for other commands (HAL-12639).
 */
export function optionForWord(word: string): Message {
  const typed = word.toLowerCase();
  const near = Object.hasOwn(optionWords, typed)
    ? optionWords[typed]
    : nearMatch(`--${typed}`, ["--list", "--remove"]);
  return near === undefined
    ? usageMessages.useDirOption("trust", word)
    : trustMessages.optionNear(near);
}

/**
 * `trust` takes no word besides its subcommand, as before it had one: one
 * word gets the option it likely means (HAL-14124), several the usage line.
 *
 * @throws UsageError for any word
 */
export function refuseWords(given: readonly string[]): void {
  const shown = given.map(printable);
  const [word] = shown;
  if (word === undefined) return;
  const problem = usageMessages.takesNoArguments("trust", shown);
  throw shown.length === 1 ? new UsageError(problem, optionForWord(word)) : new UsageError(problem);
}
