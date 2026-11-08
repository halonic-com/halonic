// How a refusal from a tool listing shows in the workspace's integration
// status (`ports.untrusted-tool-listings`). `readToolListing` already cuts
// and escapes the text a server wrote in a refusal's name and reason, so
// this only puts the parts together into one line.

import { escapeListedText } from "./listed-tool-rules.ts";
import type { ToolRefusal } from "./tool-listing.ts";

/** What the status says the host did, for each kind of refusal. */
const whatWasRefused: Record<ToolRefusal["refused"], string> = {
  tool: "left out",
  keyword: "changed",
  listing: "left out the listing",
};

/**
 * One line of plain text for a refusal, for the workspace's integration
 * status. Never give it to the model: it repeats what the server wrote.
 * Show it as text, not as Markdown or HTML.
 *
 * The name and the reason are shown as `readToolListing` made them: text
 * from the listing in them is already cut to 64 characters and escaped. The
 * source's id comes from the workspace, which may itself be untrusted, so it
 * is escaped the same way.
 *
 * @example
 * refusalStatusLine({ source: "notes", name: "look up", refused: "tool", reason: "its name breaks the name rule" });
 * // 'notes: left out "look up": its name breaks the name rule'
 * refusalStatusLine({ source: "notes", refused: "listing", reason: "the listing isn't a list of tools" });
 * // "notes: left out the listing: the listing isn't a list of tools"
 */
export function refusalStatusLine(refusal: ToolRefusal): string {
  const source = escapeListedText(refusal.source);
  const what = whatWasRefused[refusal.refused];
  const name = refusal.name === undefined ? "" : ` "${refusal.name}"`;
  return `${source}: ${what}${name}: ${refusal.reason}`;
}
