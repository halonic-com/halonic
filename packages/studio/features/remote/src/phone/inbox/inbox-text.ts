import type { InboxItem } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";
import { questionBody, questionTitle } from "@halonicjs/studio-kit";

/*
 * What a phone Inbox row and card say about an item (HAL-17514 p02a and p03a), as the desktop
 * Inbox says it: the question's first line is the card's title, the rest its body.
 */

/** The card's title: the question's first block as plain text, its Markdown marks read, not shown. */
export function cardTitle(item: InboxItem): string {
  return markHiddenName(questionTitle(item.question));
}

/** The question without the line its title came from, so the title shows once. */
export function cardBody(item: InboxItem): string {
  return questionBody(item.question);
}

/** Who asks and for what project: "Chief asks · Halonic apps", or "Chief asks" without one. */
export function askerLine(item: InboxItem): string {
  const asker = item.from.kind === "me" ? "" : `${markHiddenName(item.from.name)} asks`;
  const project = item.project === undefined ? "" : markHiddenName(item.project.name);
  return [asker, project].filter((part) => part !== "").join(" · ");
}
