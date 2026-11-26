import { shortTime } from "@halonicjs/studio-kit";

/** The row's chip: items that still have changes to review from the chat. */
function toReview(items: number): string {
  return `${items} to review`;
}

/**
 * The words of the chat menu, Rename and Delete chat (microcopy 14.1 and 19.5; states H3, H4;
 * flow-assistant 5.5 and 5.6). Where the T14 checklist still says "2 open", the microcopy's
 * revision 78 wins: "2 to review".
 */
export const chatMenuWords = {
  /** H4: under the rows, or under New chat alone when there are none yet. */
  footer: "Keeps your 40 most recent chats on this computer.",
  toReview,
  /** A row's name: "Add a routine, 10:42, answering" or "…, 09:15, 2 to review" (mc 19.5). */
  rowName: (title: string, time: string, answering: boolean, items: number) =>
    [title, time, answering ? "answering" : undefined, items > 0 ? toReview(items) : undefined]
      .filter((part) => part !== undefined)
      .join(", "),
  answering: "answering",
  /** The header's ⋮, named after the chat as the kit's ⋮ buttons are. */
  moreActions: (title: string) => `More actions for ${title}`,
  rename: "Rename",
  /** The rename field's name (microcopy 19.5, "Rename field"). */
  renameField: (title: string) => `Rename ${title}`,
  deleteChat: "Delete chat…",
  deleteTitle: (title: string) => `Delete the chat "${title}"?`,
  /** Only when the chat left changes to review: they stay in the items (AI changes 1.9). */
  deleteBody: (items: number) =>
    `The changes it made in ${items} ${items === 1 ? "item" : "items"} stay there to review.`,
  deleteConfirm: "Delete chat",
  /** New (HAL-18075): said once the chat is deleted, as focus moves on. */
  deleted: (title: string) => `Deleted “${title}”.`,
  deleting: "Deleting…",
  cantDelete: (reason: string) => `Couldn't delete the chat: ${reason.trim().replace(/\.+$/, "")}.`,
  /** The phone's ⋮ (flow-assistant 11.3), whose items carry no "…", and its two sheets. */
  phone: {
    recentChats: "Recent chats",
    deleteChat: "Delete chat",
    /** Recent chats' footer: "your computer" on a phone (microcopy 1.2, 14.3). */
    footer: "Keeps your 40 most recent chats on your computer.",
    /** The kind in the shell's rename sheet: "Rename chat". */
    kindName: "chat",
  },
} as const;

/**
 * When a chat was last used, for its row (flow-assistant 5.5): the kit's short time
 * (`kit.time-stamp`), so it reads as the Messenger's chat list does: "10:42" today, "Yesterday",
 * "Mon" within the week, "3 Nov" this year, then "02/12/2025", each in the window's format.
 *
 * @example
 * chatTime("2026-11-23T10:42:00", new Date("2026-11-23T12:00:00"), "en-GB"); // "10:42"
 */
export function chatTime(iso: string, now: Date, locale?: string): string {
  return shortTime(new Date(iso), now, locale);
}
