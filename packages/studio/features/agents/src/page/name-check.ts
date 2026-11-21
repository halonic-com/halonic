import { pageWords } from "./page-words.ts";

/**
 * Checks a new name for the agent (`agents.page.rename`) as the header's name field has it, trimmed
 * and different from the name now: why it can't be kept, or `undefined` when it can. The names of
 * the hub's other agents are taken, whatever their case.
 */
export function nameProblem(name: string, takenNames: readonly string[]): string | undefined {
  const taken = takenNames.some((other) => other.toLowerCase() === name.toLowerCase());
  return taken ? pageWords.nameTaken(name) : undefined;
}
