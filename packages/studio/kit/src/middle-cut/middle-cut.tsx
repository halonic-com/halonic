import { Fragment, type ReactNode } from "react";

/** How much of a path or folder's end shows at most when its line is cut in the middle. */
const TAIL_LENGTH = 24;

/**
 * Where a path or folder's line is cut so at most its last {@link TAIL_LENGTH} characters stay: at the
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
 * A path or folder on one caption line that, when too long, is cut in the middle so its end,
 * which tells folders apart, stays, such as `…\Documents\Acme sample`. The cut lands on a "/" or
 * "\" when it can. When the end alone is wider than its row, as at 400% zoom, it wraps onto more
 * lines, between folder names first, and never draws past the row (WCAG 1.4.10 Reflow). Its text
 * is the whole path, so a row can name it as its description with `aria-describedby` on its `id`.
 *
 * @example
 * <MiddleCut text="~/Documents/Acme Support" />
 */
export function MiddleCut({
  text,
  textClassName = "text-caption text-fg-subtle",
  id,
}: {
  readonly text: string;
  /** The line's type and colour, for a row whose folder line is set differently, such as More's. */
  readonly textClassName?: string;
  /** For the row the path or folder describes. */
  readonly id?: string | undefined;
}) {
  const at = middleCutAt(text);
  return (
    <span id={id} className={`flex min-w-0 ${textClassName}`}>
      {at === 0 ? null : <span className="truncate">{text.slice(0, at)}</span>}
      <span className={at === 0 ? wholeClasses : endClasses}>
        {breakableAtSeparators(text.slice(at))}
      </span>
    </span>
  );
}

// The end keeps its whole width while it fits. When it doesn't, it stops 2em short of the row and
// wraps, so the start keeps its first letter and a whole "…": never a letter and two dots, which
// read like the parent folder `..`, and the end isn't read as a folder of its own.
const endClasses = "shrink-0 max-w-[calc(100%-2em)] whitespace-pre-wrap wrap-break-word";

// A folder short enough to keep whole has no start: it wraps like an end, in the whole row.
const wholeClasses = "min-w-0 whitespace-pre-wrap wrap-break-word";
