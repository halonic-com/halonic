// What a wait step asks, under "! Waiting for you: Approve this reply?", so
// the person reads the reply they approve before they answer (HAL-19285), as
// Studio's wait card shows it.

import type { RunSummary } from "@halonicjs/events";
import type { Phrase } from "../../messages/phrase.ts";
import { printable } from "../../output/printable.ts";

/**
 * The wait's body, each of its lines indented 2 spaces, with a blank line
 * before and after it. No colour, and no breaks of our own: a long line
 * wraps in the terminal as the run's other long lines do. A wait without a
 * body, or a run waiting for tool approvals, has no lines here. The body
 * comes from the workflow and the model, so each line is made printable.
 *
 * @example
 * waitBodyLines(summary);
 * // [[], ["  Sorry your order arrived damaged, Sam."], [], ["  Acme support"], []]
 */
export function waitBodyLines(summary: RunSummary): Phrase[] {
  const body = summary.approvals.length > 0 ? undefined : summary.waitingFor?.body?.trim();
  if (body === undefined || body.length === 0) {
    return [];
  }
  const lines = body
    .split(/\r?\n/)
    .map((line): Phrase => (line.trim().length === 0 ? [] : [`  ${printable(line.trimEnd())}`]));
  return [[], ...lines, []];
}
