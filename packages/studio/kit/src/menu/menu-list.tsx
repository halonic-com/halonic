import { type KeyboardEvent, type RefObject, useId, useRef, useState } from "react";
import { keyShortcutsLabel } from "../kbd/kbd.tsx";
import { isMenuItem, type MenuEntry, type MenuItem } from "./menu.tsx";
import { findIndex, isTypedLetter, nextIndex, TYPE_TO_FIND_MS } from "./menu-keys.ts";
import { MenuRow } from "./menu-row.tsx";

// The menu itself takes focus when the mouse opens it, without a ring: no item is active yet.
// Exported for the states page's static copy.
export const menuClasses = [
  "m-0 inset-auto outline-none min-w-45 overflow-y-auto rounded-md border border-transparent p-1",
  "bg-surface-raised text-fg shadow-2",
  "transition-opacity duration-(--duration-fast) ease-enter starting:opacity-0",
].join(" ");

export const dividerClasses = "mx-0 my-1 border-0 border-t border-border";

// Padding 8px 8px 6px, at most 300px wide, wrapping (component specs 20.2).
const descriptionClasses = "m-0 max-w-75 px-2 pt-2 pb-1.5 text-small text-fg-muted";

// The caption-caps label of a group (component specs 24.4, "Group labels"). Exported for the states
// page's static copy.
export const menuHeadingClasses =
  "px-2 pt-2 pb-1 text-caption uppercase tracking-label text-fg-subtle";

/** What names the menu: the button that opens it, or a label of its own (a context menu). */
export type MenuNaming = { readonly labelledBy: string } | { readonly label: string };

/** The props of {@link MenuList}. */
export interface MenuListProps {
  readonly id: string;
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly naming: MenuNaming;
  readonly entries: readonly MenuEntry[];
  readonly description?: string | undefined;
  /**
   * Escape, Tab or a pick: the owner hides the popover and gives the focus back. A pick runs the
   * item's `onSelect` after this, so a Dialog the item opens returns the focus there.
   */
  readonly onClose: () => void;
}

/**
 * The part a `Menu` and a `ContextMenu` share: the `popover` with its items, the keys that move
 * between them, type-to-find and picking. Who opens it, where it goes and where the focus returns
 * is the owner's part.
 */
export function MenuList({ id, listRef, naming, entries, description, onClose }: MenuListProps) {
  const descriptionId = useId();
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: "", at: 0 });
  const rows = dangerLast(entries);
  const items = itemsOf(rows);

  function focusItem(index: number | undefined): void {
    if (index !== undefined) {
      listRef.current?.querySelectorAll<HTMLElement>("[role^=menuitem]")[index]?.focus();
    }
  }

  function pick(item: MenuItem): void {
    if (item.disabled === true || item.unavailable !== undefined) {
      return;
    }
    onClose();
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
      onClose();
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
    <div
      id={id}
      ref={listRef}
      popover="auto"
      role="menu"
      aria-labelledby={"labelledBy" in naming ? naming.labelledBy : undefined}
      aria-label={"label" in naming ? naming.label : undefined}
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
      {sectionsOf(rows).map((section, position) => {
        if (section === "divider") {
          return <hr key={`divider-${position}`} className={dividerClasses} />;
        }
        const row = (item: MenuItem) => {
          index += 1;
          const itemIndex = index;
          return (
            <MenuRow
              key={item.id}
              item={item}
              active={itemIndex === active}
              keyShortcuts={item.keys === undefined ? undefined : keyShortcutsLabel(item.keys)}
              onFocus={() => setActive(itemIndex)}
              onBlur={() => setActive(-1)}
              onPick={() => pick(item)}
            />
          );
        };
        if (isMenuItem(section)) {
          return row(section);
        }
        const headingId = `${id}-heading-${position}`;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a menu's groups are `group`s, not fieldsets.
          <div key={headingId} role="group" aria-labelledby={headingId}>
            <div id={headingId} role="presentation" className={menuHeadingClasses}>
              {section.heading}
            </div>
            {section.items.map(row)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Focuses the menu's first item that can be used, as when the keyboard opens it. Disabled items
 * are skipped, as the arrows skip them.
 */
export function focusFirstItem(menu: HTMLElement, entries: readonly MenuEntry[]): void {
  const first = nextIndex(itemsOf(dangerLast(entries)), -1, "Home");
  if (first !== undefined) {
    menu.querySelectorAll<HTMLElement>("[role^=menuitem]")[first]?.focus();
  }
}

function itemsOf(rows: readonly MenuEntry[]): readonly MenuItem[] {
  return rows.filter(isMenuItem);
}

/** A heading with the items under it, up to the next divider or heading. */
interface MenuGroup {
  readonly heading: string;
  readonly items: readonly MenuItem[];
}

/** The rows as drawn: items and dividers, and each heading with its items as one group. */
function sectionsOf(rows: readonly MenuEntry[]): readonly (MenuItem | "divider" | MenuGroup)[] {
  const sections: (MenuItem | "divider" | MenuGroup)[] = [];
  let group: { heading: string; items: MenuItem[] } | undefined;
  for (const row of rows) {
    if (row === "divider") {
      group = undefined;
      sections.push(row);
    } else if (isMenuItem(row)) {
      if (group === undefined) {
        sections.push(row);
      } else {
        group.items.push(row);
      }
    } else {
      group = { heading: row.heading, items: [] };
      sections.push(group);
    }
  }
  // A heading with nothing under it says nothing.
  return sections;
}

/**
 * The entries with danger items moved to the end, below one divider, no divider at the start, at
 * the end or twice in a row, and no heading without an item under it.
 */
function dangerLast(menuEntries: readonly MenuEntry[]): readonly MenuEntry[] {
  // A heading with no item under it says nothing.
  const entries = menuEntries.filter(
    (entry, position) =>
      isMenuItem(entry) ||
      entry === "divider" ||
      isMenuItem(menuEntries[position + 1] ?? "divider"),
  );
  const isDanger = (entry: MenuEntry) => isMenuItem(entry) && entry.danger === true;
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
