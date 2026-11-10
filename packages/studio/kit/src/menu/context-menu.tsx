import { useEffect, useId, useRef } from "react";
import { type Box, placePopoverBy } from "../popover/place-popover.ts";
import { usePointerPress } from "../popover/pointer-press.ts";
import type { MenuEntry } from "./menu.tsx";
import { focusFirstItem, MenuList } from "./menu-list.tsx";

/** What a context menu opens for, and where. */
export interface ContextMenuTarget {
  /** The element the menu is for, such as a window tab. The focus goes back to it on Escape. */
  readonly element: HTMLElement;
  /**
   * Where a right-click was, in window pixels: the menu opens there and the focus goes to the menu
   * itself. Without it (Shift F10 or the Menu key) the menu opens below the element and the focus
   * goes to its first item.
   */
  readonly at?: { readonly x: number; readonly y: number } | undefined;
}

/** The props of `ContextMenu`. */
export interface ContextMenuProps {
  /** Names the menu, such as the title of the tab it is for. */
  readonly label: string;
  readonly entries: readonly MenuEntry[];
  /** Open for this target; closed while `undefined`. */
  readonly target: ContextMenuTarget | undefined;
  /**
   * The menu closed by itself: Escape, Tab, a pick or an outside click. The owner sets `target`
   * back to `undefined`.
   */
  readonly onClose: () => void;
}

/** The menu sits this far below the element it is for when the keyboard opens it. */
const ELEMENT_GAP = 4;

/**
 * The Menu for a right-click, Shift F10 or the Menu key on something that isn't a button, such as
 * a window tab (component specs 14). It has the Menu's look, items and keys; only the opening
 * differs. The owner listens for the right-click and the keys and sets `target`; the menu opens
 * at the pointer, after the button's release, or below the element with the focus on its first
 * item. Escape and Tab give the
 * focus back to the element; a pick gives it back before `onSelect` runs, so an item that removes
 * the element can move the focus on. The browser's own context menu never shows over it.
 *
 * @example
 * const [target, setTarget] = useState<ContextMenuTarget>();
 * <div role="tab" onContextMenu={(event) => { event.preventDefault(); setTarget({ element: event.currentTarget, at: { x: event.clientX, y: event.clientY } }); }} />
 * <ContextMenu label="Support reply" entries={entries} target={target} onClose={() => setTarget(undefined)} />
 */
export function ContextMenu({ label, entries, target, onClose }: ContextMenuProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  /** Whether the menu is open as far as this component knows: it opened it and hasn't closed it. */
  const shown = useRef(false);
  const press = usePointerPress();
  const latest = useRef({ entries, onClose });
  latest.current = { entries, onClose };

  // An outside click closes the popover in the browser. `beforetoggle` comes at once, so a
  // right-click on another element opens the menu again for it rather than racing the close.
  // A right-click on the menu itself doesn't open the browser's own menu over it.
  useEffect(() => {
    const menu = menuRef.current;
    const onBeforeToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed" && shown.current) {
        shown.current = false;
        latest.current.onClose();
      }
    };
    const onContextMenu = (event: Event) => event.preventDefault();
    menu?.addEventListener("beforetoggle", onBeforeToggle);
    menu?.addEventListener("contextmenu", onContextMenu);
    return () => {
      menu?.removeEventListener("beforetoggle", onBeforeToggle);
      menu?.removeEventListener("contextmenu", onContextMenu);
      if (shown.current) {
        shown.current = false;
        menu?.hidePopover();
      }
    };
  }, []);

  useEffect(() => {
    const menu = menuRef.current;
    if (menu === null) {
      return;
    }
    if (target === undefined) {
      hide(menu);
      return;
    }
    const { at } = target;
    if (at !== undefined) {
      // A right-click opens on the press on macOS and Linux, and the release of that press would
      // light-dismiss the menu, so it opens after the release. A right-click on another element
      // while the menu is open hides it until then, without calling `onClose`.
      if (press.held()) {
        hide(menu);
      }
      return press.afterRelease(() => {
        show(menu);
        placePopoverBy(menu, pointAt(at), { gap: 0, align: "start" });
        menu.focus();
      });
    }
    show(menu);
    const place = () =>
      placePopoverBy(menu, target.element.getBoundingClientRect(), {
        gap: ELEMENT_GAP,
        align: "start",
      });
    place();
    focusFirstItem(menu, latest.current.entries);
    // While open, the menu follows the element when the window changes size or something scrolls.
    addEventListener("resize", place);
    addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", place, { capture: true });
    };
  }, [target, press]);

  function show(menu: HTMLElement): void {
    if (!shown.current) {
      shown.current = true;
      menu.showPopover();
    }
  }

  function hide(menu: HTMLElement): void {
    if (shown.current) {
      shown.current = false;
      menu.hidePopover();
    }
  }

  function close(): void {
    const menu = menuRef.current;
    if (menu !== null) {
      hide(menu);
    }
    if (target?.element.isConnected === true) {
      target.element.focus();
    }
    onClose();
  }

  return (
    <MenuList id={menuId} listRef={menuRef} naming={{ label }} entries={entries} onClose={close} />
  );
}

/** The right-click's point as a box with no size. */
function pointAt(at: { readonly x: number; readonly y: number }): Box {
  return { top: at.y, right: at.x, bottom: at.y, left: at.x };
}
