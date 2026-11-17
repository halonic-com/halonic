import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RoutineHub, RoutineListing, RoutinesHost } from "./api.ts";

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
    needsSignIn: false,
    needsYou: 0,
    pausedUntilTrusted: false,
    ...more,
  };
}

/** The parts of a host the list reads, in memory, telling its listeners about each change. */
export function memoryHost(hubs: readonly RoutineHub[], initial: readonly RoutineListing[]) {
  let listings = initial;
  const listeners = new Set<() => void>();
  const host = {
    hubs: () => hubs,
    list: async () => listings,
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

/** Types into an input the way a person does, so React sees the change. */
export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
