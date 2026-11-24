/**
 * The words of the chat menu, Rename and Delete chat (microcopy 14.1 and 19.5; states H3, H4;
 * flow-assistant 5.5 and 5.6). Where the T14 checklist still says "2 open", the microcopy's
 * revision 78 wins: "2 to review".
 */
export const chatMenuWords = {
  /** H4: under the rows, or under New chat alone when there are none yet. */
  footer: "Keeps your 40 most recent chats on this computer.",
  /** The row's chip: items that still have changes to review from the chat. */
  toReview: (items: number) => `${items} to review`,
  /** A row's name: "Add a routine, 10:42, answering" or "…, 09:15, 2 to review" (mc 19.5). */
  rowName: (title: string, time: string, answering: boolean, items: number) =>
    [title, time, answering ? "answering" : undefined, items > 0 ? `${items} to review` : undefined]
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
  deleting: "Deleting…",
  cantDelete: (reason: string) => `Couldn't delete the chat: ${reason.trim().replace(/\.+$/, "")}.`,
} as const;

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * When a chat was last used, for its row (flow-assistant 5.5): "10:42" today, "yesterday", "Mon"
 * within the week, then "3 Nov", with the year when it isn't this year's.
 *
 * @example
 * chatTime("2026-11-23T10:42:00", new Date("2026-11-23T12:00:00")); // "10:42"
 */
export function chatTime(iso: string, now: Date): string {
  const moment = new Date(iso);
  const ago = Math.round((startOfDay(now) - startOfDay(moment)) / 86_400_000);
  if (ago <= 0) {
    return `${twoDigits(moment.getHours())}:${twoDigits(moment.getMinutes())}`;
  }
  if (ago === 1) return "yesterday";
  if (ago < 7) return days[moment.getDay()] ?? "";
  const date = `${moment.getDate()} ${months[moment.getMonth()]}`;
  return moment.getFullYear() === now.getFullYear() ? date : `${date} ${moment.getFullYear()}`;
}

function startOfDay(moment: Date): number {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
