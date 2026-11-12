import { Fragment, type ReactNode } from "react";
import { StatusChip } from "../status-chip/status-chip.tsx";
import type { AnyListRow, ListColumn, ListColumnKind } from "./list-props.ts";
import { Leading } from "./row-parts.tsx";

/*
 * The inside of a List row's main cell when the List has columns (spec HAL-6764, sections 2 and 3).
 * It's drawn twice, side by side and stacked, and the cell's own width picks one: from 800px
 * (`@list-wide:`) the columns sit side by side, below it each row stacks them on three lines, the
 * phone row (PL 10). Both are hidden from screen readers, which hear the row's `label` instead.
 *
 * The cell, not the List, is measured: a checkbox column (44px) and a More column take their
 * width from the List first, and the columns must fit in what's left. The Runs list's columns need
 * 752px with their gaps and padding, so they fit from 800px. A List whose columns need more than
 * 800px would overflow just above it, so it needs fewer columns or a wider breakpoint.
 */

/**
 * Each column's width. Every row uses the same, and so do the skeleton rows, so the columns line
 * up down the List.
 */
export const columnWidthClasses: Record<ListColumnKind, string> = {
  status: "w-30 shrink-0",
  code: "w-16 shrink-0",
  main: "min-w-50 flex-1",
  text: "w-48 shrink-0",
  time: "w-24 shrink-0 text-right",
};

/**
 * A column's React key. The main column has no `key` of its own, and the others' keys are the
 * screen's to choose, so they get a prefix: a column keyed "main" can't clash with the main one.
 */
export function columnKey(column: ListColumn): string {
  return column.kind === "main" ? "main" : `cell:${column.key}`;
}

/**
 * Exactly one `main` column, which holds the title, and every other column's key used once, since
 * the cells are found and drawn by it: a mistake here is the screen's, not the user's. A List
 * without columns has nothing to check.
 */
export function checkColumns(columns: readonly ListColumn[] | undefined): void {
  if (columns === undefined) {
    return;
  }
  const mains = columns.filter((column) => column.kind === "main").length;
  if (mains !== 1) {
    throw new Error(`A List's columns have exactly one main column, not ${mains}.`);
  }
  const keys = columns.flatMap((column) => (column.kind === "main" ? [] : [column.key]));
  const repeated = keys.find((key, index) => keys.indexOf(key) !== index);
  if (repeated !== undefined) {
    throw new Error(`A List's columns each have their own key: "${repeated}" is used twice.`);
  }
}

/** Text in an unavailable row is dimmed; its chips and tags keep their colour: they carry state. */
function textColour(row: AnyListRow, normal: string): string {
  return row.unavailable === undefined ? normal : "text-fg-disabled text-forced-disabled";
}

/** The line under the title: an unavailable row's reason, an error's reason, or the meta text. */
function metaOf(row: AnyListRow): { readonly text: string | undefined; readonly colour: string } {
  if (row.unavailable !== undefined) {
    // At full strength, so it can be read (VRK 0.6).
    return { text: row.unavailable.reason, colour: "text-fg-muted" };
  }
  if (row.error !== undefined) {
    return { text: row.error.reason, colour: "text-danger" };
  }
  return { text: row.meta, colour: "text-fg-muted" };
}

/** A `status` column's chip. An error's `danger` chip, with its dot, takes the first one's place. */
function statusOf(row: AnyListRow, column: ListColumn, columns: readonly ListColumn[]): ReactNode {
  const firstStatus = columns.find((candidate) => candidate.kind === "status");
  if (row.error !== undefined && column === firstStatus) {
    return (
      <StatusChip tone="danger" dot>
        {row.error.chip}
      </StatusChip>
    );
  }
  return column.kind === "main" ? null : row.cells?.[column.key]?.value;
}

function Title({ row }: { readonly row: AnyListRow }) {
  return (
    <span className={`truncate text-body-strong ${textColour(row, "text-fg")}`}>{row.title}</span>
  );
}

function Tag({ row }: { readonly row: AnyListRow }) {
  return row.tag === undefined ? null : <span className="flex shrink-0">{row.tag}</span>;
}

/** One column's cell in the side-by-side layout. */
function WideCell({
  row,
  column,
  columns,
}: {
  readonly row: AnyListRow;
  readonly column: ListColumn;
  readonly columns: readonly ListColumn[];
}) {
  const width = columnWidthClasses[column.kind];
  if (column.kind === "main") {
    const meta = metaOf(row);
    return (
      <div className={`flex items-center gap-3 ${width}`}>
        <Leading row={row} small={false} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <Title row={row} />
            <Tag row={row} />
          </span>
          {meta.text === undefined ? null : (
            <span className={`truncate text-small ${meta.colour}`}>{meta.text}</span>
          )}
        </div>
      </div>
    );
  }
  const cell = row.cells?.[column.key];
  switch (column.kind) {
    case "status":
      return <div className={`flex ${width}`}>{statusOf(row, column, columns)}</div>;
    case "code":
      return (
        <div
          className={`font-mono text-code tabular-nums ${width} ${textColour(row, "text-fg-muted")}`}
        >
          {cell?.value}
        </div>
      );
    case "text":
      return (
        <div className={`line-clamp-2 text-small ${width} ${textColour(row, "text-fg")}`}>
          {cell?.value}
        </div>
      );
    case "time":
      return (
        <div className={`flex flex-col text-small whitespace-nowrap tabular-nums ${width}`}>
          <span className={textColour(row, "text-fg")}>{cell?.value}</span>
          {cell?.detail === undefined ? null : (
            <span className={textColour(row, "text-fg-subtle")}>{cell.detail}</span>
          )}
        </div>
      );
    default:
      return null;
  }
}

/**
 * The third line of a stacked row: every column but `main` and `status`, in their order, joined
 * with " · ". A `time` shows its value only; the short id keeps its typeface.
 */
function StackedFooter({
  row,
  columns,
  tagFirst,
}: {
  readonly row: AnyListRow;
  readonly columns: readonly ListColumn[];
  readonly tagFirst: boolean;
}) {
  const parts = columns.flatMap((column) => {
    if (column.kind === "main" || column.kind === "status") {
      return [];
    }
    const value = row.cells?.[column.key]?.value;
    if (value === undefined) {
      return [];
    }
    const part =
      column.kind === "code" ? <span className="font-mono text-code">{value}</span> : value;
    return [{ key: column.key, part }];
  });
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {tagFirst ? <Tag row={row} /> : null}
      <span className={`truncate text-small ${textColour(row, "text-fg-muted")}`}>
        {parts.map(({ key, part }, index) => (
          <Fragment key={key}>
            {index === 0 ? null : " · "}
            {part}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

/** The phone row's three lines: title and chip, the meta line, then the other columns. */
function Stacked({
  row,
  columns,
  phone,
}: {
  readonly row: AnyListRow;
  readonly columns: readonly ListColumn[];
  readonly phone: boolean;
}) {
  const meta = metaOf(row);
  const chips = columns.flatMap((column) =>
    column.kind === "status"
      ? [
          <span key={column.key} className="flex shrink-0">
            {statusOf(row, column, columns)}
          </span>,
        ]
      : [],
  );
  // On a phone the right edge has one job: next to a More button, the chip starts line 2 (kit 6).
  const chipsBelow = phone && row.more !== undefined;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="flex min-w-0 items-center gap-2">
        <Title row={row} />
        {/* On a phone the tag starts the third line instead (T8-F19). */}
        {phone ? null : <Tag row={row} />}
        {chipsBelow ? null : <span className="ml-auto flex shrink-0 gap-2 pl-1">{chips}</span>}
      </span>
      {/* Inline, so a second line runs on under the chip rather than beside it. */}
      <span className={`line-clamp-2 text-small ${meta.colour}`}>
        {chipsBelow ? <span className="mr-1.5 inline-flex align-middle">{chips}</span> : null}
        {meta.text}
      </span>
      <StackedFooter row={row} columns={columns} tagFirst={phone} />
    </div>
  );
}

export interface RowColumnsProps {
  readonly row: AnyListRow;
  readonly columns: readonly ListColumn[];
  readonly phone: boolean;
  /** The id an unavailable row's cell points `aria-describedby` at. */
  readonly reasonId: string;
  /** A checkbox cell comes first and holds the gap, so the cell has no left padding. */
  readonly afterCheck: boolean;
}

/** A columned row's main cell: the sentence screen readers hear, then the two layouts. */
export function RowColumns({ row, columns, phone, reasonId, afterCheck }: RowColumnsProps) {
  const padding = afterCheck ? "pr-4" : "px-4";
  const label = row.label ?? [row.title, metaOf(row).text].filter(Boolean).join(", ");
  return (
    <>
      <span className="sr-only">{label}</span>
      {/* Not drawn: what `aria-describedby` reads for an unavailable row. */}
      {row.unavailable === undefined ? null : (
        <span id={reasonId} hidden>
          {row.unavailable.reason}
        </span>
      )}
      {/* The container `@list-wide:` measures: this cell, so the columns fit beside the others. */}
      <div aria-hidden="true" className="@container">
        {phone ? null : (
          <div className={`hidden min-h-14 items-center gap-3 py-2 @list-wide:flex ${padding}`}>
            {columns.map((column) => (
              <WideCell key={columnKey(column)} row={row} column={column} columns={columns} />
            ))}
          </div>
        )}
        <div
          className={`flex min-h-14 items-center gap-3 py-3 ${phone ? "" : "@list-wide:hidden"} ${padding}`}
        >
          <Leading row={row} small={false} />
          <Stacked row={row} columns={columns} phone={phone} />
        </div>
      </div>
    </>
  );
}
