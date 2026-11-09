/**
 * A fake modal for component tests. jsdom has `<dialog>` but no `showModal()`, so a test gets one
 * that sets `open`, and a `close()` that clears it and fires `close` a moment later, as a browser
 * does (a queued task there, a microtask here). It
 * doesn't make the page inert: that's the browser's part, not the kit's.
 */
const prototype = HTMLDialogElement.prototype;
const original = {
  showModal: Object.getOwnPropertyDescriptor(prototype, "showModal"),
  close: Object.getOwnPropertyDescriptor(prototype, "close"),
};

/** Installs the fake. A test file calls it from `beforeEach`. */
export function fakeModal(): void {
  Object.defineProperty(prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.hasAttribute("open")) {
        return;
      }
      this.removeAttribute("open");
      queueMicrotask(() => this.dispatchEvent(new Event("close")));
    },
  });
}

/** Takes the fake away. A test file calls it from `afterEach`. */
export function restoreModal(): void {
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(prototype, name);
    } else {
      Object.defineProperty(prototype, name, descriptor);
    }
  }
}
