import type { GridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import type { AnyListRow } from "./list-props.ts";

/*
 * A `plain` List's row action, as `PlainRow`'s: the Inbox's Mark as unread
 * (`kit.list-plain-action`). Kept apart from list-row.tsx, which keeps the bordered and flush
 * looks.
 */

/**
 * The action sits over the end of the row's first line, where the trailing part or a time is,
 * with the row's hover fill so it covers what's under it, as `PlainRow`'s. It shows while the row
 * is hovered or has keyboard focus, as the row's fill does (`plainStateClasses`), so it never sits
 * on a row without its fill: focus left on it by a click doesn't keep it shown (Sofia, HAL-20148).
 * Its own cell is `relative` and takes no width, so the button is placed against the end of the
 * main cell, clear of a More button: a table cell is a containing block in every webview, while a
 * `relative` row isn't in WebKit before April 2026 (WebKit bug 240961). While hidden it takes no
 * clicks, so a tap opens the row; it stays a cell of the grid. An invisible `after:` area makes
 * its target 24px (WCAG 2.5.8).
 */
const actionClasses = [
  "absolute end-3 -me-1 top-5 inline-flex min-h-5 items-center rounded-sm bg-surface-muted ps-2 pe-1",
  "text-small text-fg-muted opacity-0 pointer-events-none transition-opacity",
  "duration-(--duration-fast) hover:text-fg focus-ring-inset",
  "after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']",
  "group-hover:pointer-events-auto group-hover:opacity-100",
  "group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100",
].join(" ");

/** The props of `HoverActionCell`. */
interface HoverActionCellProps<Id extends string> {
  readonly row: AnyListRow<Id>;
  readonly grid: GridNavigation;
  /** The main cell's column: the action's comes after it and the row's `actions`. */
  readonly mainColumn: number;
  /** The List has a `hoverAction` on some row, so every row has the cell. */
  readonly shown: boolean;
}

/**
 * A row's `hoverAction` in a cell of its own after the main cell, so its words stay out of the
 * row's name and text; an empty cell when another row has one and this row doesn't.
 */
export function HoverActionCell<Id extends string>({
  row,
  grid,
  mainColumn,
  shown,
}: HoverActionCellProps<Id>) {
  if (!shown) {
    return null;
  }
  const action = row.hoverAction;
  const column = mainColumn + 1 + (row.actions?.length ?? 0);
  return (
    <td className="relative w-0 p-0">
      {action === undefined ? null : (
        <button
          type="button"
          aria-label={action.spokenLabel}
          className={actionClasses}
          {...grid.cell(row.id, column)}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </td>
  );
}
