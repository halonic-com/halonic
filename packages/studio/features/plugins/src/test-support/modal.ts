/**
 * A fake modal for the plugin dialog tests, as the kit's own tests use: jsdom has `<dialog>` but
 * no `showModal()`. `showModal()` sets `open`; `close()` clears it and fires `close` a moment
 * later, as a browser does. The Dialog also scrolls its alert slot into view, which jsdom lacks.
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
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      queueMicrotask(() => this.dispatchEvent(new Event("close")));
    },
  });
  Element.prototype.scrollIntoView = () => {};
}

/** Takes the fake away. A test file calls it from `afterEach`, after `unmountAll`. */
export function restoreModal(): void {
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor === undefined) Reflect.deleteProperty(prototype, name);
    else Object.defineProperty(prototype, name, descriptor);
  }
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
}
