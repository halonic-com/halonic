// @vitest-environment jsdom

import {
  type AskKeys,
  type AskKeysSettings,
  AskKeysSettingsService,
  type AskOpener,
  AskOpenerService,
} from "@halonicjs/studio-feature-quick-ask/api";
import {
  createShell,
  defineFeature,
  type KeyboardPlatform,
  type ServiceKey,
  StudioWindow,
  StudioWorkspace,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedbackFeature } from "../feature.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const original = { matchMedia: window.matchMedia };
let mounted: { root: Root; element: HTMLElement } | undefined;

beforeEach(() => {
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
});

afterEach(() => {
  const done = mounted;
  mounted = undefined;
  if (done !== undefined) {
    act(() => done.root.unmount());
    done.element.remove();
  }
  window.matchMedia = original.matchMedia;
});

/** Quick ask's keys as the shell reads them, saved anew by `setKeys`, which tells subscribers. */
function askKeys(platform: KeyboardPlatform, read: AskKeys): AskKeysSettings {
  let keys = read;
  const listeners = new Set<() => void>();
  return {
    platform,
    keys: async () => keys,
    setKeys: async (shortcut) => {
      keys = { shortcut, state: "on" };
      for (const listener of listeners) listener();
      return "saved";
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface Given {
  readonly platform?: KeyboardPlatform;
  readonly keys?: AskKeys;
  /** Without one, as in the served Studio or a window but Studio's own. */
  readonly opener?: AskOpener;
}

/** The real Feedback feature in a desktop window, with what the app gives Studio's own window. */
async function renderWindow({
  platform = "windows",
  keys = { shortcut: "control+alt+Space", state: "on" },
  opener,
}: Given) {
  const settings = askKeys(platform, keys);
  const appFeature = defineFeature({
    id: "app",
    title: "App",
    provides:
      opener === undefined ? [AskKeysSettingsService] : [AskKeysSettingsService, AskOpenerService],
    register(studio) {
      studio.services.provide(AskKeysSettingsService, () => settings);
      if (opener !== undefined) studio.services.provide(AskOpenerService, () => opener);
    },
  });
  const shell = createShell({ features: [appFeature, feedbackFeature] });
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
  await settle();
  return { page: element, settings };
}

/** Lets the lazily loaded views and the keys' read arrive. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await vi.dynamicImportSettled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** The Help menu's items, by name; none when the sidebar shows no Help row. */
function helpItems(page: HTMLElement): HTMLElement[] {
  const help = [...page.querySelectorAll<HTMLButtonElement>("nav > button")].find(
    (button) => button.textContent === "Help",
  );
  const menu = document.getElementById(help?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
}

/** Opens Ctrl K, types "Quick ask", since the palette lists actions only for typed words, and gives its rows. */
function paletteRows(page: HTMLElement): HTMLElement[] {
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
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      field,
      "Quick ask",
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return [...page.querySelectorAll<HTMLElement>('[role="option"]')];
}

const named = (rows: readonly HTMLElement[], name: string) =>
  rows.find((row) => (row.getAttribute("aria-label") ?? row.textContent)?.startsWith(name));

const opener = () => ({ open: vi.fn(async () => {}) });

verifies("feedback.help-quick-ask", () => {
  describe("Help › Quick ask and its Ctrl K entry", () => {
    it("name the keys in Help, and picking the item shows the box", async () => {
      const box = opener();
      const { page } = await renderWindow({ opener: box });

      const item = named(helpItems(page), "Quick ask");
      expect(item?.textContent).toBe("Quick ask (Ctrl+Alt+Space)");
      await act(async () => item?.click());
      expect(box.open).toHaveBeenCalledTimes(1);
    });

    it("are in Ctrl K with the same name, and running it shows the box", async () => {
      const box = opener();
      const { page } = await renderWindow({ opener: box });

      const row = named(paletteRows(page), "Quick ask");
      expect(row?.textContent).toContain("Quick ask (Ctrl+Alt+Space)");
      await act(async () => row?.click());
      await settle();
      expect(box.open).toHaveBeenCalledTimes(1);
    });

    it("use the platform's own key names on macOS", async () => {
      const { page } = await renderWindow({
        platform: "macos",
        keys: { shortcut: "alt+Space", state: "on" },
        opener: opener(),
      });

      expect(named(helpItems(page), "Quick ask")?.textContent).toBe("Quick ask (⌥Space)");
    });

    it("name the new keys once Settings saves them", async () => {
      const { page, settings } = await renderWindow({ opener: opener() });

      await act(async () => {
        await settings.setKeys("control+alt+KeyK");
      });
      await settle();
      expect(named(helpItems(page), "Quick ask")?.textContent).toBe("Quick ask (Ctrl+Alt+K)");
    });

    it("name no keys that don't work", async () => {
      const { page } = await renderWindow({
        keys: { shortcut: "control+alt+Space", state: "taken" },
        opener: opener(),
      });

      expect(named(helpItems(page), "Quick ask")?.textContent).toBe("Quick ask");
      expect(named(paletteRows(page), "Quick ask")?.textContent).not.toContain("(");
    });

    it("show nowhere without the app's opener", async () => {
      const { page } = await renderWindow({});

      expect(named(helpItems(page), "Quick ask")).toBeUndefined();
      expect(named(paletteRows(page), "Quick ask")).toBeUndefined();
    });
  });
});
