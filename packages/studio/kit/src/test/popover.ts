/**
 * A fake `popover` for component tests. jsdom has no `showPopover()`, so a test gets one that
 * sets `data-popover-open` and shows it, fires `beforetoggle` at once and `toggle` a moment later
 * with their `newState`, as a browser does (`toggle` is a queued task there, a microtask here),
 * and a click on a `popovertarget` button that toggles its popover. It doesn't do the top layer
 * or light dismiss: that's the browser's part. A test calls `hidePopover()` itself to stand in for
 * an outside click.
 */
const prototype = HTMLElement.prototype;
const names = ["showPopover", "hidePopover", "togglePopover"] as const;

function setOpen(element: HTMLElement, open: boolean): void {
  if (element.hasAttribute("data-popover-open") === open) {
    return;
  }
  const newState = open ? "open" : "closed";
  element.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState }));
  element.toggleAttribute("data-popover-open", open);
  // jsdom hides every `[popover]` and can't focus inside it, as it has no `:popover-open`.
  element.style.display = open ? "block" : "";
  const event = Object.assign(new Event("toggle"), { newState });
  queueMicrotask(() => element.dispatchEvent(event));
}

function clickInvoker(event: MouseEvent): void {
  const invoker = (event.target as Element).closest("[popovertarget]");
  const target = document.getElementById(invoker?.getAttribute("popovertarget") ?? "");
  target?.togglePopover();
}

/** Installs the fake. A test file calls it from `beforeEach`. */
export function fakePopover(): void {
  const methods: Record<(typeof names)[number], (this: HTMLElement) => void> = {
    showPopover() {
      setOpen(this, true);
    },
    hidePopover() {
      setOpen(this, false);
    },
    togglePopover() {
      setOpen(this, !this.hasAttribute("data-popover-open"));
    },
  };
  for (const name of names) {
    Object.defineProperty(prototype, name, { configurable: true, value: methods[name] });
  }
  document.addEventListener("click", clickInvoker);
}

/** Takes the fake away. A test file calls it from `afterEach`, after `unmountAll`. */
export function restorePopover(): void {
  for (const name of names) {
    Reflect.deleteProperty(prototype, name);
  }
  document.removeEventListener("click", clickInvoker);
}

/** Whether the fake has `popover` open. */
export function isOpen(popover: Element): boolean {
  return popover.hasAttribute("data-popover-open");
}
