import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

/** Unmounts what {@link show} drew; call it in `afterEach`. */
export function unmount(): void {
  act(() => root?.unmount());
  element?.remove();
}

/** Draws `node` in the document and waits for what it reads. */
export async function show(node: React.ReactNode): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root?.render(node));
  return element;
}

/** Draws `node` again in what {@link show} drew, keeping the state of the components that stay. */
export async function redraw(node: React.ReactNode): Promise<void> {
  await act(async () => root?.render(node));
}

/** The button with this text, or `undefined`. */
export function buttonNamed(page: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith(text),
  );
}

/** Types into an input the way a person does, so React sees the change. */
export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Types into a multi-line box the way a person does, so React sees the change. */
export async function typeIntoArea(area: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** jsdom has `<dialog>` but no `showModal()`; opening it is all the dialog tests need. */
export function openDialogsInJsdom(): void {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  Element.prototype.scrollIntoView = () => {};
}

/** jsdom has no popover API: a menu opens by setting `data-popover-open`. Returns the way to undo it. */
export function installFakePopover(): () => void {
  const names = ["showPopover", "hidePopover"] as const;
  for (const name of names) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      value(this: HTMLElement) {
        const open = name === "showPopover";
        if (this.hasAttribute("data-popover-open") === open) return;
        this.dispatchEvent(
          Object.assign(new Event("beforetoggle"), { newState: open ? "open" : "closed" }),
        );
        this.toggleAttribute("data-popover-open", open);
        // jsdom hides every `[popover]` and can't focus inside it.
        this.style.display = open ? "block" : "";
      },
    });
  }
  return () => {
    for (const name of names) Reflect.deleteProperty(HTMLElement.prototype, name);
  };
}
