/**
 * A `popover` for the plugin menu tests, as the shell's and the kit's own tests use: jsdom has
 * none. `showPopover()` and `hidePopover()` set `data-popover-open`, show the element and fire
 * `beforetoggle` at once, as a browser does.
 */
const names = ["showPopover", "hidePopover"] as const;

function setOpen(element: HTMLElement, open: boolean): void {
  if (element.hasAttribute("data-popover-open") === open) return;
  const newState = open ? "open" : "closed";
  element.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState }));
  element.toggleAttribute("data-popover-open", open);
  // jsdom hides every `[popover]` and can't focus inside it.
  element.style.display = open ? "block" : "";
}

/** Puts the fake in place; returns a function that takes it out. */
export function installFakePopover(): () => void {
  const prototype = HTMLElement.prototype;
  for (const name of names) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      value(this: HTMLElement) {
        setOpen(this, name === "showPopover");
      },
    });
  }
  return () => {
    for (const name of names) Reflect.deleteProperty(prototype, name);
  };
}
