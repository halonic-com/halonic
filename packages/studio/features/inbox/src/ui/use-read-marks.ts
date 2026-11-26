import type { ListRow } from "@halonicjs/studio-kit";
import { useEffect, useReducer } from "react";
import type { InboxItem } from "../inbox-items.ts";
import { type ReadMarks, readKey } from "../read-marks.ts";

/** A row that waits, with the keys of the items it holds: one, or a bundle's cards. */
export interface ReadRow {
  readonly key: string;
  readonly keys: readonly string[];
}

/** One of the Inbox's own items as a row of the order, by its read key. */
export function readRow(item: InboxItem): ReadRow {
  return { key: item.key, keys: [readKey(item)] };
}

/** What the Inbox page reads and changes of its read marks (`inbox.read-marks`). */
export interface InboxReading {
  /**
   * The rows, each with the blue dot while any item it holds is new. `order` names each row's
   * items by their read keys: the rows that wait, then the other listed rows of the Inbox's own,
   * such as a fixed setup item or a decided item still open; a row in neither has no dot.
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

/**
 * The word a screen reader hears after a new row's name: "new", as the heading counts them
 * (Nina's words check on HAL-19492).
 */
const unread = { label: "new" };

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
