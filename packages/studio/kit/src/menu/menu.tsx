import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import { type PopoverAlign, placePopover } from "../popover/place-popover.ts";
import { focusFirstItem, MenuList } from "./menu-list.tsx";

/** One thing the menu does: "Rename…", "Delete agent". */
export interface MenuItem {
  /** Unique in the menu. */
  readonly id: string;
  readonly label: string;
  /**
   * A second line under the label, one line ending in "…": the folder under a workspace's name
   * in the workspace menu. It describes the item: its name stays the label.
   */
  readonly detail?: string | undefined;
  /** An optional 16px icon before the label (20px on a phone). */
  readonly icon?: ReactNode;
  /** Its shortcut, shown on the right as a Kbd and named with `aria-keyshortcuts`. */
  readonly keys?: readonly string[];
  /** Shown in `danger` and always last, below a divider. */
  readonly danger?: boolean;
  /** Can't be used here at all. Still listed, but the arrow keys and type-to-find skip it. */
  readonly disabled?: boolean;
  /**
   * Waiting for something, and it says what: a sentence under the label, "Finish getting updates
   * first." It stays in the arrow order and ignores Enter (component specs 14, 23 A1).
   */
  readonly unavailable?: { readonly reason: string } | undefined;
  /**
   * Makes the item one choice of several, a `menuitemradio`: `true` on the current one, which
   * shows a 16px `accent` check at the right, `false` on the others. The filter chips' picker on
   * desktop, a list of open tabs.
   */
  readonly checked?: boolean;
  /**
   * The item waits for someone: the still 6px `warning` dot at the right, as on a window tab, and
   * these words read after the label, "needs you". A list of open tabs.
   */
  readonly attention?: string | undefined;
  readonly onSelect: () => void;
}

/**
 * The name of the group of items under it, up to the next divider or heading: the workspace
 * menu's "Recent". Not an item: the arrows and type-to-find pass it by, and a screen reader hears
 * it as the group's name.
 */
export interface MenuHeading {
  readonly heading: string;
}

/** An item, a 1px line between two groups of items, or a group's heading. */
export type MenuEntry = MenuItem | "divider" | MenuHeading;

/** Whether an entry is an item, not a divider or a heading. */
export function isMenuItem(entry: MenuEntry): entry is MenuItem {
  return entry !== "divider" && !("heading" in entry);
}

/** What the menu's `trigger` spreads on its button: a kit `Button` takes all of them. */
export interface MenuTriggerProps {
  readonly id: string;
  readonly ref: Ref<HTMLButtonElement>;
  readonly popoverTarget: string;
  readonly "aria-haspopup": "menu";
  readonly "aria-expanded": boolean;
}

/** The props of `Menu`. */
export interface MenuProps {
  /** The button that opens the menu, which also names it: a ⋮ "More actions for Sorter". */
  readonly trigger: (props: MenuTriggerProps) => ReactNode;
  readonly entries: readonly MenuEntry[];
  /**
   * A sentence that explains the menu, shown above the items and read once when it opens: the
   * sample chip's "Runs on the built-in test model, with scripted replies. No key, no cost." It
   * isn't an item: never a link or a button (component specs 20.2).
   */
  readonly description?: string | undefined;
  /** Line the menu up with the trigger's left edge (the default) or its right edge. */
  readonly align?: PopoverAlign;
}

/** The menu sits this far below (or above) its trigger. */
const TRIGGER_GAP = 4;

export { dividerClasses, menuClasses, menuHeadingClasses } from "./menu-list.tsx";

/**
 * A short list of actions that opens from a button: a row's ⋮ More button or a title bar. A menu
 * that opens from a right-click or Shift F10 instead is a `ContextMenu`. A native `popover`, so
 * the browser keeps it on top and closes it on an outside click; the kit places it below the
 * trigger, or above when there's no room.
 *
 * Opened by the keyboard, focus starts on the first item; opened by the mouse, it goes to the menu
 * itself and the fill follows the pointer. The keyboard moves between items with the arrows, Home
 * and End, and type-to-find. Enter or Space picks one; Escape and Tab close it. Focus goes back to
 * the trigger either way.
 *
 * @example
 * <Menu
 *   trigger={(props) => <Button {...props} variant="ghost" icon={<MoreIcon />} label="More actions for Sorter" />}
 *   entries={[{ id: "rename", label: "Rename…", onSelect: rename }, "divider", { id: "delete", label: "Delete agent", danger: true, onSelect: remove }]}
 * />
 */
export function Menu({ trigger, entries, description, align = "start" }: MenuProps) {
  const menuId = useId();
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** The trigger was last pressed with a pointer, not a key. */
  const pressed = useRef(false);

  function close(): void {
    menuRef.current?.hidePopover();
    triggerRef.current?.focus();
  }

  useEffect(() => {
    const menu = menuRef.current;
    const opener = triggerRef.current;
    if (menu === null || opener === null) {
      return;
    }
    const place = () => placePopover(menu, opener, { gap: TRIGGER_GAP, align });
    const onToggle = (event: Event) => {
      const isOpen = (event as Event & { newState?: string }).newState === "open";
      setOpen(isOpen);
      if (isOpen) {
        place();
        // A trigger with the focus ring was opened by the keyboard (component specs 14, C24). A
        // click on a trigger the keyboard focused keeps its ring, so a press counts as the mouse.
        if (!pressed.current && opener.matches(":focus-visible")) {
          focusFirstItem(menu, entries);
        } else {
          menu.focus();
        }
      }
    };
    const onPointerDown = () => {
      pressed.current = true;
    };
    const onKeyDown = () => {
      pressed.current = false;
    };
    menu.addEventListener("toggle", onToggle);
    opener.addEventListener("pointerdown", onPointerDown);
    opener.addEventListener("keydown", onKeyDown);
    return () => {
      menu.removeEventListener("toggle", onToggle);
      opener.removeEventListener("pointerdown", onPointerDown);
      opener.removeEventListener("keydown", onKeyDown);
    };
  });

  // While open, the menu follows its trigger when the window changes size or something scrolls.
  useEffect(() => {
    const menu = menuRef.current;
    const opener = triggerRef.current;
    if (!open || menu === null || opener === null) {
      return;
    }
    const place = () => placePopover(menu, opener, { gap: TRIGGER_GAP, align });
    addEventListener("resize", place);
    addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", place, { capture: true });
    };
  }, [open, align]);

  return (
    <>
      {trigger({
        id: triggerId,
        ref: triggerRef,
        popoverTarget: menuId,
        "aria-haspopup": "menu",
        "aria-expanded": open,
      })}
      <MenuList
        id={menuId}
        listRef={menuRef}
        naming={{ labelledBy: triggerId }}
        entries={entries}
        description={description}
        onClose={close}
      />
    </>
  );
}
