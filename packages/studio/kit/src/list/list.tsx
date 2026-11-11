import { useId } from "react";
import { Button } from "../button/button.tsx";
import { type GridNavigation, useGridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import { MoreIcon } from "../icons/more-icon.tsx";
import { ListHeading } from "../list-heading/list-heading.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { CheckCell } from "./check-cell.tsx";
import { EmptyList, useFocusOnEmpty } from "./empty-list.tsx";
import { boxClasses, type ListLook, lineClasses } from "./list-lines.ts";
import type { ListProps, ListRow, ListSelection } from "./list-props.ts";
import { ListSkeleton, useFocusAfterLoading } from "./list-skeleton.tsx";
import { RowContent } from "./row-content.tsx";
import { rowHandlers } from "./row-handlers.ts";

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
  desktop: "w-10 pr-2 touch:w-13 touch:pr-1",
  phone: "w-13 pr-1",
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

/**
 * A bordered group of rows: agents, routines, runs. It's one Tab stop: ↑ ↓ move between rows,
 * → reaches a row's More button, Enter opens and Space selects when the list allows it.
 *
 * It's a one-column `grid` (plus the checkbox and More buttons' columns), because rows hold a
 * button and can be selected; a `listbox` can't hold buttons.
 *
 * @example
 * <List
 *   heading={{ name: "Agents" }}
 *   rows={agents.map((agent) => ({
 *     id: agent.id,
 *     title: agent.name,
 *     meta: agent.model,
 *     trailing: <StatusChip tone="running" dot>Running</StatusChip>,
 *     more: { label: `More actions for ${agent.name}`, onClick: openMenu },
 *   }))}
 *   onOpen={openAgent}
 * />
 */
export function List<Id extends string>({
  rows,
  heading,
  headingLevel = 2,
  label,
  onOpen,
  onOpenInNewTab,
  selection,
  current,
  dense = false,
  flush: flushProp,
  empty,
  loading = false,
  skeleton = {},
  loadingLabel,
  onRetry,
}: ListProps<Id>) {
  const phone = usePresentation() === "phone";
  const look: ListLook = (flushProp ?? phone) ? "flush" : "bordered";
  const headingId = useId();
  const hasMore = rows.some((row) => row.more !== undefined);
  const hasCheck = onOpen !== undefined && selection !== undefined;
  const grid = useGridNavigation(
    rows.map((row) => ({ id: row.id, cells: gridCells(row, hasCheck, hasMore) })),
    { startColumn: firstFocusColumn(hasCheck) },
  );
  const showEmpty = empty !== undefined && rows.length === 0;
  const emptyFocus = useFocusOnEmpty(showEmpty);
  const headingNode =
    heading === undefined ? null : (
      <ListHeading id={headingId} {...heading} headingLevel={headingLevel} />
    );
  const labelProps =
    heading === undefined ? { "aria-label": label } : { "aria-labelledby": headingId };
  const loadedFocus = useFocusAfterLoading(loading, () => {
    if (showEmpty) {
      emptyFocus.titleRef.current?.focus();
    } else {
      grid.focusActive();
    }
  });

  if (loading) {
    return (
      <ListSkeleton
        look={look}
        phone={phone}
        heading={heading === undefined ? undefined : { ...heading, headingLevel }}
        shape={skeleton}
        label={loadingLabel ?? ""}
        onRetry={onRetry}
        onFocus={loadedFocus.onFocus}
        onBlur={loadedFocus.onBlur}
      />
    );
  }

  // With rows, the heading is the box's first line, so the first row's top corners are square
  // under it. With none, the Empty state takes the box's place below the heading.
  return (
    <div>
      {showEmpty ? (
        <>
          {headingNode}
          <EmptyList
            empty={empty}
            listHeadingLevel={heading === undefined ? undefined : headingLevel}
            titleRef={emptyFocus.titleRef}
          />
        </>
      ) : (
        // Not overflow-hidden, which would cut the focus rings of the first and last rows.
        <div className={boxClasses[look]}>
          {headingNode}
          <table
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a table; on a div Biome asks for the table
            role="grid"
            {...labelProps}
            aria-multiselectable={selection?.multiple === true ? true : undefined}
            className="w-full table-fixed border-separate border-spacing-0"
            {...grid.gridProps}
            onFocus={() => {
              grid.gridProps.onFocus();
              emptyFocus.onFocus();
            }}
            onBlur={(event) => {
              grid.gridProps.onBlur(event);
              emptyFocus.onBlur(event);
            }}
          >
            <tbody>
              {rows.map((row, index) => (
                <Row
                  key={row.id}
                  row={row}
                  first={index === 0}
                  top={index === 0 && heading === undefined}
                  last={index === rows.length - 1}
                  look={look}
                  phone={phone}
                  dense={dense}
                  hasMore={hasMore}
                  hasCheck={hasCheck}
                  grid={grid}
                  onOpen={onOpen}
                  onOpenInNewTab={onOpenInNewTab}
                  selection={selection}
                  current={current === row.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The main cell takes focus first, also after a checkbox cell. */
function firstFocusColumn(hasCheck: boolean): number {
  return hasCheck ? 1 : 0;
}

/** A row's focusable cells: its checkbox, its main cell and its More button. */
function gridCells(row: ListRow, hasCheck: boolean, hasMore: boolean): boolean[] {
  return [...(hasCheck ? [true] : []), true, ...(hasMore ? [row.more !== undefined] : [])];
}

interface RowProps<Id extends string> {
  readonly row: ListRow<Id>;
  /** The first row: no line above it. */
  readonly first: boolean;
  /** The first row with no heading above it, so it sits in the box's top corners. */
  readonly top: boolean;
  readonly last: boolean;
  readonly look: ListLook;
  readonly phone: boolean;
  readonly dense: boolean;
  readonly hasMore: boolean;
  readonly hasCheck: boolean;
  readonly grid: GridNavigation;
  readonly onOpen: ((id: Id) => void) | undefined;
  readonly onOpenInNewTab: ((id: Id) => void) | undefined;
  readonly selection: ListSelection<Id> | undefined;
  /** The row is the list's `current` one. */
  readonly current: boolean;
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

interface CellOptions {
  readonly look: "bordered" | "flush";
  readonly first: boolean;
  readonly top: boolean;
  readonly last: boolean;
  readonly state: (typeof rowStateClasses)[keyof typeof rowStateClasses];
  readonly hasCheck: boolean;
  readonly hasMore: boolean;
}

/** The fill, line, corners, selected bar and focus ring of each of a row's cells. */
function cellClasses({ look, first, top, last, state, hasCheck, hasMore }: CellOptions): {
  start: string;
  main: string;
  end: string;
} {
  const lines = first ? { main: "", more: "" } : lineClasses[look];
  const bar = state.main === "" ? "" : `${state.main} ${cornerBarClasses(look, top, last)}`;
  const focus = focusClasses(hasCheck, hasMore);
  // The row's first cell carries the line from 16px in a flush list, the left corners and the bar.
  const start = `${state.fill} ${bar} ${lines.main} ${cornerClasses(look, top, last, "left")}`;
  const right = cornerClasses(look, top, last, "right");
  const main = hasCheck ? `${state.fill} ${lines.more}` : start;
  return {
    start: `${start} focus-ring-row-start`,
    main: `${focus.main} ${main} ${hasMore ? "" : right}`,
    end: `${state.fill} ${focus.end} ${lines.more} ${right}`,
  };
}

function Row<Id extends string>({
  row,
  first,
  top,
  last,
  look,
  phone,
  dense,
  hasMore,
  hasCheck,
  grid,
  onOpen,
  onOpenInNewTab,
  selection,
  current,
}: RowProps<Id>) {
  const isSelected = selection?.selected.has(row.id) === true;
  const isUnavailable = row.unavailable !== undefined;
  const reasonId = useId();
  // Being current only changes the row's look: its `aria-selected` and checkbox follow the selection.
  const state = rowStateClasses[rowState(isUnavailable, isSelected || current)];
  const cells = cellClasses({ look, first, top, last, state, hasCheck, hasMore });
  const mainColumn = hasCheck ? 1 : 0;
  const { onClick, onAuxClick, onKeyDown } = rowHandlers({
    id: row.id,
    isUnavailable,
    onOpen,
    onOpenInNewTab,
    onToggle: selection?.onToggle,
  });

  return (
    <tr
      aria-selected={selection === undefined ? undefined : isSelected}
      aria-current={current ? true : undefined}
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
          className={`${cells.end} ${moreClasses[phone ? "phone" : "desktop"]}`}
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
