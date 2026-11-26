import {
  createShell,
  type Feature,
  type KeyboardPlatform,
  type ServiceKey,
  StudioWindow,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { feedbackFeature } from "../feature.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const original = { matchMedia: window.matchMedia };

/** Lets jsdom open Help and Ctrl K in a desktop window; for each test's `beforeEach`. */
export function prepareHelpWindow(): void {
  // jsdom has no popovers; the Help menu only needs to open and close.
  Object.assign(HTMLElement.prototype, {
    showPopover() {},
    hidePopover() {},
    togglePopover() {
      return true;
    },
  });
  // jsdom has `<dialog>` but no `showModal()`; Ctrl K only needs it to open.
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  // A wide window: the desktop's sidebar, with its Help row, and Ctrl K.
  window.matchMedia = ((query: string) =>
    ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** Takes the window {@link renderHelpWindow} drew away; for each test's `afterEach`. */
export function closeHelpWindow(): void {
  const done = mounted;
  mounted = undefined;
  if (done !== undefined) {
    act(() => done.root.unmount());
    done.element.remove();
  }
  window.matchMedia = original.matchMedia;
}

let mounted: { root: Root; element: HTMLElement } | undefined;

/**
 * The real Feedback feature in a desktop window, after `app`, which gives what the app would. Its
 * lazily loaded views arrive once the test settles.
 */
export async function renderHelpWindow(
  app: Feature,
  platform: KeyboardPlatform,
): Promise<HTMLElement> {
  const shell = createShell({ features: [app, feedbackFeature] });
  const provided = new Map<string, unknown>();
  const services = {
    provide<Service>(key: ServiceKey<Service>, service: Service): Service {
      provided.set(key.name, service);
      return service;
    },
    get<Service>(key: ServiceKey<Service>): Service {
      return provided.get(key.name) as Service;
    },
    has: (key: ServiceKey<unknown>) => provided.has(key.name),
  };
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  mounted = { root, element };
  await act(async () =>
    root.render(
      <StudioWindow
        shell={shell}
        workspace={workspace}
        host="desktop-app"
        platform={platform}
        language="en"
      />,
    ),
  );
  return element;
}

/** The Help menu's items, by name; none when the sidebar shows no Help row. */
export function helpItems(page: HTMLElement): HTMLElement[] {
  const help = [...page.querySelectorAll<HTMLButtonElement>("nav > button")].find(
    (button) => button.textContent === "Help",
  );
  const menu = document.getElementById(help?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
}

/** Opens Ctrl K, types `words`, since the palette lists actions only for typed words, and gives its rows. */
export function paletteRows(page: HTMLElement, words: string): HTMLElement[] {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  act(() => {
    const field = page.querySelector<HTMLInputElement>('[role="combobox"]');
    if (field === null) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, words);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return [...page.querySelectorAll<HTMLElement>('[role="option"]')];
}

/** The row whose name starts with `name`. */
export function named(rows: readonly HTMLElement[], name: string): HTMLElement | undefined {
  return rows.find((row) => (row.getAttribute("aria-label") ?? row.textContent)?.startsWith(name));
}
