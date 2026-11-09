import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { isComposing } from "../keyboard/is-composing.ts";

/** One row of a grid, as the hook needs to know it. */
export interface GridRow {
  /** Stable across renders, never the index: focus follows the row, not its place. */
  readonly id: string;
  /**
   * One entry per column, `true` where the row has a focusable cell. An empty cell is `false` and
   * the arrows pass over it. A section heading row has no focusable cells, so arrows pass over it.
   */
  readonly cells: readonly boolean[];
}

/** The cell that is in the Tab order. */
export interface GridPosition {
  readonly row: string;
  readonly column: number;
}

/** What a focusable cell spreads onto its element. */
export interface GridCellProps {
  readonly tabIndex: 0 | -1;
  readonly ref: (element: HTMLElement | null) => void;
  readonly onFocus: () => void;
}

export interface GridNavigation {
  /** Spread onto the `role="grid"` element. */
  readonly gridProps: {
    readonly onKeyDown: (event: KeyboardEvent) => void;
    readonly onFocus: () => void;
    readonly onBlur: (event: { readonly relatedTarget: EventTarget | null }) => void;
  };
  /** Props for the focusable element of a cell. */
  cell(row: string, column: number): GridCellProps;
  /** The cell in the Tab order, or none when no row has a focusable cell. */
  readonly active: GridPosition | undefined;
}

interface Remembered extends GridPosition {
  /** Where the row was, so a removed row's place can be found again. */
  readonly index: number;
  /**
   * The column the user chose with ← → or a click. ↑ ↓ Home End go back to it, even after passing
   * a row that doesn't have it, and don't change it.
   */
  readonly chosen: number;
}

/** The keys the grid uses. From a cell they never scroll the page, even where focus can't move. */
const gridKeys = new Set(["ArrowDown", "ArrowUp", "Home", "End", "ArrowRight", "ArrowLeft"]);
const keepsColumn = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/**
 * Roving focus for a `role="grid"`: the grid is one Tab stop, ↑ ↓ move between rows in the same
 * column, ← → between a row's cells, Home and End go to the first and last row. Rows and cells
 * that can't take focus are passed over (component specs 23.3, L3). Only ← → change the column:
 * ↑ ↓ through a row without it land on the nearest cell to its left, and the next row that has it
 * gets it back.
 *
 * When the focused row goes away, focus goes to the row that took its place, else the one before
 * it (23 A2), never to `body`.
 *
 * @example
 * const grid = useGridNavigation(rows.map((row) => ({ id: row.id, cells: [true, row.more !== undefined] })));
 * <div role="grid" {...grid.gridProps}>…<div role="gridcell" {...grid.cell(row.id, 0)}>…</div></div>
 */
export function useGridNavigation(rows: readonly GridRow[]): GridNavigation {
  const [remembered, setRemembered] = useState<Remembered | undefined>(undefined);
  const elements = useRef(new Map<string, HTMLElement>());
  const focusInside = useRef(false);
  // Set while ↑ ↓ Home End move focus, so the cell's focus keeps the chosen column.
  const movingInColumn = useRef(false);
  const active = resolve(rows, remembered);

  /** With `keepColumn`, the cell's focus doesn't change the column the user chose. */
  const focusCell = (position: GridPosition, keepColumn: boolean) => {
    movingInColumn.current = keepColumn;
    elements.current.get(key(position.row, position.column))?.focus();
    movingInColumn.current = false;
  };

  // The focused row was removed: its element is gone and the browser put focus on `body`.
  const lost = remembered !== undefined && active !== undefined && active.row !== remembered.row;
  useLayoutEffect(() => {
    if (!lost || active === undefined || !focusInside.current) {
      return;
    }
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      focusCell(active, true);
    }
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.metaKey || isComposing(event) || active === undefined) {
      return;
    }
    // Only from a cell itself: a field inside a cell keeps its own arrow keys.
    if (event.target !== elements.current.get(key(active.row, active.column))) {
      return;
    }
    if (!gridKeys.has(event.key)) {
      return;
    }
    // At the ends too, so holding ↓ on the last row doesn't scroll the page.
    event.preventDefault();
    const next = move(rows, active, remembered?.chosen ?? active.column, event.key);
    if (next === undefined) {
      return;
    }
    focusCell(next, keepsColumn.has(event.key));
  };

  return {
    gridProps: {
      onKeyDown,
      onFocus: () => {
        focusInside.current = true;
      },
      onBlur: (event) => {
        const to = event.relatedTarget;
        const staysInside = [...elements.current.values()].some(
          (element) => to instanceof Node && element.contains(to),
        );
        focusInside.current = staysInside;
      },
    },
    cell: (row, column) => ({
      tabIndex: active?.row === row && active.column === column ? 0 : -1,
      ref: (element) => {
        if (element === null) {
          elements.current.delete(key(row, column));
        } else {
          elements.current.set(key(row, column), element);
        }
      },
      onFocus: () => {
        const index = rows.findIndex((candidate) => candidate.id === row);
        const keep = movingInColumn.current;
        setRemembered((before) => ({
          row,
          column,
          index,
          chosen: keep && before !== undefined ? before.chosen : column,
        }));
      },
    }),
    active,
  };
}

function key(row: string, column: number): string {
  return `${column}:${row}`;
}

function focusable(row: GridRow): boolean {
  return row.cells.some(Boolean);
}

/** The cell in the row nearest to `column`: that one, else the nearest to its left, else right. */
function nearestCell(row: GridRow, column: number): number {
  for (let at = Math.min(column, row.cells.length - 1); at >= 0; at -= 1) {
    if (row.cells[at] === true) {
      return at;
    }
  }
  return row.cells.indexOf(true);
}

/**
 * The cell in the Tab order now. The remembered row if it's still there; if it was removed, the
 * row now in its place or the nearest one before it; at the start, the first row's first cell.
 */
function resolve(
  rows: readonly GridRow[],
  remembered: Remembered | undefined,
): GridPosition | undefined {
  const column = remembered?.column ?? 0;
  const kept = rows.find((row) => row.id === remembered?.row);
  if (kept !== undefined && focusable(kept)) {
    return { row: kept.id, column: nearestCell(kept, column) };
  }
  const from = Math.min(remembered?.index ?? 0, rows.length - 1);
  const after = rows.slice(from).find(focusable);
  const before = rows.slice(0, from).findLast(focusable);
  const row = after ?? before;
  const chosen = remembered?.chosen ?? column;
  return row === undefined ? undefined : { row: row.id, column: nearestCell(row, chosen) };
}

/**
 * Where a key moves focus to, or nothing when the key isn't a grid key or there's nowhere to go.
 * ↑ ↓ Home End aim for the `chosen` column.
 */
function move(
  rows: readonly GridRow[],
  active: GridPosition,
  chosen: number,
  pressed: string,
): GridPosition | undefined {
  const at = rows.findIndex((row) => row.id === active.row);
  const row = rows[at];
  if (row === undefined) {
    return undefined;
  }
  const inRow = (target: GridRow | undefined) =>
    target === undefined ? undefined : { row: target.id, column: nearestCell(target, chosen) };

  switch (pressed) {
    case "ArrowDown":
      return inRow(rows.slice(at + 1).find(focusable));
    case "ArrowUp":
      return inRow(rows.slice(0, at).findLast(focusable));
    case "Home":
      return inRow(rows.find(focusable));
    case "End":
      return inRow(rows.findLast(focusable));
    case "ArrowRight": {
      const column = row.cells.findIndex((cell, index) => cell && index > active.column);
      return column === -1 ? undefined : { row: row.id, column };
    }
    case "ArrowLeft": {
      const column = row.cells.findLastIndex((cell, index) => cell && index < active.column);
      return column === -1 ? undefined : { row: row.id, column };
    }
    default:
      return undefined;
  }
}
