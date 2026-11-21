import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  RoutineHub,
  RoutineListing,
  RoutineRef,
  RoutinesHost,
  RoutineTargetChoice,
} from "./api.ts";

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

/** A listing that is on, with nothing to note, for a test to change what it cares about. */
export function listing(
  hubId: string,
  id: string,
  name: string,
  more: Partial<RoutineListing> = {},
): RoutineListing {
  return {
    hubId,
    id,
    name,
    enabled: true,
    summary: `Daily at 07:30 → ${name}`,
    targetName: "Briefing",
    targetFound: true,
    needsSignIn: false,
    needsYou: 0,
    pausedUntilTrusted: false,
    ...more,
  };
}

/** The parts of a host the list reads, in memory, telling its listeners about each change. */
export function memoryHost(
  hubs: readonly RoutineHub[],
  initial: readonly RoutineListing[],
  starter: (hubId: string) => RoutineTargetChoice | undefined = () => undefined,
) {
  let listings = initial;
  const listeners = new Set<() => void>();
  const host = {
    hubs: () => hubs,
    list: async () => listings,
    trash: async (ref: RoutineRef) => {
      const removed = listings.find((each) => each.hubId === ref.hubId && each.id === ref.id);
      listings = listings.filter((each) => each !== removed);
      for (const listener of listeners) listener();
      return {
        undo: async () => {
          if (removed !== undefined) listings = [...listings, removed];
          for (const listener of listeners) listener();
        },
      };
    },
    runs: async () => ({ runs: [], skips: [] }),
    starterTarget: async (hubId: string) => starter(hubId),
    create: async ({ name, hubId }: { name: string; hubId: string }): Promise<RoutineRef> => {
      const made = listing(hubId, name.toLowerCase().replaceAll(" ", "-"), name);
      listings = [...listings, made];
      return { hubId, id: made.id };
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as RoutinesHost;
  return {
    host,
    change: (next: readonly RoutineListing[]) => {
      listings = next;
      for (const listener of listeners) listener();
    },
  };
}

/** The button with this text, or `undefined`. */
export function buttonNamed(page: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith(text),
  );
}

/** Types into an input or a text area the way a person does, so React sees the change. */
export async function typeInto(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
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

/**
 * A `popover` for the row menu tests, as the shell's and the kit's own tests use: jsdom has none.
 * `showPopover()` and `hidePopover()` set `data-popover-open`, show the element and fire
 * `beforetoggle` at once, as a browser does. Returns the way to take it out; call it in `afterEach`.
 */
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
