import type { ReactNode } from "react";
import type { AnyListRow } from "./list-props.ts";

/*
 * The parts of a List row's main cell besides its title: the icon or avatar, and the line under
 * the title. Split out of list.tsx by concept.
 */

/** A line of text is cut with an ellipsis, or wraps when the row does. */
export function lineFit(row: AnyListRow): string {
  return row.wrap === true ? "wrap-break-word" : "truncate";
}

/**
 * The meta line holds an error's reason: an unavailable row's reason takes its place. The reason
 * wraps and is never cut, since it says what to fix (C348 A8).
 */
export function showsError(row: AnyListRow): boolean {
  return row.error !== undefined && row.unavailable === undefined;
}

/**
 * How the meta line fits: an error's reason wraps; any other line fits as the row's other lines,
 * or, with `wrapMeta`, on up to two lines and then cut, so a long line keeps its end. A `plain`
 * List's line stays on one line, so its row stays 80px (HAL-20018): its end is a `metaEnd` there.
 */
function metaFit(row: AnyListRow, plain: boolean): string {
  if (showsError(row)) {
    return "wrap-break-word";
  }
  if (row.wrap !== true && row.wrapMeta === true && !plain) {
    return "line-clamp-2 wrap-break-word";
  }
  return lineFit(row);
}

/** Where the row's icon or avatar goes, and how big it is. */
interface LeadingProps {
  readonly row: AnyListRow;
  /** A 32px `dense` row: a 16px icon. */
  readonly small: boolean;
  /** A `plain` List's row, a sidebar's: a 60px avatar (HAL-19735, `kit.plain-row-size`). */
  readonly sidebar?: boolean;
}

/**
 * The row's icon or avatar. `small` is a 32px `dense` row; a dense row 48px high, on a phone or
 * under a coarse pointer, keeps 20px. In a row that wraps it stays at the top, centred on the
 * title's first 20px line.
 */
export function Leading({ row, small, sidebar = false }: LeadingProps) {
  const dim = row.unavailable !== undefined;
  const wrap = row.wrap === true;
  if (row.avatar !== undefined) {
    // At the top, the 28px avatar reaches 4px above and below the title's line.
    const place = wrap ? "-my-1 self-start" : "";
    return (
      <span
        aria-hidden="true"
        className={`${sidebar ? "size-15" : `size-7 ${place}`} shrink-0 ${dim ? "opacity-45" : ""}`}
      >
        {row.avatar}
      </span>
    );
  }
  if (row.icon !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={`inline-grid ${small ? "size-icon-sm touch:size-icon-md" : "size-icon-md"} shrink-0 ${wrap ? "self-start" : ""} place-items-center *:size-full ${dim ? "text-fg-disabled text-forced-disabled" : "text-fg-muted"}`}
      >
        {row.icon}
      </span>
    );
  }
  return null;
}

/** The meta line is the row's description: why it's unavailable, or a setup step's hint. */
export function describesRow(row: AnyListRow): boolean {
  return row.unavailable !== undefined || row.metaDescribes === true;
}

/** The meta line's colour: `danger` for an error's reason, else muted, or full while unread. */
function metaColour(error: boolean, full: boolean): string {
  if (error) {
    return "text-danger";
  }
  return full ? "text-fg" : "text-fg-muted";
}

interface MetaLineProps {
  readonly row: AnyListRow;
  readonly text: ReactNode;
  readonly id: string;
  /**
   * On a phone next to a More button, the chip starts the last line (kit 6); an error's chip has a
   * line of its own above the reason instead, so the reason gets the full width (C348 A8).
   */
  readonly chip: ReactNode;
  /** Full colour, not muted: an unread row's line in a `plain` List. */
  readonly full?: boolean;
  /** A `plain` List's line, a sidebar's: 14px, not 13px (HAL-19735), and never wrapped (HAL-20018). */
  readonly plain?: boolean;
}

interface MetaTextProps {
  readonly text: ReactNode;
  readonly end: string | undefined;
  readonly id: string | undefined;
  /** The line's fit, size and colour. */
  readonly fit: string;
  readonly look: string;
}

/**
 * The meta line's text and its end. On one cut line only the text before the end is cut, so
 * "Support reply · run 891b5a · a pe… · Waiting 1 h" keeps its wait; a line that wraps or clamps
 * holds both as one run of text. `relative`, so the cut also clips the text's screen-reader-only
 * words (`sr-only` is absolute): otherwise they sit past the row's end and make the page scroll
 * sideways.
 */
function MetaText({ text, end, id, fit, look }: MetaTextProps) {
  if (end === undefined || fit !== "truncate") {
    return (
      <span id={id} className={`relative ${fit} ${look}`}>
        {text}
        {end}
      </span>
    );
  }
  return (
    <span id={id} className={`relative flex min-w-0 ${look}`}>
      <span className="relative min-w-0 truncate">{text}</span>
      <span data-part="meta-end" className="shrink-0 whitespace-pre">
        {end}
      </span>
    </span>
  );
}

/**
 * The line under the title: the meta text, an error's reason or why the row is unavailable. With
 * a chip, the chip comes first and only the text is cut; without text, the chip has the line alone.
 * An error's chip sits on its own line, above its reason.
 */
export function MetaLine({ row, text, id, chip, full = false, plain = false }: MetaLineProps) {
  if (text === undefined && chip === undefined) {
    return null;
  }
  // An unavailable row's reason stays at full strength, so it can be read (VRK 0.6).
  const colour = metaColour(showsError(row), full);
  const line =
    text === undefined ? null : (
      <MetaText
        text={text}
        // A reason takes the whole line's place, the row's `metaEnd` included.
        end={text === row.meta ? row.metaEnd : undefined}
        id={describesRow(row) ? id : undefined}
        fit={metaFit(row, plain)}
        look={`${plain ? "text-body" : "text-small"} ${colour}`}
      />
    );
  if (chip === undefined) {
    return line;
  }
  if (showsError(row)) {
    return (
      <span className="flex min-w-0 flex-col items-start gap-1">
        <span className="flex">{chip}</span>
        {line}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0">{chip}</span>
      {line === null ? null : <span className="flex min-w-0">{line}</span>}
    </span>
  );
}
