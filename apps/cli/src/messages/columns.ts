import { type Part, type Phrase, visibleLength } from "./phrase.ts";

/** How many spaces stand between two columns, as in `halonic runs` (cli-output 3.4). */
export const columnGap = 3;

/**
 * Lines up rows of cells into columns, each as wide as its longest cell, with
 * {@link columnGap} spaces between them (cli-output 3.4, "Columns line up
 * with spaces"). A mark's stand-in can be wider than the mark (`ok` for ✓),
 * so each column is as wide as its longest cell in the stream's own marks:
 * the rows line up with and without UTF-8. The last column isn't padded, so
 * no line ends in spaces.
 *
 * @param rows - one list of cells per line, every row with the same number of cells
 * @returns one phrase per row
 *
 * @example
 * columns([
 *   [phrase`${markPart("done")} Done`, phrase`01jd8q`],
 *   [phrase`${markPart("needsYou")} Needs you`, phrase`01jd9a`],
 * ]);
 * // "✓ Done        01jd8q"
 * // "! Needs you   01jd9a"
 */
export function columns(rows: readonly (readonly Phrase[])[]): Phrase[] {
  return columnsAs(rows, rows);
}

/**
 * Lines up rows of cells into the columns `widthRows` make: each column as
 * wide as its longest cell in `widthRows`, which needn't be the rows
 * printed. A command that prints a line before it knows the lines after it,
 * such as `halonic run`, takes the widths from what could come, so no line
 * printed early needs widening later. A cell wider than its column still
 * gets {@link columnGap} spaces after it, so it pushes the rest of its row
 * on.
 *
 * @example
 * columnsAs([[phrase`✓ Read the email`, phrase`Writer`]], [[phrase`! Approve this reply?`, phrase`x`]]);
 * // "✓ Read the email        Writer"
 */
export function columnsAs(
  rows: readonly (readonly Phrase[])[],
  widthRows: readonly (readonly Phrase[])[],
): Phrase[] {
  const widths = columnWidths(widthRows);
  return rows.map((cells) =>
    cells.flatMap((cell, index): Part[] => {
      const width = widths[index];
      if (index === cells.length - 1) {
        return [...cell];
      }
      return [...cell, paddingAfter(cell, width)];
    }),
  );
}

/** How wide a column is in a stream with and without UTF-8 marks. */
export interface ColumnWidth {
  readonly unicode: number;
  readonly ascii: number;
}

/**
 * The spaces after `cell` up to the next column: what's left of `width`,
 * then {@link columnGap}. A cell that is wider than `width`, or a column
 * with no width, gets only the gap.
 */
export function paddingAfter(cell: Phrase, width: ColumnWidth | undefined): Part {
  const left = (columnWidth: number | undefined, unicode: boolean) =>
    Math.max(0, (columnWidth ?? 0) - visibleLength(cell, unicode)) + columnGap;
  return { padding: { unicode: left(width?.unicode, true), ascii: left(width?.ascii, false) } };
}

/** How wide each column of `rows` is: as wide as its longest cell. */
export function columnWidths(rows: readonly (readonly Phrase[])[]): ColumnWidth[] {
  const widths: ColumnWidth[] = [];
  for (const cells of rows) {
    cells.forEach((cell, index) => {
      const width = widths[index] ?? { unicode: 0, ascii: 0 };
      widths[index] = {
        unicode: Math.max(width.unicode, visibleLength(cell, true)),
        ascii: Math.max(width.ascii, visibleLength(cell, false)),
      };
    });
  }
  return widths;
}
