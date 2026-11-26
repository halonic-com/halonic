import type { InboxItem, InboxWebLink } from "@halonicjs/ports";
import { oneLine } from "./approval-text.ts";
import { readChannel } from "./channels.ts";
import { type JsonRecord, text } from "./json.ts";
import { authorOf, fullLinksOf, type MapContext, timeOf } from "./map.ts";

// Open tasks assigned to the signed-in person as inbox items of kind `task`
// (`paperclip-client.board-tasks`, HAL-19668). Paperclip says who a task is for in
// `assigneeUserId`, so nothing here reads the task's text to decide it.

/** How many lines of the description the item shows under the title. */
const descriptionLines = 3;

/**
 * Whether task `record` is assigned to a person. The Inbox reads such a task whole, because the
 * task list's index view leaves out the description the item shows; it is read again only when
 * the task changes.
 */
export function assignedToPerson(record: JsonRecord): boolean {
  return text(record, "assigneeUserId") !== undefined;
}

/** The first lines of `description` that hold text, with "…" when it goes on. */
function excerpt(description: string | undefined): string | undefined {
  const lines = (description ?? "").split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return undefined;
  }
  const shown = lines.slice(0, descriptionLines).join("\n");
  return lines.length > descriptionLines ? `${shown}\n\n…` : shown;
}

/**
 * Task `record` as an inbox item, or `undefined` when it isn't for the signed-in person: it must
 * be assigned to them, and not be a chat or a channel, which show in Messenger instead. It is
 * answered in Paperclip, so without a web link there is no item. Its ID is the task's, the same as
 * its `work`, so the Inbox can tell when a card or an approval on the task already waits on them.
 */
export function boardTaskToItem(
  context: MapContext,
  record: JsonRecord,
  webLink: InboxWebLink | undefined,
): InboxItem | undefined {
  const id = text(record, "id");
  const assignee = text(record, "assigneeUserId");
  if (id === undefined || context.userId === undefined || assignee !== context.userId) {
    return undefined;
  }
  const chat = text(record, "conversationAgentId") !== undefined;
  if (chat || readChannel(record, undefined) !== undefined || webLink === undefined) {
    return undefined;
  }
  const title = oneLine(text(record, "title") ?? "");
  const lines = excerpt(text(record, "description"));
  return {
    id: context.ids.make("task", id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "createdByAgentId"), text(record, "createdByUserId")),
    question: fullLinksOf(context, lines === undefined ? title : `${title}\n\n${lines}`),
    options: [],
    kind: "task",
    answerElsewhere: { link: webLink.link },
    webLink,
    work: context.ids.make("task", id),
    risk: "normal",
    // Paperclip keeps no time of the assignment; a task's last change is the closest it has.
    createdAt: timeOf(record, "updatedAt"),
    attachments: [],
    state: { kind: "open" },
  };
}
