/** Where focus goes: a row of the list, or the empty state's title when no row is left. */
export type FocusTarget = { readonly row: string } | "empty";

/** The ids of the rows on screen, in the order the user sees them (filters and search applied). */
export function visibleRowIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-row-id]")].flatMap((element) => {
    const id = element.getAttribute("data-row-id");
    return id === null ? [] : [id];
  });
}

/** Where focus goes when a row is removed: the next row, else the previous, else the empty state. */
export function targetAfterRemoving(rows: readonly string[], removed: string): FocusTarget {
  const index = rows.indexOf(removed);
  const neighbour = rows[index + 1] ?? (index > 0 ? rows[index - 1] : undefined);
  return neighbour === undefined ? "empty" : { row: neighbour };
}

/** Focuses a row's main cell, the one the grid keeps in the Tab order. False while the row isn't drawn. */
export function focusRow(container: HTMLElement, row: string): boolean {
  const element = [...container.querySelectorAll<HTMLElement>("[data-row-id]")].find(
    (each) => each.getAttribute("data-row-id") === row,
  );
  const cell = element?.querySelector<HTMLElement>('[role="gridcell"]');
  cell?.focus();
  return cell !== undefined && cell !== null;
}
