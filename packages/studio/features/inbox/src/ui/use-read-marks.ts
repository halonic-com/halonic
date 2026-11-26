import type { ListRow } from "@halonicjs/studio-kit";
import { useEffect, useReducer } from "react";
import type { InboxItem } from "../inbox-items.ts";
import { type ReadMarks, readKey } from "../read-marks.ts";

/** A row that waits, with the keys of the items it holds: one, or a bundle's cards. */
export interface ReadRow {
  readonly key: string;
  readonly keys: readonly string[];
}

/** What the Inbox page reads and changes of its read marks (`inbox.read-marks`). */
export interface InboxReading {
  /**
   * The rows, each with the blue dot while any item it holds is new. A row missing from `order`,
   * such as a decided item still open, doesn't wait, so it has no dot.
   */
  readonly mark: (rows: readonly ListRow[], order: readonly ReadRow[]) => ListRow[];
  /** How many of the items that wait are new, each card of a bundle on its own. */
  readonly newCount: (order: readonly ReadRow[]) => number;
  /**
   * The header's **Mark as unread**: closes the open row with `close`, which puts focus on it, then
   * marks the newest of the items it still holds (`row`, its entry in the order) unread again, not
   * a bundle's card answered while it was open.
   */
  readonly markUnread: (close: () => void, row: ReadRow | undefined) => void;
}

/** The words a screen reader hears after a new row's name. */
const unread = { label: "unread" };

/**
 * The Inbox's read marks for its page: the item open now, of the Inbox's own (`own`) or the
 * cards of an agent's row (`agentKeys`), is read, as opening marks read, and the page draws again
 * when a mark changes.
 */
export function useReadMarks(
  marks: ReadMarks,
  own: InboxItem | null,
  agentKeys: readonly string[],
): InboxReading {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const openKeys = own === null ? agentKeys : [readKey(own)];
  // One string, so a new array with the same keys on each render doesn't mark them again.
  const opened = openKeys.join("\n");
  useEffect(() => {
    if (opened === "") return;
    marks.markRead(opened.split("\n"));
    redraw();
  }, [marks, opened]);
  const isNew = (key: string) => !marks.isRead(key);
  return {
    mark: (rows, order) =>
      rows.map((row) => {
        const keys = order.find((each) => each.key === row.id)?.keys ?? [];
        return keys.some(isNew) ? { ...row, unread } : row;
      }),
    newCount: (order) => order.reduce((sum, row) => sum + row.keys.filter(isNew).length, 0),
    markUnread: (close, row) => {
      const newest = row?.keys.at(-1);
      close();
      if (newest === undefined) return;
      marks.markUnread(newest);
      redraw();
    },
  };
}
