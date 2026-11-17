import { act } from "react";

/**
 * Opens the row named `name` in the Changes list, as Enter or a click does, and gives what opened:
 * the item's What changed page. An item that is already open is left as it is.
 */
export function openItem(root: HTMLElement, name: string): HTMLElement {
  const panel = () => {
    const heading = [...root.querySelectorAll<HTMLElement>("h1")].find(
      (candidate) => candidate.textContent === name,
    );
    return heading?.closest<HTMLElement>("section") ?? null;
  };
  const open = panel();
  if (open !== null) return open;
  // Another item's page is open: go back to the list first, as a person would.
  const back = [...root.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.trim() === "Back to Changes",
  );
  if (back !== undefined) act(() => back.click());
  const cell = [...root.querySelectorAll<HTMLElement>('td[role="gridcell"]')].find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
  if (cell === undefined) throw new Error(`no row named ${name}`);
  act(() => cell.click());
  const opened = panel();
  if (opened === null) throw new Error(`${name} did not open`);
  return opened;
}
