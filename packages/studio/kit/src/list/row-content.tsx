import type { ReactNode } from "react";
import { StatusChip } from "../status-chip/status-chip.tsx";
import type { ListRow } from "./list-props.ts";
import { Leading, MetaLine } from "./row-parts.tsx";

/*
 * The inside of a List row's main cell. Split out of list.tsx, which keeps the cells and their
 * classes, to keep it under the size limit.
 */

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

export interface RowContentProps {
  readonly row: ListRow;
  readonly phone: boolean;
  readonly dense: boolean;
  /** The id of the meta line, which an unavailable row's cell names with `aria-describedby`. */
  readonly reasonId: string;
  /** A checkbox cell comes first and holds the gap, so the cell has no left padding. */
  readonly afterCheck: boolean;
}

/** The main cell's inside: the icon or avatar, the title, the meta line and the trailing part. */
export function RowContent({ row, phone, dense, reasonId, afterCheck }: RowContentProps) {
  const meta = row.unavailable?.reason ?? row.error?.reason ?? row.meta;
  const trailing = trailingOf(row);
  // On a phone the right edge has one job: next to a More button, the chip starts the meta line.
  const trailingBelow = phone && row.more !== undefined;
  const showTrailingRight = !trailingBelow && trailing !== undefined;

  return (
    <div
      className={`flex items-center gap-3 ${afterCheck ? "pr-4" : "px-4"} ${heightClasses(phone, dense, meta !== undefined)}`}
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
