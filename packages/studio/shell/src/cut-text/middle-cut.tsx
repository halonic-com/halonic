import { Fragment, type ReactNode } from "react";

/** How much of a folder's end shows at most when its line is cut in the middle. */
const TAIL_LENGTH = 24;

/**
 * Where a folder's line is cut so at most its last {@link TAIL_LENGTH} characters stay: at the
 * first "/" or "\" at or after that point, so the end starts on a whole folder name. When the last
 * name alone is longer, the end starts at the separator before it, and without any separator the
 * line is cut at that point, mid-name.
 */
export function middleCutAt(text: string): number {
  const cut = Math.max(0, text.length - TAIL_LENGTH);
  if (cut === 0) {
    return 0;
  }
  const after = text.slice(cut).search(/[/\\]/);
  if (after >= 0) {
    return cut + after;
  }
  const before = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
  return before > 0 ? before : cut;
}

/**
 * `end` with a line break allowed before each "/" or "\" after its first character, so an end too
 * wide for its row wraps between folder names before it wraps inside one.
 */
function breakableAtSeparators(end: string): ReactNode {
  const separators = [...end.matchAll(/[/\\]/g)].map((match) => match.index);
  const starts = [0, ...separators.filter((index) => index > 0)];
  return starts.map((start, index) => (
    <Fragment key={start}>
      {start > 0 ? <wbr /> : null}
      {end.slice(start, starts[index + 1])}
    </Fragment>
  ));
}

/**
 * A folder on one caption line that, when too long, is cut in the middle so its end, which tells
 * folders apart, stays, such as `…\Documents\Acme sample`. The cut lands on a "/" or "\" when it
 * can. When the end alone is wider than its row, as at 400% zoom, it wraps onto more lines,
 * between folder names first, and never draws past the row (WCAG 1.4.10 Reflow).
 *
 * @example
 * <MiddleCut text="~/Documents/Acme Support" />
 */
export function MiddleCut({
  text,
  textClassName = "text-caption text-fg-subtle",
}: {
  readonly text: string;
  /** The line's type and colour, for a row whose folder line is set differently, such as More's. */
  readonly textClassName?: string;
}) {
  const at = middleCutAt(text);
  return (
    <span className={`flex min-w-0 ${textClassName}`}>
      <span className="truncate">{text.slice(0, at)}</span>
      <span className={endClasses}>{breakableAtSeparators(text.slice(at))}</span>
    </span>
  );
}

// The end keeps its whole width while it fits. When it doesn't, it stops 1.25em short of the row,
// so the start still shows its "…" and the end isn't read as a folder of its own, and wraps.
const endClasses = "shrink-0 max-w-[calc(100%-1.25em)] whitespace-pre-wrap wrap-break-word";
