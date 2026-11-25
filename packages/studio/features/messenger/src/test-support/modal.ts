/**
 * Gives jsdom the `<dialog>` and `popover` methods the kit's Dialog and Menu call, which it lacks.
 * They only show and hide; the browser's focus trap and light dismiss aren't faked. A test file
 * calls it from `beforeEach`.
 */
export function polyfillModals(): void {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  HTMLElement.prototype.showPopover ??= () => undefined;
  HTMLElement.prototype.hidePopover ??= () => undefined;
  HTMLElement.prototype.togglePopover ??= () => true;
}

/** The open dialog, if any. */
export function openDialog(): HTMLDialogElement | null {
  return document.querySelector("dialog[open]");
}

/** A button's text as seen: without the busy label the kit keeps in it, invisible. */
function shownText(element: Element): string {
  const copy = element.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll(".invisible")) hidden.remove();
  return copy.textContent?.trim() ?? "";
}

/** The button or menu item whose text or name is `label`, under `within` (the whole page by default). */
export function button(label: string, within: ParentNode = document): HTMLElement | undefined {
  const found = within.querySelectorAll<HTMLElement>('button, [role^="menuitem"]');
  return [...found].find(
    (each) => shownText(each) === label || each.getAttribute("aria-label") === label,
  );
}
