/**
 * A button's name as a screen reader hears it: its `aria-label`, or its text without the kit's
 * `invisible` copy, such as the busy label "Undoing…" a button keeps so its width doesn't change.
 */
export function nameOf(button: Element): string {
  const label = button.getAttribute("aria-label");
  if (label !== null) return label;
  const copy = button.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll(".invisible")) hidden.remove();
  return copy.textContent?.trim() ?? "";
}

/** The buttons in `root` that a screen reader names `name`, in page order. */
export function buttonsNamed(root: ParentNode, name: string): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")].filter((button) => nameOf(button) === name);
}
