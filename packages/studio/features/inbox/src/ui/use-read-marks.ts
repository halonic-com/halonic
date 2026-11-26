import type { ListRow, PlainRowAction } from "@halonicjs/studio-kit";
import { useEffect, useReducer } from "react";
import type { InboxItem } from "../inbox-items.ts";
import { type ReadMarks, readKey } from "../read-marks.ts";

/** A row of Needs you, with the read keys of the items it holds: one, or a bundle's cards. */
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
   * such as a fixed setup item or a decided item still open; a row in neither has no dot. Each
   * marked row but the `open` one gets **Mark as read** or **Mark as unread** on hover.
   */
  readonly mark: (
    rows: readonly ListRow[],
    order: readonly ReadRow[],
    open: string | undefined,
  ) => ListRow[];
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
  /** A new row's **Mark as read** marks all it holds; a read row's **Mark as unread** its newest. */
  const rowAction = (title: string, keys: readonly string[], fresh: boolean): PlainRowAction => {
    const label = fresh ? "Mark as read" : "Mark as unread";
    const onClick = () => {
      const newest = keys.at(-1);
      if (fresh) marks.markRead(keys);
      else if (newest !== undefined) marks.markUnread(newest);
      redraw();
    };
    return { label, spokenLabel: `${label}: ${title}`, onClick };
  };
  return {
    mark: (rows, order, open) =>
      rows.map((row) => {
        const keys = order.find((each) => each.key === row.id)?.keys ?? [];
        if (keys.length === 0) return row;
        const fresh = keys.some(isNew);
        const marked = fresh ? { ...row, unread } : row;
        // The open row is read by being open, so it offers neither, as the Messenger's open chat.
        return row.id === open
          ? marked
          : { ...marked, hoverAction: rowAction(row.title, keys, fresh) };
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
