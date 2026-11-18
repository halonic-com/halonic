import { refusalStatusLine } from "@halonicjs/app";
import { escapeListedText } from "@halonicjs/app/listed-tools";
import type { ChatTurnRefusal } from "@halonicjs/ports";

/** One part of a refusal's line: plain text, or a tool's name, which the view sets in code type. */
export interface RefusalLinePart {
  readonly text: string;
  readonly code?: true;
}

/**
 * The one place that turns one refusal into one line for the status view, in parts so a tool's
 * name can be set in code type. A refusal of a listing, a tool or a keyword is worded by
 * `refusalStatusLine` from `@halonicjs/app`, which also words it in the integration status of
 * the app; only a refused call, which a listing never has, is worded here (UX check C4).
 *
 * The line is for the user only: show each part as text, never as Markdown or HTML, and never give
 * it to the model, because it repeats what a server wrote.
 *
 * @example
 * refusalLine({ source: "notes-mcp", name: "create_note", refused: "call", reason: "the folder is read-only" });
 * // [{ text: "notes-mcp refused a call to " }, { text: "create_note", code: true },
 * //  { text: ": the folder is read-only." }]
 */
export function refusalLine(refusal: ChatTurnRefusal): readonly RefusalLinePart[] {
  if (refusal.refused !== "call") {
    return [{ text: refusalStatusLine({ ...refusal, refused: refusal.refused }) }];
  }
  const source = escapeListedText(refusal.source);
  const reason = withFullStop(refusal.reason);
  if (refusal.name === undefined) return [{ text: `${source} refused a call: ${reason}` }];
  return [
    { text: `${source} refused a call to ` },
    { text: refusal.name, code: true },
    { text: `: ${reason}` },
  ];
}

/** The line as plain text, for a key or a screen reader: its parts one after the other. */
export function refusalLineText(parts: readonly RefusalLinePart[]): string {
  return parts.map(({ text }) => text).join("");
}

/** The reason with one full stop at the end, unless it already ends a sentence. */
function withFullStop(reason: string): string {
  return /[.!?]$/.test(reason) ? reason : `${reason}.`;
}
