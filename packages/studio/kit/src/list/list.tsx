import type { MouseEvent, ReactNode } from "react";
import { useId } from "react";
import { Button } from "../button/button.tsx";
import { type GridNavigation, useGridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import { MoreIcon } from "../icons/more-icon.tsx";
import { ListHeading } from "../list-heading/list-heading.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { rowHandlers } from "./row-handlers.ts";

/** One item in a List: an agent, a routine, a run, a file in a picker. */
export interface ListRow<Id extends string = string> {
  /** Stable, never the index: focus and selection follow it. */
  readonly id: Id;
  readonly title: string;
  /** One line under the title, cut with an ellipsis. */
  readonly meta?: string;
  /**
   * A 20px icon before the text, 16px in a `dense` row as in a Menu item. Hidden from screen
   * readers: the title names the row.
   */
  readonly icon?: ReactNode;
  /** A 28px avatar before the text, in place of the icon. Hidden from screen readers too. */
  readonly avatar?: ReactNode;
  /** On the right: a status chip or a value. */
  readonly trailing?: ReactNode;
  /** The "More" icon button. Its label names the row: "More actions for Sorter". */
  readonly more?: {
    readonly label: string;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /**
   * The row can't be used now: still readable and focusable, but it can't be opened or selected.
   * The reason takes the meta line's place and screen readers hear it with the row.
   */
  readonly unavailable?: ListRowUnavailable;
  /**
   * The row has a problem: the reason takes the meta line's place in `danger`, and a `danger`
   * chip takes the trailing slot. The row stays openable, so it can be fixed.
   */
  readonly error?: { readonly reason: string; readonly chip: string };
}

/** Why a row can't be used right now: "Waiting for the model to download". */
export interface ListRowUnavailable {
  /** The visible text. Unlike the Button's, the List draws it, so it's the text and not an `id`. */
  readonly reason: string;
}

/** The rows the user has picked. The screen keeps the set; Space toggles a row. */
export interface ListSelection<Id extends string = string> {
  readonly selected: ReadonlySet<Id>;
  readonly onToggle: (id: Id) => void;
  /** More than one row at a time, as staging files in Changes. */
  readonly multiple?: boolean;
}

interface ListBase<Id extends string> {
  readonly rows: readonly ListRow<Id>[];
  /** Default 2. */
  readonly headingLevel?: 2 | 3 | 4;
  /** Enter or a click on a row. Without it, a click toggles the selection. */
  readonly onOpen?: (id: Id) => void;
  /**
   * Ctrl Enter (⌘ Enter on a Mac), a Ctrl-click (⌘-click) or a middle click, as the Runs list
   * opens a run in a new tab. Without it those do nothing, as in the Changes file list.
   */
  readonly onOpenInNewTab?: (id: Id) => void;
  readonly selection?: ListSelection<Id>;
  /** 32px rows, for menus and pickers; 48px on a phone. */
  readonly dense?: boolean;
  /** No outer border or radius and lines from 16px. On by default on a phone. */
  readonly flush?: boolean;
}

/** A list named by the heading above it (18.3). */
interface ListWithHeading<Id extends string> extends ListBase<Id> {
  readonly heading: { readonly name: string; readonly detail?: string };
  readonly label?: never;
}

/** A list without a heading, named by a label: "Agents". */
interface ListWithLabel<Id extends string> extends ListBase<Id> {
  readonly label: string;
  readonly heading?: never;
}

/** A list always has a name: a `heading` or a `label`, never both. */
export type ListProps<Id extends string = string> = ListWithHeading<Id> | ListWithLabel<Id>;

/** The 1px line above every row but the first. In a flush list it starts at 16px, with the text. */
const lineClasses = {
  bordered: { main: "border-t border-border", more: "border-t border-border" },
  flush: {
    // A border, not a fill, so forced colours keep it.
    main: "relative before:absolute before:top-0 before:right-0 before:left-4 before:h-0 before:border-t before:border-border",
    more: "border-t border-border",
  },
} as const;

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
 * The More button's column. On desktop the button shows on hover and while the row has focus, and
 * it's always reachable by keyboard. On a phone or a touch screen it's always there.
 */
const moreClasses = {
  desktop:
    "w-10 pr-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:w-13 touch:pr-1 touch:opacity-100",
  phone: "w-13 pr-1",
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
}: ListProps<Id>) {
  const phone = usePresentation() === "phone";
  const look = (flushProp ?? phone) ? "flush" : "bordered";
  const headingId = useId();
  const hasMore = rows.some((row) => row.more !== undefined);
  const grid = useGridNavigation(
    rows.map((row) => ({ id: row.id, cells: hasMore ? [true, row.more !== undefined] : [true] })),
  );

  return (
    <div>
      {heading === undefined ? null : (
        <ListHeading id={headingId} {...heading} headingLevel={headingLevel} />
      )}
      {/* Not overflow-hidden, which would cut the focus rings of the first and last rows. */}
      <div className={look === "bordered" ? "rounded-md border border-border" : ""}>
        <table
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a table; on a div Biome asks for the table
          role="grid"
          aria-labelledby={heading === undefined ? undefined : headingId}
          aria-label={heading === undefined ? label : undefined}
          aria-multiselectable={selection?.multiple === true ? true : undefined}
          className="w-full table-fixed border-separate border-spacing-0"
          {...grid.gridProps}
        >
          <tbody>
            {rows.map((row, index) => (
              <Row
                key={row.id}
                row={row}
                first={index === 0}
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
    </div>
  );
}

interface RowProps<Id extends string> {
  readonly row: ListRow<Id>;
  readonly first: boolean;
  readonly last: boolean;
  readonly look: "bordered" | "flush";
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
  look: "bordered" | "flush",
  first: boolean,
  last: boolean,
  side: "left" | "right",
): string {
  if (look === "flush") {
    return "";
  }
  const top = side === "left" ? "rounded-tl-md" : "rounded-tr-md";
  const bottom = side === "left" ? "rounded-bl-md" : "rounded-br-md";
  return `${first ? top : ""} ${last ? bottom : ""}`;
}

/**
 * A selected corner row's bar starts 8px from the box's edge, not 6px, so it stays inside the
 * border's 11px inner curve.
 */
function cornerBarClasses(look: "bordered" | "flush", first: boolean, last: boolean): string {
  if (look === "flush") {
    return "";
  }
  return [first ? "after:top-2" : "", last ? "after:bottom-2" : ""].filter(Boolean).join(" ");
}

/** The row's chip or value, or an error's `danger` chip in its place. */
function trailingOf(row: ListRow): ReactNode {
  return row.error === undefined ? (
    row.trailing
  ) : (
    <StatusChip tone="danger">{row.error.chip}</StatusChip>
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
  const bar = state.main === "" ? "" : `${state.main} ${cornerBarClasses(look, first, last)}`;
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
        className={`p-0 focus-ring-inset ${state.fill} ${bar} ${lines.main} ${cornerClasses(look, first, last, "left")} ${hasMore ? "" : cornerClasses(look, first, last, "right")} ${isUnavailable ? "cursor-not-allowed" : "cursor-pointer"}`}
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
          className={`${state.fill} ${moreClasses[phone ? "phone" : "desktop"]} ${lines.more} ${cornerClasses(look, first, last, "right")}`}
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

/**
 * The row's icon or avatar. `small` is a 32px `dense` row; a dense row 48px high, on a phone or
 * under a coarse pointer, keeps 20px.
 */
function Leading({ row, small }: { readonly row: ListRow; readonly small: boolean }) {
  const dim = row.unavailable !== undefined;
  if (row.avatar !== undefined) {
    return (
      <span aria-hidden="true" className={`size-7 shrink-0 ${dim ? "opacity-45" : ""}`}>
        {row.avatar}
      </span>
    );
  }
  if (row.icon !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={`inline-grid ${small ? "size-icon-sm touch:size-icon-md" : "size-icon-md"} shrink-0 place-items-center *:size-full ${dim ? "text-fg-disabled text-forced-disabled" : "text-fg-muted"}`}
      >
        {row.icon}
      </span>
    );
  }
  return null;
}

interface MetaLineProps {
  readonly row: ListRow;
  readonly text: string | undefined;
  readonly id: string;
  /** On a phone next to a More button, the chip starts the last line (kit 6). */
  readonly chip: ReactNode;
}

/**
 * The line under the title: the meta text, an error's reason or why the row is unavailable. With
 * a chip, the chip comes first and only the text is cut; without text, the chip has the line alone.
 */
function MetaLine({ row, text, id, chip }: MetaLineProps) {
  if (text === undefined && chip === undefined) {
    return null;
  }
  // An unavailable row's reason stays at full strength, so it can be read (VRK 0.6).
  let colour = "text-fg-muted";
  if (row.error !== undefined && row.unavailable === undefined) {
    colour = "text-danger";
  }
  const line =
    text === undefined ? null : (
      <span
        id={row.unavailable === undefined ? undefined : id}
        className={`truncate text-small ${colour}`}
      >
        {text}
      </span>
    );
  if (chip === undefined) {
    return line;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0">{chip}</span>
      {line === null ? null : <span className="flex min-w-0">{line}</span>}
    </span>
  );
}
