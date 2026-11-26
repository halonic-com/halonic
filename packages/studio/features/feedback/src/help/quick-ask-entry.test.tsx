// @vitest-environment jsdom

import {
  type AskKeys,
  type AskKeysSettings,
  AskKeysSettingsService,
  type AskOpener,
  AskOpenerService,
} from "@halonicjs/studio-feature-quick-ask/api";
import { defineFeature, type KeyboardPlatform } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeHelpWindow,
  helpItems,
  named,
  paletteRows,
  prepareHelpWindow,
  renderHelpWindow,
} from "./help-window.test-helper.tsx";

beforeEach(prepareHelpWindow);
afterEach(closeHelpWindow);

/** Lets the lazily loaded views and the services' reads arrive. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await vi.dynamicImportSettled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

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
  const page = await renderHelpWindow(appFeature, platform);
  await settle();
  return { page, settings };
}

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

      const row = named(paletteRows(page, "Quick ask"), "Quick ask");
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
      expect(named(paletteRows(page, "Quick ask"), "Quick ask")?.textContent).not.toContain("(");
    });

    it("show nowhere without the app's opener", async () => {
      const { page } = await renderWindow({});

      expect(named(helpItems(page), "Quick ask")).toBeUndefined();
      expect(named(paletteRows(page, "Quick ask"), "Quick ask")).toBeUndefined();
    });
  });
});
