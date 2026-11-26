import type { MessagingId } from "@halonicjs/ports";
import { type RefObject, useEffect, useState } from "react";
import { channelAdminWords } from "../channel-admin-words.ts";
import type { ConversationRow } from "../messenger.ts";

/** The channel the person left, and where its row was in the list. */
interface Gone {
  readonly id: MessagingId;
  readonly index: number;
}

/**
 * Leaving closes the channel and takes away the dialog's opener with it, so once the list no longer
 * shows the channel, focus goes to the row that took its place (the last row when it was last), or
 * to the list's first button when no row is left (WCAG 2.4.3). `said` is what the page's status
 * region reads out: "You left Engineering." (HAL-18835).
 */
export function useLeft(
  list: RefObject<HTMLElement | null>,
  rows: readonly ConversationRow[] | undefined,
) {
  const [gone, setGone] = useState<Gone | undefined>(undefined);
  // Each line gets its own key, so leaving two channels of the same name is read twice.
  const [said, setSaid] = useState({ text: "", count: 0 });

  useEffect(() => {
    if (gone === undefined || rows === undefined) return;
    if (rows.some((row) => row.conversation.id === gone.id)) return;
    // Each kit plain row's first button is the row itself.
    const chats = [
      ...(list.current?.querySelectorAll<HTMLElement>("[data-row-id] > button:first-child") ?? []),
    ];
    const first = list.current?.querySelector<HTMLElement>("button");
    (chats[gone.index] ?? chats.at(-1) ?? first)?.focus();
    setGone(undefined);
  }, [rows, gone, list]);

  const leave = (row: ConversationRow) => {
    const index = (rows ?? []).findIndex((each) => each.conversation.id === row.conversation.id);
    setGone({ id: row.conversation.id, index: Math.max(index, 0) });
    setSaid((last) => ({
      text: channelAdminWords.leave.left(row.conversation.title),
      count: last.count + 1,
    }));
  };
  return { said, leave };
}
