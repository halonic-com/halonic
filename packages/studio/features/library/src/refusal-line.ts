import type { ChatTurnRefusal } from "@halonicjs/ports";

/** What the status says the host did, for each kind of refusal. */
const whatWasRefused: Record<ChatTurnRefusal["refused"], string> = {
  tool: "left out",
  keyword: "left out a keyword of",
  listing: "left out its tool list",
  call: "refused a call to",
};

/**
 * The one place that turns one refusal into one line of plain text for the status view.
 * HAL-998 replaces the body with `refusalStatusLine` from `@halonicjs/app`.
 *
 * The line is for the user only: show it as text, never as Markdown or HTML, and never give it
 * to the model, because it repeats what a server wrote.
 *
 * @example
 * refusalLine({ source: "notes", name: "look up", refused: "tool", reason: "its name breaks the name rule" });
 * // 'notes: left out "look up": its name breaks the name rule'
 */
export function refusalLine(refusal: ChatTurnRefusal): string {
  const name = refusal.name === undefined ? "" : ` "${refusal.name}"`;
  return `${refusal.source}: ${whatWasRefused[refusal.refused]}${name}: ${refusal.reason}`;
}
