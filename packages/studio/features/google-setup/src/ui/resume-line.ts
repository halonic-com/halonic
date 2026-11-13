import type { SetupStep } from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "../api.ts";

/** "8 Nov": the day and the short month, in the order the design writes them. */
function startedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "Steps 1–3 are done." for the finished steps, which may have gaps: "Steps 1, 2 and 4 are done." */
function doneWords(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Step ${numbers[0]} is done.`;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const unbroken = last !== undefined && first !== undefined && last - first + 1 === numbers.length;
  if (unbroken) return `Steps ${first}–${last} are done.`;
  const head = numbers.slice(0, -1).join(", ");
  return `Steps ${head} and ${last} are done.`;
}

/**
 * What the item says at the top when it opens on a setup that is under way: "You started this on
 * 8 Nov. Steps 1–3 are done." Counted from the generated steps, so the numbers follow them.
 */
export function resumeLine(account: GoogleSetupAccount, steps: readonly SetupStep[]): string {
  const started = `You started this on ${startedOn(account.record.startedAt)}.`;
  const numbers = steps
    .filter((step) => account.record.stepsDone[step.id] !== undefined)
    .map((step) => step.number);
  return numbers.length === 0 ? started : `${started} ${doneWords(numbers)}`;
}
