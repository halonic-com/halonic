import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useId } from "react";
import { Button } from "../button/button.tsx";
import { type GridNavigation, useGridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import { MoreIcon } from "../icons/more-icon.tsx";
import { isComposing } from "../keyboard/is-composing.ts";
import { ListHeading } from "../list-heading/list-heading.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";

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
  /** Still readable and focusable, but it can't be opened or selected. */
  readonly disabled?: boolean;
  /**
   * The row has a problem: the reason takes the meta line's place in `danger`, and a `danger`
   * chip takes the trailing slot. The row stays openable, so it can be fixed.
   */
  readonly error?: { readonly reason: string; readonly chip: string };
}

/** The rows the user has picked. The screen keeps the set; Space toggles a row. */
export interface ListSelection<Id extends string = string> {
  readonly selected: ReadonlySet<Id>;
  readonly onToggle: (id: Id) => void;
  /** More than one row at a time, as staging files in Changes. */
  readonly multiple?: boolean;
}

export interface ListProps<Id extends string = string> {
  readonly rows: readonly ListRow<Id>[];
  /** The heading above the list (18.3), which also names it. */
  readonly heading?: { readonly name: string; readonly detail?: string };
  /** Default 2. */
  readonly headingLevel?: 2 | 3 | 4;
  /** The list's name when it has no heading: "Agents". */
  readonly label?: string;
  /** Enter or a click on a row. Without it, a click toggles the selection. */
  readonly onOpen?: (id: Id) => void;
  readonly selection?: ListSelection<Id>;
  /** 32px rows, for menus and pickers; 48px on a phone. */
  readonly dense?: boolean;
  /** No outer border or radius and lines from 16px. On by default on a phone. */
  readonly flush?: boolean;
}

/** The 1px line above every row but the first. In a flush list it starts at 16px, with the text. */
const lineClasses = {
  bordered: { main: "border-t border-border", more: "border-t border-border" },
  flush: {
    main: "relative before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border",
    more: "border-t border-border",
  },
} as const;

/** Selected: the accent fill, the 2px accent bar on the main cell and a high-contrast outline. */
const stateClasses = {
  default: { row: "bg-surface hover:bg-surface-subtle active:bg-surface-subtle", main: "" },
  selected: { row: "bg-accent-soft selected-forced", main: "selected-bar" },
} as const;

/** The row's height, from the presentation, the density and whether it has a meta line. */
function heightClasses(phone: boolean, dense: boolean, hasMeta: boolean): string {
  if (phone) {
    return dense ? "min-h-touch py-2" : "min-h-14 py-3";
  }
  if (dense) {
    return "min-h-control-md";
  }
  return hasMeta ? "min-h-14" : "min-h-control-lg";
}

/**
 * The More button's column. On desktop the button shows on hover and while the row has focus, and
 * it's always reachable by keyboard. On a phone or a touch screen it's always there.
 */
const moreClasses = {
  desktop:
    "w-10 pr-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch:w-13 touch:opacity-100",
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
      <div className={look === "bordered" ? "overflow-hidden rounded-md border border-border" : ""}>
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
                look={look}
                phone={phone}
                dense={dense}
                hasMore={hasMore}
                grid={grid}
                onOpen={onOpen}
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
  readonly look: "bordered" | "flush";
  readonly phone: boolean;
  readonly dense: boolean;
  readonly hasMore: boolean;
  readonly grid: GridNavigation;
  readonly onOpen: ((id: Id) => void) | undefined;
  readonly selection: ListSelection<Id> | undefined;
}

function Row<Id extends string>({
  row,
  first,
  look,
  phone,
  dense,
  hasMore,
  grid,
  onOpen,
  selection,
}: RowProps<Id>) {
  const isSelected = selection?.selected.has(row.id) === true;
  const state = stateClasses[isSelected ? "selected" : "default"];
  const isDisabled = row.disabled === true;
  const meta = row.error?.reason ?? row.meta;
  const trailing =
    row.error === undefined ? (
      row.trailing
    ) : (
      <StatusChip tone="danger">{row.error.chip}</StatusChip>
    );
  // On a phone the right edge has one job: next to a More button, the chip goes under the text.
  const trailingBelow = phone && row.more !== undefined;
  const lines = first ? { main: "", more: "" } : lineClasses[look];

  const onClick = () => {
    if (isDisabled) {
      return;
    }
    if (onOpen !== undefined) {
      onOpen(row.id);
    } else {
      selection?.onToggle(row.id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableCellElement>) => {
    if (event.target !== event.currentTarget || isComposing(event) || isDisabled) {
      return;
    }
    if (event.key === "Enter" && onOpen !== undefined) {
      event.preventDefault();
      onOpen(row.id);
    } else if (event.key === " " && selection !== undefined) {
      event.preventDefault();
      selection.onToggle(row.id);
    }
  };

  return (
    <tr
      aria-selected={selection === undefined ? undefined : isSelected}
      aria-disabled={isDisabled ? true : undefined}
      className={`group ${state.row}`}
    >
      {/* biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from grid.cell(), which Biome can't see */}
      <td
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid above
        role="gridcell"
        {...grid.cell(row.id, 0)}
        className={`p-0 focus-ring-inset ${lines.main} ${state.main} ${isDisabled ? "cursor-default" : "cursor-pointer"}`}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <div
          className={`flex items-center gap-3 px-4 ${heightClasses(phone, dense, meta !== undefined)}`}
        >
          <Leading row={row} small={dense && !phone} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className={`truncate text-body-strong ${isDisabled ? "text-fg-disabled" : "text-fg"}`}
            >
              {row.title}
            </span>
            {meta === undefined ? null : <Meta row={row} text={meta} />}
            {trailingBelow && trailing !== undefined ? (
              <span className="mt-1 flex">{trailing}</span>
            ) : null}
          </div>
          {!trailingBelow && trailing !== undefined ? (
            <span className="flex shrink-0 items-center">{trailing}</span>
          ) : null}
        </div>
      </td>
      {hasMore ? (
        <td className={`p-0 text-right ${moreClasses[phone ? "phone" : "desktop"]} ${lines.more}`}>
          {row.more === undefined ? null : (
            <Button
              variant="ghost"
              icon={<MoreIcon />}
              label={row.more.label}
              onClick={row.more.onClick}
              {...grid.cell(row.id, 1)}
            />
          )}
        </td>
      ) : null}
    </tr>
  );
}

/** The row's icon or avatar. `small` is a 32px `dense` row; a dense row 48px high keeps 20px. */
function Leading({ row, small }: { readonly row: ListRow; readonly small: boolean }) {
  const dim = row.disabled === true;
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
        className={`inline-grid ${small ? "size-icon-sm" : "size-icon-md"} shrink-0 place-items-center *:size-full ${dim ? "text-fg-disabled" : "text-fg-muted"}`}
      >
        {row.icon}
      </span>
    );
  }
  return null;
}

function Meta({ row, text }: { readonly row: ListRow; readonly text: string }) {
  let colour = "text-fg-muted";
  if (row.disabled === true) {
    colour = "text-fg-disabled";
  } else if (row.error !== undefined) {
    colour = "text-danger";
  }
  return <span className={`truncate text-small ${colour}`}>{text}</span>;
}
