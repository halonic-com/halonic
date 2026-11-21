/**
 * `inert` for tests, which jsdom ignores: `focus()` on an element under `[inert]` does nothing, as
 * in a browser. Without it a test can't see focus refused by a page that is still inert, such as
 * the page under the Places drawer.
 */
export function installFakeInert(): () => void {
  const prototype = HTMLElement.prototype;
  const focus = Object.getOwnPropertyDescriptor(prototype, "focus");
  const original = prototype.focus;
  Object.defineProperty(prototype, "focus", {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options?: FocusOptions) {
      if (this.closest("[inert]") === null) {
        original.call(this, options);
      }
    },
  });
  return () => {
    if (focus !== undefined) {
      Object.defineProperty(prototype, "focus", focus);
    }
  };
}
