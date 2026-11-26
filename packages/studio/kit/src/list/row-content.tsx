import type { ReactNode } from "react";
import type { GridCellProps } from "../grid-navigation/use-grid-navigation.ts";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { lineActionClasses } from "../line-frame/line-frame.tsx";
import { UnreadMark } from "../plain-list/unread-mark.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import type { AnyListRow, ListColumn, ListRowAction } from "./list-props.ts";
import { RowColumns } from "./row-columns.tsx";
import { Leading, lineFit, MetaLine, showsError } from "./row-parts.tsx";

/*
 * The inside of a List row's main cell. Split out of list.tsx, which keeps the cells and their
 * classes, to keep it under the size limit.
 */

/**
 * The row's height, from the presentation, the density and whether it has a meta line. A row that
 * wraps, or only wraps its title or meta line, grows past it, so on a desktop it gets padding too, keeping its
 * text off the lines. A `plain` row has its own height, `plainHeight`.
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
 * A `plain` row's height: a sidebar's row, exactly 80px with 10px above and below, on a phone too
 * (HAL-19735, `kit.plain-row-size`). Its title and meta line fit in the 60px between
 * (`kit.plain-row-fit`), so the height is fixed rather than a minimum: the board's correction on
 * HAL-10 (HAL-20019). A row whose text isn't cut (`wrap`, an error's reason), a part under the
 * meta line or text buttons may need more room, so such a row grows: in a fixed row they would
 * spill over the next one.
 */
function plainHeight(row: AnyListRow): string {
  const grows =
    row.wrap === true ||
    showsError(row) ||
    row.under !== undefined ||
    (row.actions !== undefined && row.actions.length > 0);
  return grows ? "min-h-20 py-2.5" : "h-20 py-2.5";
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
 * which wraps the title alone and keeps the meta line cut. A `plain` List's row is a sidebar's,
 * exactly 80px: its `wrapTitle` takes at most two 20px lines, then is cut (HAL-20018).
 */
function titleFit(row: AnyListRow, plain: boolean): string {
  if (row.wrapTitle !== true) {
    return lineFit(row);
  }
  return plain && row.wrap !== true ? "line-clamp-2 wrap-break-word leading-5" : "wrap-break-word";
}

/** The title's colour: `fg`, `fg-muted` for a muted row, `fg-disabled` for an unavailable one. */
function titleColour(row: AnyListRow): string {
  if (row.unavailable !== undefined) {
    return "text-fg-disabled text-forced-disabled";
  }
  return row.muted === true ? "text-fg-muted" : "text-fg";
}

/**
 * The title's style: medium 14px, or in a `plain` List regular 15px (HAL-19735), and semibold while
 * unread (600, since only 600 reads as unread; Sofia, HAL-19512).
 */
function titleWeight(row: AnyListRow, plain: boolean): string {
  if (!plain) {
    return "text-body-strong";
  }
  return row.unread === undefined ? "text-reading" : "text-reading font-semibold";
}

/** The title, with its `titleEnd` at the line's end when the row has one. */
function TitleLine({ row, plain }: { readonly row: AnyListRow; readonly plain: boolean }) {
  const title = (
    <span className={`${titleFit(row, plain)} ${titleWeight(row, plain)} ${titleColour(row)}`}>
      {row.title}
    </span>
  );
  if (row.titleEnd === undefined) {
    return title;
  }
  return (
    <span className="flex min-w-0 items-baseline justify-between gap-3">
      {title}
      <span data-part="title-end" className="shrink-0 text-small text-fg-muted tabular-nums">
        {row.titleEnd}
      </span>
    </span>
  );
}

export interface RowContentProps {
  readonly row: AnyListRow;
  readonly phone: boolean;
  readonly dense: boolean;
  /** The List's `plain` look: the title's weight and the unread mark follow the row's `unread`. */
  readonly plain: boolean;
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
  /** The grid's props for the row's action at `index`, a cell of its own. */
  readonly actionCell: (index: number) => GridCellProps;
}

/**
 * The row's text buttons, under its text, wrapping onto a second line when they don't fit. They
 * sit inside the main cell, so a click on one stops there and doesn't open the row too.
 */
function RowActions({
  actions,
  actionCell,
}: {
  readonly actions: readonly ListRowAction[];
  readonly actionCell: (index: number) => GridCellProps;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {actions.map((action, index) => (
        <button
          key={action.label}
          type="button"
          className={lineActionClasses}
          {...actionCell(index)}
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
          }}
          onAuxClick={(event) => event.stopPropagation()}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/**
 * In a `plain` List, an unread row's meta line with the unread mark at its end, under the title
 * line's end as `PlainRow`'s; any other row's meta line as it is. A row with a trailing part has
 * the mark under that part instead (`EndColumn`).
 */
function UnreadLine({
  row,
  plain,
  markBelowTrailing,
  children,
}: {
  readonly row: AnyListRow;
  readonly plain: boolean;
  readonly markBelowTrailing: boolean;
  readonly children: ReactNode;
}) {
  if (!plain || row.unread === undefined || markBelowTrailing) {
    return children;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="flex min-w-0 flex-1 flex-col">{children}</span>
      <UnreadMark unread={row.unread} />
    </span>
  );
}

/**
 * The trailing part, and in a `plain` List an unread row's mark under it at the meta line's end,
 * so the marks line up in one column, under the chips and where a time would be (sketch D on
 * HAL-19192).
 */
function EndColumn({ trailing, row, plain }: { readonly trailing: ReactNode } & PlainParts) {
  if (!plain || row.unread === undefined) {
    return <span className="flex shrink-0 items-center">{trailing}</span>;
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1.5">
      {trailing}
      <UnreadMark unread={row.unread} />
    </span>
  );
}

/** A row and whether its List is `plain`. */
interface PlainParts {
  readonly row: AnyListRow;
  readonly plain: boolean;
}

/**
 * The row's side padding: 16px in a box, 12px in a `plain` List, as `PlainRow`'s, so the Inbox's
 * avatars and titles line up with the Messenger's (HAL-19916). After a checkbox only the right side.
 */
function inset(plain: boolean, afterCheck: boolean): string {
  if (plain) {
    return afterCheck ? "pr-3" : "px-3";
  }
  return afterCheck ? "pr-4" : "px-4";
}

/** What the main cell's box depends on. */
interface BoxOptions extends PlainParts {
  readonly phone: boolean;
  readonly dense: boolean;
  readonly afterCheck: boolean;
  readonly hasMeta: boolean;
}

/** The main cell's box: its padding and height. */
function boxClasses({ row, plain, phone, dense, afterCheck, hasMeta }: BoxOptions): string {
  // A part under the meta line grows the row past its height, as wrapping does, so it gets padding too.
  const wrap =
    row.wrap === true || row.wrapTitle === true || row.wrapMeta === true || row.under !== undefined;
  const height = plain ? plainHeight(row) : heightClasses(phone, dense, hasMeta, wrap);
  return `flex items-center gap-3 ${inset(plain, afterCheck)} ${height}`;
}

/**
 * The main cell's inside: the icon or avatar, the title, the meta line, what goes under it, the
 * actions and the trailing part.
 */
export function RowContent({
  row,
  phone,
  dense,
  plain,
  chevron,
  reasonId,
  afterCheck,
  columns,
  actionCell,
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
  return (
    <div
      className={boxClasses({ row, plain, phone, dense, afterCheck, hasMeta: meta !== undefined })}
    >
      <Leading row={row} small={dense && !phone} sidebar={plain} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleLine row={row} plain={plain} />
        <UnreadLine row={row} plain={plain} markBelowTrailing={showTrailingRight}>
          <MetaLine
            row={row}
            text={meta}
            id={reasonId}
            chip={trailingBelow ? trailing : undefined}
            full={plain && row.unread !== undefined}
            plain={plain}
          />
        </UnreadLine>
        {row.under}
        {row.actions === undefined || row.actions.length === 0 ? null : (
          <RowActions actions={row.actions} actionCell={actionCell} />
        )}
      </div>
      {showTrailingRight ? <EndColumn trailing={trailing} row={row} plain={plain} /> : null}
      {chevron ? (
        <span data-part="row-chevron" className="flex size-icon-md shrink-0 text-fg-subtle">
          <ChevronRightIcon />
        </span>
      ) : null}
    </div>
  );
}
