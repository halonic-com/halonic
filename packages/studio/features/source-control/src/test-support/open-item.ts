import { act } from "react";

/**
 * Opens the row named `name` in the Changes list, as Enter or a click does, and gives what opened:
 * the item's details with its changes. An item that is already open is left as it is.
 */
export function openItem(root: HTMLElement, name: string): HTMLElement {
  const panel = () => root.querySelector<HTMLElement>(`section[aria-label="${name}"]`);
  const open = panel();
  if (open !== null) return open;
  const cell = [...root.querySelectorAll<HTMLElement>('td[role="gridcell"]')].find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
  if (cell === undefined) throw new Error(`no row named ${name}`);
  act(() => cell.click());
  const opened = panel();
  if (opened === null) throw new Error(`${name} did not open`);
  return opened;
}
