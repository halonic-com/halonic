import type { RunEvent } from "./run-event.ts";
import { countNoun, type SendCount } from "./run-sends.ts";

/**
 * What a run read, worked out from its log by the reader rules of requirement
 * `events.tool-result-risk`: one count per noun in the order of each noun's
 * first call, for every `tool.result` with `risk: "read"`, a `noun` and
 * `outcome: "ok"`. Pure; the receipt says "Read 3 emails" from it.
 *
 * @param events - the run's events, oldest first
 * @returns the reads, noun by noun; empty when the run read nothing it can name
 *
 * @example
 * readsOf(events);
 * // gmail_read_message twice, drive_get_file once => [2 emails, 1 Drive file]
 */
export function readsOf(events: readonly RunEvent[]): SendCount[] {
  const counts: SendCount[] = [];
  for (const event of events) {
    if (event.type !== "tool.result" || event.risk !== "read") continue;
    if (event.outcome !== "ok" || event.noun === undefined) continue;
    countNoun(counts, event.noun);
  }
  return counts;
}

/**
 * What a run drafted: the ok calls of a write tool whose `verb` is
 * "drafted", counted per noun like {@link readsOf}. A draft is not a send.
 *
 * @example
 * draftsOf(events);
 * // gmail_create_draft once => [1 email]
 */
export function draftsOf(events: readonly RunEvent[]): SendCount[] {
  const counts: SendCount[] = [];
  for (const event of events) {
    if (event.type !== "tool.result" || event.risk !== "write") continue;
    if (event.outcome !== "ok" || event.verb !== "drafted" || event.noun === undefined) continue;
    countNoun(counts, event.noun);
  }
  return counts;
}
