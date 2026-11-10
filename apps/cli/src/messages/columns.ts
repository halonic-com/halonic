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
  const widths = columnWidths(rows);
  return rows.map((cells) =>
    cells.flatMap((cell, index): Part[] => {
      const width = widths[index];
      if (index === cells.length - 1 || width === undefined) {
        return [...cell];
      }
      const padding = {
        unicode: width.unicode - visibleLength(cell, true) + columnGap,
        ascii: width.ascii - visibleLength(cell, false) + columnGap,
      };
      return [...cell, { padding }];
    }),
  );
}

interface ColumnWidth {
  readonly unicode: number;
  readonly ascii: number;
}

function columnWidths(rows: readonly (readonly Phrase[])[]): ColumnWidth[] {
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
