/**
 * Renders a settings section into jsdom for a test, the way the Studio does: with React's own
 * `createRoot`, inside `act`. A test that renders starts with `// @vitest-environment jsdom`.
 */
import { HostSettings } from "@halonicjs/app";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

/** Removes everything the test rendered. A test calls it from `afterEach`. */
export function unmountAll(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
}

/** Renders `element` into a fresh container in the document. */
export function render(element: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return container;
}

/** Lets pending promises and React catch up, inside `act`. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Presses keys on the window, as the person would, and says whether anything prevented it. */
export function press(keys: Partial<KeyboardEventInit> & { readonly code: string }): boolean {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...keys });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

/** The button whose text is `text`. */
export function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`No button "${text}".`);
  return found;
}

/**
 * Loaded host settings over a store in memory, holding `saved`. `failSaves` makes saves fail, as
 * a locked file would, and `changeElsewhere` saves a value as the shell or another window would.
 */
export async function memorySettings(saved: Record<string, string> = {}) {
  const stored = new Map<string, unknown>(Object.entries(saved));
  const watchers = new Set<() => void>();
  const store = {
    failSaves: false,
    stored,
    read: async () => Object.fromEntries(stored),
    set: async (key: string, value: unknown) => {
      if (store.failSaves) throw new Error("The settings file is locked.");
      stored.set(key, value);
    },
    remove: async (key: string) => {
      if (store.failSaves) throw new Error("The settings file is locked.");
      stored.delete(key);
    },
    watch: (watcher: () => void) => {
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
      };
    },
    changeElsewhere(key: string, value: string) {
      stored.set(key, value);
      for (const watcher of [...watchers]) watcher();
    },
  };
  const settings = new HostSettings(store as ConstructorParameters<typeof HostSettings>[0]);
  await settings.load();
  return { settings, store };
}
