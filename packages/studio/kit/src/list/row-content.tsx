import type { ReactNode } from "react";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import type { AnyListRow, ListColumn } from "./list-props.ts";
import { RowColumns } from "./row-columns.tsx";
import { Leading, lineFit, MetaLine } from "./row-parts.tsx";

/*
 * The inside of a List row's main cell. Split out of list.tsx, which keeps the cells and their
 * classes, to keep it under the size limit.
 */

/**
 * The row's height, from the presentation, the density and whether it has a meta line. A row that
 * wraps, or only wraps its title, grows past it, so on a desktop it gets padding too, keeping its
 * text off the lines.
 */
function heightClasses(phone: boolean, dense: boolean, hasMeta: boolean, wrap: boolean): string {
  if (phone) {
    return dense ? "min-h-touch py-2" : "min-h-14 py-3";
  }
  const padding = wrap ? "py-2" : "";
  if (dense) {
    return `min-h-control-md touch:min-h-touch ${padding}`;
  }
  return `${hasMeta ? "min-h-14" : "min-h-control-lg touch:min-h-touch"} ${padding}`;
}

/**
 * The row's chip or value, or an error's `danger` chip in its place. The error chip has its dot,
 * so the state doesn't rest on colour alone.
 */
function trailingOf(row: AnyListRow): ReactNode {
  return row.error === undefined ? (
    row.trailing
  ) : (
    <StatusChip tone="danger" dot>
      {row.error.chip}
    </StatusChip>
  );
}

/**
 * How the title fits: cut with an ellipsis, or wrapped when the row wraps or asks for `wrapTitle`,
 * which wraps the title alone and keeps the meta line cut.
 */
function titleFit(row: AnyListRow): string {
  return row.wrapTitle === true ? "wrap-break-word" : lineFit(row);
}

/** The title's colour: `fg`, `fg-muted` for a muted row, `fg-disabled` for an unavailable one. */
function titleColour(row: AnyListRow): string {
  if (row.unavailable !== undefined) {
    return "text-fg-disabled text-forced-disabled";
  }
  return row.muted === true ? "text-fg-muted" : "text-fg";
}

export interface RowContentProps {
  readonly row: AnyListRow;
  readonly phone: boolean;
  readonly dense: boolean;
  /** The row opens a page of its own: it ends in a chevron (a phone List's `chevrons`). */
  readonly chevron: boolean;
  /**
   * The id of the meta line, which the cell names with `aria-describedby` when the row is
   * unavailable or its meta line describes it.
   */
  readonly reasonId: string;
  /** A checkbox cell comes first and holds the gap, so the cell has no left padding. */
  readonly afterCheck: boolean;
  /** The List's columns: the row lays its cells out in them. */
  readonly columns: readonly ListColumn[] | undefined;
}

/** The main cell's inside: the icon or avatar, the title, the meta line and the trailing part. */
export function RowContent({
  row,
  phone,
  dense,
  chevron,
  reasonId,
  afterCheck,
  columns,
}: RowContentProps) {
  if (columns !== undefined) {
    return (
      <RowColumns
        row={row}
        columns={columns}
        phone={phone}
        reasonId={reasonId}
        afterCheck={afterCheck}
      />
    );
  }
  const meta = row.unavailable?.reason ?? row.error?.reason ?? row.meta;
  const trailing = trailingOf(row);
  // On a phone the right edge has one job: next to a More button or a chevron, the chip starts
  // the meta line.
  const trailingBelow = phone && (row.more !== undefined || chevron);
  const showTrailingRight = !trailingBelow && trailing !== undefined;
  const wrap = row.wrap === true || row.wrapTitle === true;

  return (
    <div
      className={`flex items-center gap-3 ${afterCheck ? "pr-4" : "px-4"} ${heightClasses(phone, dense, meta !== undefined, wrap)}`}
    >
      <Leading row={row} small={dense && !phone} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`${titleFit(row)} text-body-strong ${titleColour(row)}`}>{row.title}</span>
        <MetaLine row={row} text={meta} id={reasonId} chip={trailingBelow ? trailing : undefined} />
      </div>
      {showTrailingRight ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
      {chevron ? (
        <span data-part="row-chevron" className="flex size-icon-md shrink-0 text-fg-subtle">
          <ChevronRightIcon />
        </span>
      ) : null}
    </div>
  );
}
