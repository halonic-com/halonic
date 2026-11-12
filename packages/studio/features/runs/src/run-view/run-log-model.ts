// Show the run log (checklist part 1, 1.10): the run's events, numbered,
// the same events `halonic runs show --json` returns. The page only draws
// what this returns.

import { blockedSites, type RunEvent, type StepBlockedSites } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import { clockTimeWithSeconds } from "../time-words.ts";
import { logSiteLimit } from "./blocked-sites.tsx";

/** One line of the run log view. */
export type RunLogLine =
  /**
   * An event: its `seq`, the time with seconds, its `type`, and the rest of
   * its fields as one line of JSON.
   */
  | {
      readonly kind: "event";
      readonly seq: number;
      readonly time: string;
      readonly type: string;
      readonly fields: string;
    }
  /** A step's blocked sites, once per step at its first, in place of its blocked-site events. */
  | { readonly kind: "blocked"; readonly seq: number; readonly step: StepBlockedSites };

/** The fields every line already shows, or that every event of the run has alike. */
const shownApart = new Set(["runId", "seq", "at", "entry", "type"]);

/**
 * The run log view's lines, in `seq` order. Each event's fields are the
 * JSON the CLI returns, with every hidden or direction-changing character
 * written as its `\uXXXX` escape, so a value can't turn the line around.
 * A step's blocked sites become one "Blocked: …" line per site, in place of
 * their `sandbox.blocked` events (requirement `runs.run-view.blocked-sites`);
 * blocked files stay events.
 *
 * @example
 * runLogLines(events);
 * // [{ kind: "event", seq: 1, time: "10:40:00", type: "run.started", fields: '{"hubId":"acme",…}' },
 * //  { kind: "event", seq: 2, time: "10:40:00", type: "state.entered", fields: '{"state":"draft"}' }]
 */
export function runLogLines(events: readonly RunEvent[]): RunLogLine[] {
  const blockedAt = new Map(
    blockedSites(events, { limit: logSiteLimit }).map((step) => [step.firstSeq, step]),
  );
  const lines: RunLogLine[] = [];
  for (const event of events) {
    const blocked = blockedAt.get(event.seq);
    if (blocked !== undefined) {
      lines.push({ kind: "blocked", seq: event.seq, step: blocked });
    }
    if (event.type === "sandbox.blocked" && event.block.kind === "network") {
      continue;
    }
    lines.push({
      kind: "event",
      seq: event.seq,
      time: clockTimeWithSeconds(new Date(event.at)),
      type: event.type,
      fields: fieldsOf(event),
    });
  }
  return lines;
}

/** The event's own fields as one line of JSON. */
function fieldsOf(event: RunEvent): string {
  const fields = Object.entries(event).filter(([name]) => !shownApart.has(name));
  return escapeHidden(JSON.stringify(Object.fromEntries(fields)));
}
