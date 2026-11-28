import { useEffect, useRef, useState } from "react";
import type { ChangeItem } from "../change-items.ts";
import { type PaneState, usePaneState } from "./pane-state.ts";

/**
 * Where focus goes when the list comes back, or, on the desktop, when the item open beside it goes:
 * the row that was open, or the one that took its place.
 */
export interface ReturnFocus {
  readonly id: string;
  readonly index: number;
}

/** What {@link useOpenItem} gives the page. */
export interface OpenItem {
  /**
   * The item whose What changed is open: a page of its own, or the desktop's content pane beside
   * the list. `undefined` shows the list alone, or the pane without an item.
   */
  readonly open: ChangeItem | undefined;
  /** Where the list puts focus after a page, or after the item beside it went; else `undefined`. */
  readonly returnFocus: ReturnFocus | undefined;
  /** Says the list has put focus where `returnFocus` asked, so a later redraw leaves focus alone. */
  readonly focusPlaced: () => void;
  /** Opens an item; `pressed` says a click or Enter opened it, so its heading takes focus again. */
  readonly show: (id: string, pressed?: boolean) => void;
  readonly back: () => void;
  /** Closes the open item without moving focus, as when the pane shows something else. */
  readonly close: () => void;
}

/**
 * Which item's What changed is open. When the open item is gone, as after Undo these changes, What
 * changed closes and the list is told which row takes focus; when no item is left,
 * `onNothingLeft` is called instead, as there is no row to take it. The open item is kept in `pane`,
 * with the version open in its place, if any; without it, in the hook's own state.
 */
export function useOpenItem(
  items: readonly ChangeItem[],
  onNothingLeft: () => void,
  shared?: PaneState,
): OpenItem {
  const own = usePaneState(undefined);
  const pane = shared ?? own;
  const openId = pane.itemId;
  const setOpenId = (id: string | undefined, pressed = false) => pane.showItem(id, pressed);
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
    show: (id, pressed) => {
      setReturnFocus(undefined);
      setOpenId(id, pressed);
    },
    close: () => {
      setReturnFocus(undefined);
      setOpenId(undefined);
    },
    back: () => {
      if (openId === undefined) return;
      setReturnFocus({ id: openId, index: openIndex.current });
      setOpenId(undefined);
    },
  };
}
