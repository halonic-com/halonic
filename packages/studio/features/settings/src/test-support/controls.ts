/** Drives the kit's native controls in jsdom, as a person would, inside `act`. */
import { act } from "react";

export function control<Element extends HTMLElement>(view: HTMLElement, selector: string): Element {
  const found = view.querySelector<Element>(selector);
  if (found === null) {
    throw new Error(`Nothing matches ${selector}`);
  }
  return found;
}

/**
 * Sets a native control's value as the browser does, past React's own record of it, so React sees
 * the change.
 */
export function setNativeValue(element: HTMLSelectElement | HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(element) as object;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
}

/** Picks `value` in a native select, or moves a range input there and lets go. */
export async function change(element: HTMLSelectElement | HTMLInputElement, value: string) {
  await act(async () => {
    setNativeValue(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export async function click(element: HTMLElement) {
  await act(async () => element.click());
}

/** Types `text` into an input, then leaves it, as Tab away does. */
export async function typeAndLeave(input: HTMLInputElement, text: string) {
  await act(async () => {
    input.focus();
    setNativeValue(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
  });
}
