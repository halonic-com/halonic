import type { ReactNode } from "react";
import { useId } from "react";
import { Button } from "../button/button.tsx";
import { type GridNavigation, useGridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import { MoreIcon } from "../icons/more-icon.tsx";
import { ListHeading } from "../list-heading/list-heading.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { EmptyList, useFocusOnEmpty } from "./empty-list.tsx";
import { boxClasses, type ListLook, lineClasses } from "./list-lines.ts";
import type { ListProps, ListRow, ListSelection } from "./list-props.ts";
import { ListSkeleton, useFocusAfterLoading } from "./list-skeleton.tsx";
import { rowHandlers } from "./row-handlers.ts";
import { Leading, MetaLine } from "./row-parts.tsx";

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

/** The row's height, from the presentation, the density and whether it has a meta line. */
function heightClasses(phone: boolean, dense: boolean, hasMeta: boolean): string {
  if (phone) {
    return dense ? "min-h-touch py-2" : "min-h-14 py-3";
  }
  if (dense) {
    return "min-h-control-md touch:min-h-touch";
  }
  return hasMeta ? "min-h-14" : "min-h-control-lg touch:min-h-touch";
}

/**
 * The More button's column. The button is always there, dimmed (`fg-muted`, the ghost button's
 * colour) until it's hovered. The cell is part of the row: its line and fills reach the box's edge.
 */
const moreClasses = {
  desktop: "w-10 pr-2 touch:w-13 touch:pr-1",
  phone: "w-13 pr-1",
} as const;

/**
 * The keyboard focus ring. With a More column it goes round the whole row: the main cell draws it
 * without its end edge and the More cell draws the rest, while the main cell has focus.
 */
const focusClasses = {
  alone: "focus-ring-inset",
  withMore: { main: "focus-ring-row-start", more: "focus-ring-row-end" },
} as const;

/**
 * A bordered group of rows: agents, routines, runs. It's one Tab stop: ↑ ↓ move between rows,
 * → reaches a row's More button, Enter opens and Space selects when the list allows it.
 *
 * It's a one-column `grid` (plus the More buttons' column), because rows hold a button and can be
 * selected; a `listbox` can't hold buttons.
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
  const grid = useGridNavigation(
    rows.map((row) => ({ id: row.id, cells: hasMore ? [true, row.more !== undefined] : [true] })),
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
                  grid={grid}
                  onOpen={onOpen}
                  onOpenInNewTab={onOpenInNewTab}
                  selection={selection}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
  readonly grid: GridNavigation;
  readonly onOpen: ((id: Id) => void) | undefined;
  readonly onOpenInNewTab: ((id: Id) => void) | undefined;
  readonly selection: ListSelection<Id> | undefined;
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

/**
 * The row's chip or value, or an error's `danger` chip in its place. The error chip has its dot,
 * so the state doesn't rest on colour alone.
 */
function trailingOf(row: ListRow): ReactNode {
  return row.error === undefined ? (
    row.trailing
  ) : (
    <StatusChip tone="danger" dot>
      {row.error.chip}
    </StatusChip>
  );
}

function rowState(isUnavailable: boolean, isSelected: boolean): keyof typeof rowStateClasses {
  if (isUnavailable) {
    return "unavailable";
  }
  return isSelected ? "selected" : "default";
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
  grid,
  onOpen,
  onOpenInNewTab,
  selection,
}: RowProps<Id>) {
  const isSelected = selection?.selected.has(row.id) === true;
  const isUnavailable = row.unavailable !== undefined;
  const reasonId = useId();
  const lines = first ? { main: "", more: "" } : lineClasses[look];
  const state = rowStateClasses[rowState(isUnavailable, isSelected)];
  const bar = state.main === "" ? "" : `${state.main} ${cornerBarClasses(look, top, last)}`;
  const focus = hasMore ? focusClasses.withMore.main : focusClasses.alone;
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
      aria-disabled={isUnavailable ? true : undefined}
      className={`group ${state.row}`}
    >
      {/* biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from grid.cell(), which Biome can't see */}
      <td
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid above
        role="gridcell"
        {...grid.cell(row.id, 0)}
        aria-describedby={isUnavailable ? reasonId : undefined}
        className={`p-0 ${focus} ${state.fill} ${bar} ${lines.main} ${cornerClasses(look, top, last, "left")} ${hasMore ? "" : cornerClasses(look, top, last, "right")} ${isUnavailable ? "cursor-not-allowed" : "cursor-pointer"}`}
        onClick={onClick}
        onAuxClick={onAuxClick}
        onKeyDown={onKeyDown}
      >
        <RowContent row={row} phone={phone} dense={dense} reasonId={reasonId} />
      </td>
      {hasMore ? (
        <MoreCell
          row={row}
          dense={dense}
          grid={grid}
          className={`${state.fill} ${focusClasses.withMore.more} ${moreClasses[phone ? "phone" : "desktop"]} ${lines.more} ${cornerClasses(look, top, last, "right")}`}
        />
      ) : null}
    </tr>
  );
}

interface RowContentProps {
  readonly row: ListRow;
  readonly phone: boolean;
  readonly dense: boolean;
  /** The id of the meta line, which an unavailable row's cell names with `aria-describedby`. */
  readonly reasonId: string;
}

/** The main cell's inside: the icon or avatar, the title, the meta line and the trailing part. */
function RowContent({ row, phone, dense, reasonId }: RowContentProps) {
  const meta = row.unavailable?.reason ?? row.error?.reason ?? row.meta;
  const trailing = trailingOf(row);
  // On a phone the right edge has one job: next to a More button, the chip starts the meta line.
  const trailingBelow = phone && row.more !== undefined;
  const showTrailingRight = !trailingBelow && trailing !== undefined;

  return (
    <div
      className={`flex items-center gap-3 px-4 ${heightClasses(phone, dense, meta !== undefined)}`}
    >
      <Leading row={row} small={dense && !phone} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-body-strong ${row.unavailable === undefined ? "text-fg" : "text-fg-disabled text-forced-disabled"}`}
        >
          {row.title}
        </span>
        <MetaLine row={row} text={meta} id={reasonId} chip={trailingBelow ? trailing : undefined} />
      </div>
      {showTrailingRight ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </div>
  );
}

interface MoreCellProps<Id extends string> {
  readonly row: ListRow<Id>;
  readonly dense: boolean;
  readonly grid: GridNavigation;
  readonly className: string;
}

/** The row's More button, or an empty cell when another row has one and this row doesn't. */
function MoreCell<Id extends string>({ row, dense, grid, className }: MoreCellProps<Id>) {
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
          {...grid.cell(row.id, 1)}
        />
      )}
    </td>
  );
}
