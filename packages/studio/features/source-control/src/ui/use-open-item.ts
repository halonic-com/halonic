import { useEffect, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";

/** Where focus goes when the list comes back: the row that was open, or the one that took its place. */
export interface ReturnFocus {
  readonly id: string;
  readonly index: number;
}

/** What {@link useOpenItem} gives the page. */
export interface OpenItem {
  /** The item whose What changed page is open; `undefined` shows the list. */
  readonly open: ChangeItem | undefined;
  /** Where the list puts focus when it is drawn again after a page; `undefined` leaves it alone. */
  readonly returnFocus: ReturnFocus | undefined;
  /** Says the list has put focus where `returnFocus` asked, so a later redraw leaves focus alone. */
  readonly focusPlaced: () => void;
  readonly show: (id: string) => void;
  readonly back: () => void;
}

/**
 * Which item's What changed page is open. When the open item is gone, as after Undo these changes,
 * the page goes back to the list; when no item is left, `onNothingLeft` moves focus to the heading,
 * since the list isn't there for the row to take it.
 */
export function useOpenItem(items: readonly ChangeItem[], onNothingLeft: () => void): OpenItem {
  const [openId, setOpenId] = useState<string>();
  const [returnFocus, setReturnFocus] = useState<ReturnFocus>();
  const openIndex = useRef(0);
  const open = items.find((item) => item.id === openId);
  if (open !== undefined) openIndex.current = items.indexOf(open);
  const isGone = openId !== undefined && open === undefined;
  const nothingLeft = items.length === 0;
  // The list is drawn on the very render that finds the item gone, so its focus target can't wait for the effect.
  const goneFocus = isGone ? { id: openId, index: openIndex.current } : undefined;
  const nothingLeftCallback = useRef(onNothingLeft);
  nothingLeftCallback.current = onNothingLeft;
  useEffect(() => {
    if (!isGone || openId === undefined) return;
    setOpenId(undefined);
    if (nothingLeft) {
      nothingLeftCallback.current();
      return;
    }
    setReturnFocus({ id: openId, index: openIndex.current });
  }, [isGone, openId, nothingLeft]);
  return {
    open,
    returnFocus: goneFocus ?? returnFocus,
    focusPlaced: () => setReturnFocus(undefined),
    show: (id) => {
      setReturnFocus(undefined);
      setOpenId(id);
    },
    back: () => {
      if (openId === undefined) return;
      setReturnFocus({ id: openId, index: openIndex.current });
      setOpenId(undefined);
    },
  };
}
