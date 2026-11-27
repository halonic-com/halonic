import type { GridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import type { PlainRowAction } from "../plain-list/plain-list.tsx";
import { Tooltip } from "../tooltip/tooltip.tsx";
import type { AnyListRow } from "./list-props.ts";

/*
 * A `plain` List's row action, as `PlainRow`'s: the Inbox's Mark as unread
 * (`kit.list-plain-action`). Kept apart from list-row.tsx, which keeps the bordered and flush
 * looks.
 */

/**
 * Shown while the row is hovered or has keyboard focus, as the row's fill is (`plainStateClasses`),
 * so the action never sits on a row without its fill: focus left on it by a click doesn't keep it
 * shown (Sofia, HAL-20148). While hidden it takes no clicks, so a tap opens the row; it stays a
 * cell of the grid.
 */
const shownClasses = [
  "opacity-0 pointer-events-none transition-opacity duration-(--duration-fast)",
  "group-hover:pointer-events-auto group-hover:opacity-100",
  "group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100",
].join(" ");

/**
 * The action sits over the end of the row's first line, where the trailing part or a time is,
 * with the row's hover fill so it covers what's under it, as `PlainRow`'s. Its own cell is
 * `relative` and takes no width, so the button is placed against the end of the main cell, clear
 * of a More button: a table cell is a containing block in every webview, while a `relative` row
 * isn't in WebKit before April 2026 (WebKit bug 240961). In a zero-width cell the button would
 * shrink to its longest word, so `whitespace-nowrap` keeps it on one line. An invisible `after:`
 * area makes its target 24px (WCAG 2.5.8).
 */
const actionClasses = [
  "absolute end-3 -me-1 top-5 inline-flex min-h-5 items-center whitespace-nowrap rounded-sm",
  "bg-surface-muted ps-2 pe-1",
  `text-small text-fg-muted ${shownClasses}`,
  "hover:text-fg focus-ring-inset",
  "after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-['']",
].join(" ");

/** An icon action's place: the top right of the row, where the time is, on the row's fill. */
const iconPlaceClasses = `absolute end-3 top-4 flex rounded-sm bg-surface-muted ${shownClasses}`;

/** A 24px square (WCAG 2.5.8) with its icon at 16px. */
const iconButtonClasses = [
  "inline-flex size-6 items-center justify-center rounded-sm text-fg-muted",
  "hover:text-fg focus-ring-inset [&>svg]:size-4",
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
        <ActionButton action={action} cellProps={grid.cell(row.id, column)} />
      )}
    </td>
  );
}

/**
 * The action's button: its words, or with an `icon` a small icon button whose label is its
 * tooltip and, without a `spokenLabel`, its name (`kit.list-plain-action-icon`).
 */
function ActionButton({
  action,
  cellProps,
}: {
  readonly action: PlainRowAction;
  readonly cellProps: ReturnType<GridNavigation["cell"]>;
}) {
  const name = action.spokenLabel ?? action.label;
  if (action.icon === undefined) {
    return (
      <button
        type="button"
        aria-label={action.spokenLabel}
        className={actionClasses}
        {...cellProps}
        onClick={action.onClick}
      >
        {action.label}
      </button>
    );
  }
  return (
    <span data-part="row-action" className={iconPlaceClasses}>
      <Tooltip text={action.label} visualOnly>
        {() => (
          <button
            type="button"
            aria-label={name}
            className={iconButtonClasses}
            {...cellProps}
            onClick={action.onClick}
          >
            {action.icon}
          </button>
        )}
      </Tooltip>
    </span>
  );
}
