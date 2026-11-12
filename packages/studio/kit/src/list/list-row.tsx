import { useId } from "react";
import { Button } from "../button/button.tsx";
import type { GridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import { MoreIcon } from "../icons/more-icon.tsx";
import { CheckCell, checkColumnWidth } from "./check-cell.tsx";
import { type ListLook, lineClasses } from "./list-lines.ts";
import type { ListRow, ListSelection } from "./list-props.ts";
import { RowContent } from "./row-content.tsx";
import { rowHandlers } from "./row-handlers.ts";

/*
 * One row of a List: its checkbox cell, main cell and More cell, with their fills, lines, corners
 * and focus ring. Split out of list.tsx, which keeps the grid, the groups and the states around it.
 */

/**
 * `fill` goes on the cells, not the row, so the corner cells' radius keeps it inside the box.
 * Selected also has the 2px accent bar on the main cell and, on the row, a high-contrast outline:
 * on the cells it would draw a line between the main cell and the More cell.
 */
const rowStateClasses = {
  default: {
    fill: "bg-surface transition-colors group-hover:bg-surface-subtle group-active:bg-surface-subtle",
    row: "",
    main: "",
  },
  selected: { fill: "bg-accent-soft", row: "selected-forced", main: "selected-bar" },
  // No hover or press: it can't be opened.
  unavailable: { fill: "bg-surface", row: "", main: "" },
} as const;

/**
 * The More button's column. The button is always there, dimmed (`fg-muted`, the ghost button's
 * colour) until it's hovered. The cell is part of the row: its line and fills reach the box's edge.
 */
const moreClasses = {
  desktop: { width: "w-10 touch:w-13", padding: "pr-2 touch:pr-1" },
  phone: { width: "w-13", padding: "pr-1" },
} as const;

/**
 * In a grouped List each group is its own box, and one table holds them all, so the cells draw the
 * box: the first cell its left edge, the last cell its right edge, the last row its bottom edge.
 * The top edge is the line every row already has. Borders, not fills, so forced colours keep them.
 */
const boxEdgeClasses = {
  start: "border-l border-border",
  end: "border-r border-border",
  bottom: "border-b border-border",
} as const;

/**
 * The keyboard focus ring. With a checkbox or a More column it goes round the whole row while the
 * main cell has focus: the first cell draws its start edge, the last cell its end edge, and every
 * cell its top and bottom. The checkbox has its own ring when it has focus.
 */
function focusClasses(hasCheck: boolean, hasMore: boolean): { main: string; end: string } {
  if (!(hasCheck || hasMore)) {
    return { main: "focus-ring-inset", end: "" };
  }
  if (!hasCheck) {
    return { main: "focus-ring-row-start", end: "focus-ring-row-end" };
  }
  return {
    main: hasMore ? "focus-ring-row-middle" : "focus-ring-row-end",
    end: "focus-ring-row-end",
  };
}

/** The radius of the box's corners, on the cells that sit in them, so their fills stay inside. */
function cornerClasses(
  look: ListLook,
  top: boolean,
  last: boolean,
  side: "left" | "right",
): string {
  if (look === "flush") {
    return "";
  }
  const topCorner = side === "left" ? "rounded-tl-md" : "rounded-tr-md";
  const bottomCorner = side === "left" ? "rounded-bl-md" : "rounded-br-md";
  return `${top ? topCorner : ""} ${last ? bottomCorner : ""}`;
}

/**
 * A selected corner row's bar starts 8px from the box's edge, not 6px, so it stays inside the
 * border's 11px inner curve.
 */
function cornerBarClasses(look: ListLook, top: boolean, last: boolean): string {
  if (look === "flush") {
    return "";
  }
  return [top ? "after:top-2" : "", last ? "after:bottom-2" : ""].filter(Boolean).join(" ");
}

function rowState(isUnavailable: boolean, isSelected: boolean): keyof typeof rowStateClasses {
  if (isUnavailable) {
    return "unavailable";
  }
  return isSelected ? "selected" : "default";
}

/** Where a row sits in its box. */
export interface RowPlace {
  /** The first row of its box or group: no line above it, unless the cells draw the box. */
  readonly first: boolean;
  /** The row sits in the box's top corners: no heading inside the box above it. */
  readonly top: boolean;
  /** The last row of its box or group, in the box's bottom corners. */
  readonly last: boolean;
  /** The cells draw the box's edges: a bordered List with groups. */
  readonly boxed: boolean;
}

interface CellOptions extends RowPlace {
  readonly look: ListLook;
  readonly state: (typeof rowStateClasses)[keyof typeof rowStateClasses];
  readonly hasCheck: boolean;
  readonly hasMore: boolean;
}

/** The fill, line, edges, corners, selected bar and focus ring of each of a row's cells. */
function cellClasses(options: CellOptions): { start: string; main: string; end: string } {
  const { look, first, top, last, boxed, state, hasCheck, hasMore } = options;
  // In a drawn box the first row's line is the box's top edge.
  const lines = first && !boxed ? { main: "", more: "" } : lineClasses[look];
  const bottom = boxed && last ? boxEdgeClasses.bottom : "";
  const bar = state.main === "" ? "" : `${state.main} ${cornerBarClasses(look, top, last)}`;
  const focus = focusClasses(hasCheck, hasMore);
  // The row's first cell carries the line from 16px in a flush list, the left corners and the bar.
  const start = `${state.fill} ${bar} ${lines.main} ${bottom} ${boxed ? boxEdgeClasses.start : ""} ${cornerClasses(look, top, last, "left")}`;
  const right = `${cornerClasses(look, top, last, "right")} ${boxed ? boxEdgeClasses.end : ""}`;
  const main = hasCheck ? `${state.fill} ${lines.more} ${bottom}` : start;
  return {
    start: `${start} focus-ring-row-start`,
    main: `${focus.main} ${main} ${hasMore ? "" : right}`,
    end: `${state.fill} ${focus.end} ${lines.more} ${bottom} ${right}`,
  };
}

/** What every row of a List shares. */
export interface RowShared<Id extends string> {
  readonly look: ListLook;
  readonly phone: boolean;
  readonly dense: boolean;
  readonly hasMore: boolean;
  readonly hasCheck: boolean;
  readonly grid: GridNavigation;
  readonly onOpen: ((id: Id) => void) | undefined;
  readonly onOpenInNewTab: ((id: Id) => void) | undefined;
  readonly selection: ListSelection<Id> | undefined;
  /** The list's `current` row. */
  readonly current: Id | undefined;
}

/** The props of `Row`: the row, where it sits, and what every row shares. */
export interface RowProps<Id extends string> {
  readonly row: ListRow<Id>;
  readonly place: RowPlace;
  readonly shared: RowShared<Id>;
}

/** The main cell takes focus first, also after a checkbox cell. */
export function firstFocusColumn(hasCheck: boolean): number {
  return hasCheck ? 1 : 0;
}

/**
 * The grid's columns and their widths. The table's layout is fixed, so without them the first
 * row sets the widths, and a group's heading, one cell across them all, would split them evenly.
 */
export function ListColumns({
  hasCheck,
  hasMore,
  phone,
}: {
  readonly hasCheck: boolean;
  readonly hasMore: boolean;
  readonly phone: boolean;
}) {
  return (
    <colgroup>
      {hasCheck ? <col className={checkColumnWidth} /> : null}
      <col />
      {hasMore ? <col className={moreClasses[phone ? "phone" : "desktop"].width} /> : null}
    </colgroup>
  );
}

/** One row of the List's grid. */
export function Row<Id extends string>({ row, place, shared }: RowProps<Id>) {
  const { look, phone, dense, hasMore, hasCheck, grid, selection } = shared;
  const isSelected = selection?.selected.has(row.id) === true;
  const isCurrent = shared.current === row.id;
  const isUnavailable = row.unavailable !== undefined;
  const reasonId = useId();
  // Being current only changes the row's look: its `aria-selected` and checkbox follow the selection.
  const state = rowStateClasses[rowState(isUnavailable, isSelected || isCurrent)];
  const cells = cellClasses({ look, ...place, state, hasCheck, hasMore });
  const mainColumn = firstFocusColumn(hasCheck);
  const more = moreClasses[phone ? "phone" : "desktop"];
  const { onClick, onAuxClick, onKeyDown } = rowHandlers({
    id: row.id,
    isUnavailable,
    onOpen: shared.onOpen,
    onOpenInNewTab: shared.onOpenInNewTab,
    onToggle: selection?.onToggle,
  });

  return (
    <tr
      aria-selected={selection === undefined ? undefined : isSelected}
      aria-current={isCurrent ? true : undefined}
      aria-disabled={isUnavailable ? true : undefined}
      className={`group ${state.row}`}
    >
      {hasCheck && selection !== undefined ? (
        <CheckCell
          row={row}
          selection={selection}
          isSelected={isSelected}
          reasonId={reasonId}
          grid={grid}
          className={cells.start}
        />
      ) : null}
      {/* biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from grid.cell(), which Biome can't see */}
      <td
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid above
        role="gridcell"
        {...grid.cell(row.id, mainColumn)}
        aria-describedby={isUnavailable ? reasonId : undefined}
        className={`p-0 ${cells.main} ${isUnavailable ? "cursor-not-allowed" : "cursor-pointer"}`}
        onClick={onClick}
        onAuxClick={onAuxClick}
        onKeyDown={onKeyDown}
      >
        <RowContent
          row={row}
          phone={phone}
          dense={dense}
          reasonId={reasonId}
          afterCheck={hasCheck}
        />
      </td>
      {hasMore ? (
        <MoreCell
          row={row}
          dense={dense}
          grid={grid}
          column={mainColumn + 1}
          className={`${cells.end} ${more.width} ${more.padding}`}
        />
      ) : null}
    </tr>
  );
}

interface MoreCellProps<Id extends string> {
  readonly row: ListRow<Id>;
  readonly dense: boolean;
  readonly grid: GridNavigation;
  /** The More button's column: 1, or 2 after a checkbox cell. */
  readonly column: number;
  readonly className: string;
}

/** The row's More button, or an empty cell when another row has one and this row doesn't. */
function MoreCell<Id extends string>({ row, dense, grid, column, className }: MoreCellProps<Id>) {
  return (
    <td className={`p-0 text-right ${className}`}>
      {row.more === undefined ? null : (
        <Button
          variant="ghost"
          // 28px, so the button stays clear of a 32px row's lines; its 36px ring overlaps them
          // and isn't clipped.
          size={dense ? "sm" : "md"}
          icon={<MoreIcon />}
          label={row.more.label}
          onClick={row.more.onClick}
          {...grid.cell(row.id, column)}
        />
      )}
    </td>
  );
}
