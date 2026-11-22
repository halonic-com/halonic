// Why a run sent nothing (HAL-15772): a call to a tool labelled `send`
// that the run refused because its connector may not send is logged as
// `tool.refused` with `sending-off`, and `halonic runs show` says so, with
// how to switch sending on where the CLI can (HAL-15891, C646), as the
// model's refusal does (`run-sending.ts`).

import type { RunEvent } from "@halonicjs/events";
import { type Phrase, phrase } from "../../messages/phrase.ts";
import { runsMessages } from "../../messages/runs.ts";
import { printable } from "../../output/printable.ts";

/**
 * The lines under the steps for each tool and connector the run's log says
 * a send was refused for, once each, in the order of the log, after a
 * blank line; none when no send was refused. Under each, indented, how to
 * switch sending on: the `allow-sending` command for a Google connector,
 * else that the CLI can't yet.
 *
 * @param dir - the user's own `--dir`, for the command it suggests
 * @param isGoogle - whether a connector is a Google one of the workspace's own files
 * @example
 * sendingOffLines(run.events, undefined, () => true).map(plainText);
 * // ["", "! The call to send_mail was refused: sending is off for mail, so nothing was sent.",
 * //  "  To switch it on, run halonic google allow-sending mail on"]
 */
export function sendingOffLines(
  events: readonly RunEvent[],
  dir: string | undefined,
  isGoogle: (connector: string) => boolean,
): Phrase[] {
  const lines: Phrase[] = [];
  const told = new Set<string>();
  for (const event of events) {
    if (event.type !== "tool.refused" || event.reason !== "sending-off") continue;
    const key = JSON.stringify([event.connector, event.tool]);
    if (told.has(key)) continue;
    told.add(key);
    const fix = isGoogle(event.connector)
      ? runsMessages.showSendingOffFix(event.connector, dir)
      : runsMessages.showSendingOffNoFix();
    lines.push(
      runsMessages.showSendingOff(printable(event.tool), printable(event.connector)).phrase,
      phrase`  ${fix.phrase}`,
    );
  }
  return lines.length === 0 ? [] : [[], ...lines];
}
