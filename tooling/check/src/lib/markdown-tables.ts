/**
 * Markdown tables without padding. A table written as `| a | b |` changes
 * one line when a row is added, so two pull requests that each add a row
 * merge cleanly. A table padded to equal column widths changes every line
 * as soon as one cell gets longer, and any two such pull requests conflict.
 */

const fence = /^\s*(```|~~~)/;
const delimiterCell = /^:?-+:?$/;

/** The cells of a table row, split on pipes that aren't escaped, without the outer pipes. */
function cellsOf(line: string): string[] {
  const inner = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index] as string;
    if (character === "\\" && inner[index + 1] === "|") {
      current += "\\|";
      index++;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

const isRow = (line: string): boolean => line.trimStart().startsWith("|");

/** Whether a line is a delimiter row such as `| --- | :---: |`. */
function isDelimiter(line: string | undefined): boolean {
  return (
    line !== undefined && isRow(line) && cellsOf(line).every((cell) => delimiterCell.test(cell))
  );
}

/** A delimiter cell at its shortest, keeping the alignment colons. */
function shortDelimiter(cell: string): string {
  const left = cell.startsWith(":") ? ":" : "";
  const right = cell.endsWith(":") ? ":" : "";
  return `${left}---${right}`;
}

function compactRow(line: string, delimiter: boolean): string {
  const cells = cellsOf(line).map((cell) => (delimiter ? shortDelimiter(cell) : cell));
  const indent = line.match(/^\s*/)?.[0] ?? "";
  return `${indent}| ${cells.join(" | ")} |`;
}

/**
 * Rewrites every table outside a code fence with one space inside each pipe,
 * and `---` for each delimiter cell (alignment colons stay). A text without a
 * padded table comes back unchanged.
 *
 * @example
 * compactTables("| a   | b |\n| --- | - |\n| xx  | y |");
 * // "| a | b |\n| --- | --- |\n| xx | y |"
 */
export function compactTables(text: string): string {
  const lines = text.split("\n");
  let inFence = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    if (fence.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !isRow(line) || !isDelimiter(lines[index + 1])) {
      continue;
    }
    let end = index + 2;
    while (end < lines.length && isRow(lines[end] as string)) {
      end++;
    }
    for (let row = index; row < end; row++) {
      const original = lines[row] as string;
      lines[row] = original.endsWith("\r")
        ? `${compactRow(original, row === index + 1)}\r`
        : compactRow(original, row === index + 1);
    }
    index = end - 1;
  }
  return lines.join("\n");
}

/** The 1-based line of the first row `compactTables` would change, or undefined when none. */
export function firstPaddedLine(text: string): number | undefined {
  const compact = compactTables(text).split("\n");
  const index = text.split("\n").findIndex((line, at) => line !== compact[at]);
  return index === -1 ? undefined : index + 1;
}
