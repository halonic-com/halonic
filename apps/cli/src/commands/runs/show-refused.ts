// Why a run sent nothing (HAL-15772): a call to a tool labelled `send`
// that the run refused because its connector may not send is logged as
// `tool.refused` with `sending-off`, and `halonic runs show` says so.

import type { RunEvent } from "@halonicjs/events";
import type { Phrase } from "../../messages/phrase.ts";
import { runsMessages } from "../../messages/runs.ts";
import { printable } from "../../output/printable.ts";

/**
 * The lines under the steps for each tool and connector the run's log says
 * a send was refused for, once each, in the order of the log, after a
 * blank line; none when no send was refused.
 *
 * @example
 * sendingOffLines(run.events).map(plainText);
 * // ["", "! The call to send_mail was refused: sending is off for mail, so nothing was sent."]
 */
export function sendingOffLines(events: readonly RunEvent[]): Phrase[] {
  const lines: Phrase[] = [];
  const told = new Set<string>();
  for (const event of events) {
    if (event.type !== "tool.refused" || event.reason !== "sending-off") continue;
    const key = JSON.stringify([event.connector, event.tool]);
    if (told.has(key)) continue;
    told.add(key);
    lines.push(
      runsMessages.showSendingOff(printable(event.tool), printable(event.connector)).phrase,
    );
  }
  return lines.length === 0 ? [] : [[], ...lines];
}
