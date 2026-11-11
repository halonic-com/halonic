/**
 * jsdom has `<dialog>` but no `showModal()`; opening it is all the Dialog tests need. Returns a
 * function that puts the original methods back, so the fake doesn't leak into other files.
 */
export function fakeShowModal(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const original = {
    showModal: Object.getOwnPropertyDescriptor(prototype, "showModal"),
    close: Object.getOwnPropertyDescriptor(prototype, "close"),
  };
  Object.defineProperty(prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  return () => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(prototype, name);
      } else {
        Object.defineProperty(prototype, name, descriptor);
      }
    }
  };
}
