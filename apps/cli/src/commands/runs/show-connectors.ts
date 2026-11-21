// Why a step of `halonic runs show` is marked "!" for a connector that
// didn't start (HAL-15081, C540 #3): `halonic run` warns about it while the
// run goes, and this says the same later, from the run's log alone.

import type { ConnectorPartOffReason, RunEvent } from "@halonicjs/events";
import { connectorStartMessages, type ShownPart } from "../../messages/connector-start.ts";
import { type Phrase, phrase } from "../../messages/phrase.ts";
import { printable } from "../../output/printable.ts";
import { connectorWarnings } from "../run/connector-warnings.ts";

type PartOff = Extract<RunEvent, { type: "connector.part-off" }>;

/**
 * The lines under the steps for each connector the run's log says didn't
 * start, after a blank line; none when every connector started. A
 * `connector.listing-failed` reads as `halonic run`'s warning does
 * (`connectorWarnings`), so the two commands say the same. A connector whose
 * parts the log names as off gets one warning for each part and reason
 * instead, since that is the warning `halonic run` gave for it.
 *
 * @param dir - the user's own `--dir`, for the command it suggests
 * @param fileOf - the path of a connector's file in the workspace, or
 *   `undefined` when it has none
 * @example
 * connectorNotStartedLines(run.events, undefined, () => undefined).map(plainText);
 * // ["", "! The backend of orders didn't start, so its tools are off in this run.",
 * //  "  To see why, run halonic tools review orders"]
 */
export function connectorNotStartedLines(
  events: readonly RunEvent[],
  dir: string | undefined,
  fileOf: (connector: string) => string | undefined,
): Phrase[] {
  const lines: Phrase[] = [];
  const warnListing = connectorWarnings({ warn: (line) => lines.push(line) }, dir, fileOf);
  const told = new Set<string>();
  for (const event of events) {
    warnListing(event);
    if (event.type !== "connector.part-off") continue;
    const key = JSON.stringify([event.connector, event.part, event.reason]);
    if (told.has(key)) continue;
    told.add(key);
    lines.push(...partOffLines(event, dir));
  }
  return lines.length === 0 ? [] : [[], ...lines];
}

/** A part's warning: which part didn't start, why when the log says, and the command that shows more. */
function partOffLines(event: PartOff, dir: string | undefined): Phrase[] {
  const connector = printable(event.connector);
  const why = partOffWhy(event.reason);
  return [
    connectorStartMessages.partOff(connector, shownPart(event.part)).phrase,
    ...(why === undefined ? [] : [phrase`  ${why}`]),
    phrase`  ${connectorStartMessages.notListedFix(event.connector, dir).phrase}`,
  ];
}

/** `backend`, or `local:` and a program's name, as the log writes the part. */
function shownPart(part: string): ShownPart {
  return part.startsWith("local:")
    ? { kind: "program", name: printable(part.slice("local:".length)) }
    : { kind: "backend" };
}

/** The line for a reason the log gives; `undefined` for `failed`, which says nothing more. */
function partOffWhy(reason: ConnectorPartOffReason): Phrase | undefined {
  switch (reason) {
    case "needs-desktop-app":
      return connectorStartMessages.partOffNeedsDesktopApp().phrase;
    case "sandbox-unavailable":
      return connectorStartMessages.partOffSandboxUnavailable().phrase;
    case "sandbox-not-fenced":
      return connectorStartMessages.partOffSandboxNotFenced().phrase;
    case "network-needs-srt":
      return connectorStartMessages.partOffNetworkNeedsSrt().phrase;
    case "settings-not-set":
      return connectorStartMessages.partOffSettingsNotSet().phrase;
    case "not-trusted":
      return connectorStartMessages.partOffNotTrusted().phrase;
    case "failed":
      return undefined;
  }
}
