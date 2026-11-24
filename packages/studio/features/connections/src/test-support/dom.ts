import { act } from "react";

/** Gives jsdom the `<dialog>` methods the kit's Dialog calls. A test calls it from `beforeEach`. */
export function polyfillDialog(): void {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

/** Lets the fake's promises and React catch up, inside `act`. Uses the real `setTimeout`. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The open dialog, if any. */
export const dialog = (): HTMLDialogElement | null => document.querySelector("dialog");

/** A button's text as seen: without the busy label the kit keeps in the box, invisible. */
function shownText(element: Element): string {
  const copy = element.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll(".invisible")) hidden.remove();
  return copy.textContent?.trim() ?? "";
}

/** The button whose text or name is `label`, inside `within` (default the whole page). */
export function button(
  label: string,
  within: ParentNode | undefined = document,
): HTMLButtonElement | undefined {
  return [...(within?.querySelectorAll("button") ?? [])].find(
    (found) => shownText(found) === label || found.getAttribute("aria-label") === label,
  );
}

/** Clicks `element` and lets everything settle. It throws when there is nothing to press. */
export async function press(element: Element | undefined): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error("Nothing to press");
  act(() => element.click());
  await settle();
}

/** Types `value` into `input` the way React hears it. */
export function typeInto(input: Element | null, value: string): void {
  if (!(input instanceof HTMLInputElement)) throw new Error("No field to type into");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
