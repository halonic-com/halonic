/**
 * A `popover` for tests, which jsdom lacks: `showPopover()` and `hidePopover()` set
 * `data-popover-open` and show the element, and fire `beforetoggle` at once, as a browser does.
 * Light dismiss is the browser's part: a test calls `hidePopover()` to stand in for an outside
 * click. The kit has the same fake for its own tests.
 */
const names = ["showPopover", "hidePopover"] as const;

function setOpen(element: HTMLElement, open: boolean): void {
  if (element.hasAttribute("data-popover-open") === open) {
    return;
  }
  const newState = open ? "open" : "closed";
  element.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState }));
  element.toggleAttribute("data-popover-open", open);
  // jsdom hides every `[popover]` and can't focus inside it.
  element.style.display = open ? "block" : "";
}

/** Puts the fake in place; returns a function that takes it out. */
export function installFakePopover(): () => void {
  const prototype = HTMLElement.prototype;
  Object.defineProperty(prototype, "showPopover", {
    configurable: true,
    value(this: HTMLElement) {
      setOpen(this, true);
    },
  });
  Object.defineProperty(prototype, "hidePopover", {
    configurable: true,
    value(this: HTMLElement) {
      setOpen(this, false);
    },
  });
  return () => {
    for (const name of names) {
      Reflect.deleteProperty(prototype, name);
    }
  };
}

/** Whether the fake has `popover` open. */
export function isPopoverOpen(popover: Element): boolean {
  return popover.hasAttribute("data-popover-open");
}
