// What kind of item an agent put in the Inbox (requirement `ports.agent-messaging-item-kind`).
// Apps show it as a badge next to who asks. Only the source can tell an approval from a
// confirmation card, so it says; for an item that doesn't, apps work the kind out the same way.
import type { InboxItem } from "./agent-messaging.ts";

/**
 * What an inbox item asks of the person, as the source sees it: an `approval`, a `question`, an
 * `action` (a stepper to run), an item answered `elsewhere`, a `task` assigned to the person, or a
 * `comment` that asks the person something. It only picks the badge: what an item takes as an
 * answer still follows from its fields.
 */
export type InboxItemKind = "approval" | "question" | "action" | "elsewhere" | "task" | "comment";

/**
 * The kind apps show for an item: its own `kind` when the source set one, otherwise `action` for
 * an action item (`action` or `stepper`), `elsewhere` for an item with `answerElsewhere`, and
 * `question` for any other.
 *
 * @example
 * inboxItemKind({ ...item, answerElsewhere: { link: "https://acme.example/t/1" } }); // "elsewhere"
 */
export function inboxItemKind(item: InboxItem): InboxItemKind {
  if (item.kind !== undefined) return item.kind;
  if (isActionItem(item)) return "action";
  if (item.answerElsewhere !== undefined) return "elsewhere";
  return "question";
}

/**
 * Whether an item's `kind` agrees with its fields: an action item, and only an action item, is of
 * kind `action` when it has a kind. A provider leaves out an item that doesn't (`inboxItemFits`).
 */
export function inboxItemKindFits(item: InboxItem): boolean {
  if (item.kind === undefined) return true;
  return (item.kind === "action") === isActionItem(item);
}

function isActionItem(item: InboxItem): boolean {
  return item.action !== undefined || item.stepper !== undefined;
}
