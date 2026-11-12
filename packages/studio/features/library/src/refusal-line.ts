import { refusalStatusLine } from "@halonicjs/app";
import { escapeListedText } from "@halonicjs/app/listed-tools";
import type { ChatTurnRefusal } from "@halonicjs/ports";

/**
 * The one place that turns one refusal into one line of plain text for the status view.
 * A refusal of a listing, a tool or a keyword is worded by `refusalStatusLine` from
 * `@halonicjs/app`, which also words it in the integration status of the app; only a refused
 * call, which a listing never has, is worded here.
 *
 * The line is for the user only: show it as text, never as Markdown or HTML, and never give it
 * to the model, because it repeats what a server wrote.
 *
 * @example
 * refusalLine({ source: "notes", name: "look up", refused: "tool", reason: "its name breaks the name rule" });
 * // 'notes: left out "look up": its name breaks the name rule'
 */
export function refusalLine(refusal: ChatTurnRefusal): string {
  if (refusal.refused === "call") {
    const name = refusal.name === undefined ? "" : ` "${refusal.name}"`;
    return `${escapeListedText(refusal.source)}: refused a call to${name}: ${refusal.reason}`;
  }
  return refusalStatusLine({ ...refusal, refused: refusal.refused });
}
