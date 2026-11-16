/** Where focus goes when an editor closes: stay on its cell, or move to a neighbour. */
export type CellMove = "stay" | "down" | "next" | "previous";

/** Rows to move for Page Up and Page Down. */
const pageRows = 10;

/** The grid's rows, the new row last. */
export function gridRows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("tbody > tr")];
}

/** A row's cells that take focus: its fields, and the ⋮ button after them when it has one. */
export function rowCells(row: HTMLElement, withMenu = true): HTMLElement[] {
  return [...row.children].flatMap((cell) => {
    if (cell.hasAttribute("tabindex")) return [cell as HTMLElement];
    // The trigger comes first; the open menu's own items sit after it in the same cell.
    const trigger = withMenu ? cell.querySelector<HTMLElement>("button[tabindex]") : null;
    return trigger === null ? [] : [trigger];
  });
}

/** The cell of the row at `index`, at `column` or the last one the row has. */
function cellAt(
  rows: readonly HTMLElement[],
  index: number,
  column: number,
): HTMLElement | undefined {
  const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];
  const cells = row === undefined ? [] : rowCells(row);
  return cells[Math.min(column, cells.length - 1)];
}

/** The cell that `move` goes to from `from`, or `undefined` where there is none. */
export function neighbour(
  root: HTMLElement,
  from: HTMLElement,
  move: Exclude<CellMove, "stay">,
): HTMLElement | undefined {
  const rows = gridRows(root);
  const rowIndex = rows.findIndex((row) => row.contains(from));
  const row = rows[rowIndex];
  if (row === undefined) return undefined;
  if (move === "down") {
    const column = rowCells(row).indexOf(from);
    return rowIndex === rows.length - 1 ? undefined : cellAt(rows, rowIndex + 1, column);
  }
  // Tab walks the fields only, row after row; the ⋮ buttons are for the arrow keys.
  const cells = rowCells(row, false);
  const at = cells.indexOf(from) + (move === "next" ? 1 : -1);
  const inRow = cells[at];
  if (inRow !== undefined) return inRow;
  const other = rows[rowIndex + (move === "next" ? 1 : -1)];
  if (other === undefined) return undefined;
  return rowCells(other, false).at(move === "next" ? 0 : -1);
}

/** The cell Home, End, Ctrl Home, Ctrl End, Page Up or Page Down goes to from `from`. */
export function keyTarget(
  root: HTMLElement,
  from: HTMLElement,
  key: string,
  ctrl: boolean,
): HTMLElement | undefined {
  const rows = gridRows(root);
  const rowIndex = rows.findIndex((row) => row.contains(from));
  const row = rows[rowIndex];
  if (row === undefined) return undefined;
  const cells = rowCells(row);
  const column = cells.indexOf(from);
  if (column < 0) return undefined;
  switch (key) {
    case "Home":
      return ctrl ? cellAt(rows, 0, 0) : cells[0];
    case "End":
      return ctrl ? cellAt(rows, rows.length - 1, Number.MAX_SAFE_INTEGER) : cells.at(-1);
    case "PageUp":
      return cellAt(rows, rowIndex - pageRows, column);
    case "PageDown":
      return cellAt(rows, rowIndex + pageRows, column);
    default:
      return undefined;
  }
}

/** Whether `element` is one of the grid's own cells, not something inside an editor or an open menu. */
export function isGridCell(root: HTMLElement, element: EventTarget | null): element is HTMLElement {
  return (
    element instanceof HTMLElement && gridRows(root).some((row) => rowCells(row).includes(element))
  );
}
