/**
 * Dialogs and helpers for the Dialog's tests. jsdom has no `showModal()` and no
 * `scrollIntoView()`, so `fakeDialogPage` installs both and `restoreDialogPage` takes them away.
 */
import { act, type ReactNode } from "react";
import { Dialog } from "../dialog/dialog.tsx";
import type { DialogProps } from "../dialog/dialog-props.ts";
import { fakeModal, restoreModal } from "./modal.ts";

/** Every `scrollIntoView()` call's options, in order: the alert slot scrolls itself. */
export const scrolledIntoView: (boolean | ScrollIntoViewOptions | undefined)[] = [];

/** A test file calls it from `beforeEach`. */
export function fakeDialogPage(): void {
  fakeModal();
  Element.prototype.scrollIntoView = (options) => {
    scrolledIntoView.push(options);
  };
}

/** A test file calls it from `afterEach`, after `unmountAll`. */
export function restoreDialogPage(): void {
  restoreModal();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  scrolledIntoView.length = 0;
}

/** The confirming button of the delete confirmation the tests use. */
export const remove = { label: "Delete agent", variant: "danger", busyLabel: "Deleting…" } as const;

/** A confirmation: "Delete agent?". */
export function deleteDialog(overrides: Partial<DialogProps> = {}): ReactNode {
  return (
    <Dialog
      title="Delete agent?"
      confirm={remove}
      onConfirm={() => undefined}
      onCancel={() => undefined}
      {...overrides}
    >
      Sorter and its history are deleted from this workspace.
    </Dialog>
  );
}

/** A form: "New agent", with one field. */
export function newAgentDialog(overrides: Partial<DialogProps> = {}): ReactNode {
  return (
    <Dialog
      title="New agent"
      form
      confirm={{ label: "Create agent" }}
      onConfirm={() => undefined}
      onCancel={() => undefined}
      {...overrides}
    >
      <label>
        Name <input name="name" />
      </label>
    </Dialog>
  );
}

/** The `<dialog>` a test rendered. */
export function dialogOf(container: HTMLElement): HTMLDialogElement {
  return container.querySelector("dialog") as HTMLDialogElement;
}

/** A button's name as a screen reader hears it: the busy label's hidden copy doesn't count. */
export function nameOf(button: Element): string {
  const label = button.getAttribute("aria-label");
  if (label !== null) {
    return label;
  }
  const copy = button.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll(".invisible")) {
    hidden.remove();
  }
  return copy.textContent ?? "";
}

/** The button with that name, or an error that says which name was missing. */
export function buttonNamed(root: ParentNode, name: string): HTMLButtonElement {
  const button = [...root.querySelectorAll("button")].find(
    (candidate) => nameOf(candidate) === name,
  );
  if (button === undefined) {
    throw new Error(`No button named ${name}`);
  }
  return button;
}

/** The footer's buttons by name, in DOM order. */
export function footerNames(container: HTMLElement): string[] {
  return [...dialogOf(container).querySelectorAll("footer button")].map(nameOf);
}

/** Dispatches `event` inside `act` and gives it back, to check `defaultPrevented`. */
export function fire(element: Element, event: Event): Event {
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}
