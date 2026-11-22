// The line under a step of `halonic runs show` for each tool call of the
// step that failed (HAL-15149, C540 #3): the words Studio's step panel says
// under the same call, from `@halonicjs/app/failed-call`, filled with plain
// text. The step keeps its ✓: it finished, and its agent may have got past
// the call (requirement `cli.run-view-failed-call`).

import {
  type FailedCallText,
  failedCallLine,
  failedCallParts,
  failedToolCalls,
} from "@halonicjs/app/failed-call";
import type { RunEvent } from "@halonicjs/events";
import { dimmed, type Phrase, phrase } from "./messages/phrase.ts";
import { printable } from "./output/printable.ts";

/**
 * One dim line, indented two spaces, for each call in `stepLog` (one step's
 * events from `events`) that failed, in the order the calls were asked for;
 * none when every call worked.
 *
 * @example
 * failedCallLines(events, stepLog).map(plainText);
 * // ["  Didn't work: the tool search_pages (notion) didn't answer within 60 seconds, so it may or may not have done its work."]
 */
export function failedCallLines(
  events: readonly RunEvent[],
  stepLog: readonly RunEvent[],
): Phrase[] {
  return failedToolCalls(events, stepLog).map(({ tool, failed }) =>
    dimmed(phrase`  ${plainWords(failedCallLine(tool, failed))}`),
  );
}

/** The line's words with the names from the log printed as they are, made printable. */
function plainWords(text: FailedCallText): string {
  return failedCallParts(text)
    .map((part) => (typeof part === "string" ? part : printable(part.name)))
    .join("");
}
