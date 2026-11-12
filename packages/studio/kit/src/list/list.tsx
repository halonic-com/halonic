import { useId } from "react";
import { type GridRow, useGridNavigation } from "../grid-navigation/use-grid-navigation.ts";
import { ListHeading } from "../list-heading/list-heading.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { EmptyList, useFocusOnEmpty } from "./empty-list.tsx";
import { boxClasses, type ListLook } from "./list-lines.ts";
import type { AnyListRow, ListGroup, ListProps } from "./list-props.ts";
import { firstFocusColumn, ListColumns, Row, type RowShared } from "./list-row.tsx";
import { ListSkeleton, useFocusAfterLoading } from "./list-skeleton.tsx";
import { checkColumns } from "./row-columns.tsx";

/**
 * A bordered group of rows: agents, routines, runs. It's one Tab stop: ↑ ↓ move between rows,
 * → reaches a row's More button, Enter opens and Space selects when the list allows it.
 *
 * It's a one-column `grid` (plus the checkbox and More buttons' columns), because rows hold a
 * button and can be selected; a `listbox` can't hold buttons.
 *
 * With `groups` in place of `rows`, each group gets its own heading and box, as the Runs list's
 * days, and the whole list is still one grid: ↑ ↓ pass over the headings.
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
  groups,
  heading,
  headingLevel = 2,
  groupHeadingLevel = 3,
  label,
  onOpen,
  onOpenInNewTab,
  selection,
  current,
  dense = false,
  columns,
  flush: flushProp,
  empty,
  loading = false,
  skeleton = {},
  loadingLabel,
  onRetry,
}: ListProps<Id>) {
  checkColumns(columns);
  const phone = usePresentation() === "phone";
  const look: ListLook = (flushProp ?? phone) ? "flush" : "bordered";
  const headingId = useId();
  const sections = sectionsOf(rows, groups);
  const allRows = sections.flatMap((section) => section.rows);
  const hasMore = allRows.some((row) => row.more !== undefined);
  const hasCheck = onOpen !== undefined && selection !== undefined;
  const grid = useGridNavigation(gridRows(sections, hasCheck, hasMore), {
    startColumn: firstFocusColumn(hasCheck),
  });
  const showEmpty = empty !== undefined && allRows.length === 0;
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
        grouped={groups !== undefined}
        columns={columns}
        shape={skeleton}
        label={loadingLabel ?? ""}
        onRetry={onRetry}
        onFocus={loadedFocus.onFocus}
        onBlur={loadedFocus.onBlur}
      />
    );
  }

  const grouped = groups !== undefined;
  const shared: RowShared<Id> = {
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
    columns,
  };

  // With rows, the heading is the box's first line, so the first row's top corners are square
  // under it. With none, the Empty state takes the box's place below the heading. With groups,
  // the cells draw each group's box, so there's no box round the table.
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
        <div className={grouped ? "" : boxClasses[look]}>
          {headingNode}
          <GridTable
            sections={sections}
            labelProps={labelProps}
            focusWatch={emptyFocus}
            groupHeadingLevel={groupHeadingLevel}
            grouped={grouped}
            hasListHeading={heading !== undefined}
            shared={shared}
          />
        </div>
      )}
    </div>
  );
}

interface GridTableProps<Id extends string> {
  readonly sections: readonly ListSection<Id>[];
  /** The grid's name: its label, or the List's heading. */
  readonly labelProps: { readonly "aria-label"?: string; readonly "aria-labelledby"?: string };
  /** The Empty state's focus watch, told when focus enters or leaves the grid. */
  readonly focusWatch: Pick<ReturnType<typeof useFocusOnEmpty>, "onFocus" | "onBlur">;
  readonly groupHeadingLevel: 2 | 3 | 4;
  /** The List has groups, each in a box the cells draw. */
  readonly grouped: boolean;
  /** The List's own heading is the box's first line. */
  readonly hasListHeading: boolean;
  readonly shared: RowShared<Id>;
}

/** The `grid` itself: one `tbody` per section. */
function GridTable<Id extends string>({
  sections,
  labelProps,
  focusWatch,
  groupHeadingLevel,
  grouped,
  hasListHeading,
  shared,
}: GridTableProps<Id>) {
  const { grid, selection, look } = shared;
  return (
    <table
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a table; on a div Biome asks for the table
      role="grid"
      {...labelProps}
      aria-multiselectable={selection?.multiple === true ? true : undefined}
      className="w-full table-fixed border-separate border-spacing-0"
      {...grid.gridProps}
      onFocus={() => {
        grid.gridProps.onFocus();
        focusWatch.onFocus();
      }}
      onBlur={(event) => {
        grid.gridProps.onBlur(event);
        focusWatch.onBlur(event);
      }}
    >
      <ListColumns hasCheck={shared.hasCheck} hasMore={shared.hasMore} phone={shared.phone} />
      {sections.map((section) => (
        <Section
          key={section.id}
          section={section}
          headingLevel={groupHeadingLevel}
          topCorners={grouped || !hasListHeading}
          boxed={grouped && look === "bordered"}
          shared={shared}
        />
      ))}
    </table>
  );
}

/** A run of rows in one box: a group under its heading, or all of a List's `rows`. */
interface ListSection<Id extends string> {
  readonly id: string;
  /** None for a List of `rows`, whose heading, if any, is the box's first line. */
  readonly heading: ListGroup<Id>["heading"] | undefined;
  readonly rows: readonly AnyListRow<Id>[];
}

/** The List's rows as sections. A group with no rows isn't drawn, heading and all. */
function sectionsOf<Id extends string>(
  rows: readonly AnyListRow<Id>[] | undefined,
  groups: readonly ListGroup<Id, AnyListRow<Id>>[] | undefined,
): readonly ListSection<Id>[] {
  if (groups === undefined) {
    return [{ id: "rows", heading: undefined, rows: rows ?? [] }];
  }
  return groups.filter((group) => group.rows.length > 0);
}

/** A group's heading row, by the group's id. It has no focusable cell, so ↑ ↓ pass over it. */
function headingRowId(groupId: string): string {
  return `group-heading:${groupId}`;
}

/** The grid as `useGridNavigation` sees it: every heading row and row, in order. */
function gridRows<Id extends string>(
  sections: readonly ListSection<Id>[],
  hasCheck: boolean,
  hasMore: boolean,
): GridRow[] {
  return sections.flatMap((section) => [
    ...(section.heading === undefined ? [] : [{ id: headingRowId(section.id), cells: [] }]),
    ...section.rows.map((row) => ({ id: row.id, cells: gridCells(row, hasCheck, hasMore) })),
  ]);
}

/** A row's focusable cells: its checkbox, its main cell and its More button. */
function gridCells(row: AnyListRow, hasCheck: boolean, hasMore: boolean): boolean[] {
  return [...(hasCheck ? [true] : []), true, ...(hasMore ? [row.more !== undefined] : [])];
}

interface SectionProps<Id extends string> {
  readonly section: ListSection<Id>;
  readonly headingLevel: 2 | 3 | 4;
  /** The first row sits in the box's top corners: there's no heading inside the box. */
  readonly topCorners: boolean;
  /** The cells draw the box's edges. */
  readonly boxed: boolean;
  readonly shared: RowShared<Id>;
}

/**
 * One section's rows, in a `tbody` named by the section's heading. The heading sits in a row of
 * its own, across every column, above the box.
 */
function Section<Id extends string>({
  section,
  headingLevel,
  topCorners,
  boxed,
  shared,
}: SectionProps<Id>) {
  const headingId = useId();
  const columns = (shared.hasCheck ? 1 : 0) + 1 + (shared.hasMore ? 1 : 0);
  const { heading, rows } = section;

  return (
    <tbody aria-labelledby={heading === undefined ? undefined : headingId}>
      {heading === undefined ? null : (
        <tr>
          <td colSpan={columns} className="p-0">
            <ListHeading id={headingId} {...heading} headingLevel={headingLevel} />
          </td>
        </tr>
      )}
      {rows.map((row, index) => (
        <Row
          key={row.id}
          row={row}
          place={{
            first: index === 0,
            top: index === 0 && topCorners,
            last: index === rows.length - 1,
            boxed,
          }}
          shared={shared}
        />
      ))}
    </tbody>
  );
}
