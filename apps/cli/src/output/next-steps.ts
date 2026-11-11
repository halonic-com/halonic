import { initMessages } from "../messages/init.ts";
import { type Phrase, phrase, visibleLength } from "../messages/phrase.ts";

/** One command in a `Next:` block, with the few dimmed words that say why. */
export interface NextStep {
  readonly command: Phrase;
  readonly why?: Phrase;
}

/**
 * Where the why-words start, counted from the command: the column of
 * cli-output 3.1, wide enough for `halonic validate` and `halonic test`.
 */
const commandWidth = 36;

/** The least space between a long command and its why-words (cli-output 1.6). */
const leastGap = 2;

/**
 * The `Next:` block after a command that has an obvious next thing
 * (cli-output 1.6): an empty line, the heading, then each step indented, its
 * why-words set apart by spaces only, so the command can still be copied on
 * its own. A last line, when given, follows the steps as a choice.
 *
 * @example
 * nextSteps([{ command: initMessages.nextChangeFolder("acme").phrase }], firstAgentLine);
 * // ["", "Next:", "  cd acme", "  Add your first agent: https://docs.halonic.com/…"]
 */
export function nextSteps(steps: readonly NextStep[], last?: Phrase): Phrase[] {
  return [
    [],
    initMessages.nextHeading().phrase,
    ...steps.map(stepLine),
    ...(last === undefined ? [] : [phrase`  ${last}`]),
  ];
}

function stepLine({ command, why }: NextStep): Phrase {
  if (why === undefined) {
    return phrase`  ${command}`;
  }
  const gap = Math.max(leastGap, commandWidth - visibleLength(command, true));
  return phrase`  ${command}${" ".repeat(gap)}${why}`;
}
