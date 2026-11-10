import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { keyShortcutsLabel } from "../kbd/kbd.tsx";
import { type PopoverAlign, placePopover } from "../popover/place-popover.ts";
import { findIndex, isTypedLetter, nextIndex, TYPE_TO_FIND_MS } from "./menu-keys.ts";
import { MenuRow } from "./menu-row.tsx";

/** One thing the menu does: "Rename…", "Delete agent". */
export interface MenuItem {
  /** Unique in the menu. */
  readonly id: string;
  readonly label: string;
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
  readonly onSelect: () => void;
}

/** An item, or a 1px line between two groups of items. */
export type MenuEntry = MenuItem | "divider";

/** What the menu's `trigger` spreads on its button: a kit `Button` takes all of them. */
export interface MenuTriggerProps {
  readonly id: string;
  readonly ref: Ref<HTMLButtonElement>;
  readonly popoverTarget: string;
  readonly "aria-haspopup": "menu";
  readonly "aria-expanded": boolean;
}

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

// The menu itself takes focus when the mouse opens it, without a ring: no item is active yet.
const menuClasses = [
  "m-0 inset-auto outline-none min-w-45 overflow-y-auto rounded-md border border-transparent p-1",
  "bg-surface-raised text-fg shadow-2",
  "transition-opacity duration-(--duration-fast) ease-enter starting:opacity-0",
].join(" ");

const dividerClasses = "mx-0 my-1 border-0 border-t border-border";

// Padding 8px 8px 6px, at most 300px wide, wrapping (component specs 20.2).
const descriptionClasses = "m-0 max-w-75 px-2 pt-2 pb-1.5 text-small text-fg-muted";

/**
 * A short list of actions that opens from a button: a row's ⋮ More button, a title bar or a
 * context menu. A native `popover`, so the browser keeps it on top and closes it on an outside
 * click; the kit places it below the trigger, or above when there's no room.
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
  const descriptionId = useId();
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: "", at: 0 });
  /** The trigger was last pressed with a pointer, not a key. */
  const pressed = useRef(false);
  const rows = dangerLast(entries);
  const items = rows.filter((row): row is MenuItem => row !== "divider");

  function focusItem(index: number | undefined): void {
    if (index !== undefined) {
      menuRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]")[index]?.focus();
    }
  }

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
          focusItem(nextIndex(items, -1, "Home"));
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

  function pick(item: MenuItem): void {
    if (item.disabled === true || item.unavailable !== undefined) {
      return;
    }
    // Focus is back on the trigger first, so a Dialog the item opens returns it there.
    close();
    item.onSelect();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const moved = nextIndex(items, active, event.key);
    if (moved !== undefined) {
      event.preventDefault();
      focusItem(moved);
    } else if (event.key === "Enter" || event.key === " ") {
      // Not the button's own click, which would come a second time on Space's keyup.
      event.preventDefault();
      const item = items[active];
      if (item !== undefined) {
        pick(item);
      }
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (isTypedLetter(event)) {
      focusItem(findIndex(items, active, typeAhead(event.key, event.timeStamp)));
    }
  }

  /** The letters typed so far, or one letter again when the same one is pressed repeatedly. */
  function typeAhead(letter: string, now: number): string {
    const fresh = now - typed.current.at > TYPE_TO_FIND_MS;
    const text = fresh ? letter : typed.current.text + letter;
    typed.current = { text, at: now };
    return [...text].every((each) => each === letter) ? letter : text;
  }

  let index = -1;
  return (
    <>
      {trigger({
        id: triggerId,
        ref: triggerRef,
        popoverTarget: menuId,
        "aria-haspopup": "menu",
        "aria-expanded": open,
      })}
      <div
        id={menuId}
        ref={menuRef}
        popover="auto"
        role="menu"
        aria-labelledby={triggerId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        className={menuClasses}
        onKeyDown={onKeyDown}
        // The fill follows the pointer, so it clears when the pointer leaves. The arrows start again
        // from the top or the bottom.
        onPointerLeave={(event) => {
          if (event.currentTarget.contains(document.activeElement)) {
            event.currentTarget.focus();
          }
        }}
      >
        {description === undefined ? null : (
          // Not an item: no role, not focusable, so the arrows and type-to-find pass it by.
          <>
            <p id={descriptionId} className={descriptionClasses}>
              {description}
            </p>
            <hr className={dividerClasses} />
          </>
        )}
        {rows.map((row, position) => {
          if (row === "divider") {
            return <hr key={`divider-${position}`} className={dividerClasses} />;
          }
          index += 1;
          const itemIndex = index;
          return (
            <MenuRow
              key={row.id}
              item={row}
              active={itemIndex === active}
              keyShortcuts={row.keys === undefined ? undefined : keyShortcutsLabel(row.keys)}
              onFocus={() => setActive(itemIndex)}
              onBlur={() => setActive(-1)}
              onPick={() => pick(row)}
            />
          );
        })}
      </div>
    </>
  );
}

/**
 * The entries with danger items moved to the end, below one divider, and no divider at the
 * start, at the end or twice in a row.
 */
function dangerLast(entries: readonly MenuEntry[]): readonly MenuEntry[] {
  const isDanger = (entry: MenuEntry) => entry !== "divider" && entry.danger === true;
  const ordered = [
    ...entries.filter((entry) => !isDanger(entry)),
    "divider" as const,
    ...entries.filter(isDanger),
  ];
  const rows: MenuEntry[] = [];
  for (const entry of ordered) {
    if (entry !== "divider" || (rows.length > 0 && rows.at(-1) !== "divider")) {
      rows.push(entry);
    }
  }
  if (rows.at(-1) === "divider") {
    rows.pop();
  }
  return rows;
}
