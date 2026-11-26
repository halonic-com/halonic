// @vitest-environment jsdom

import type { HostSettings } from "@halonicjs/app";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import { defineFeature, type KeyboardPlatform } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FeedbackSettingsHost, FeedbackSettingsService } from "../api.ts";
import { memorySettings } from "../settings/test-support.tsx";
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

/** Whether Studio is connected to Paperclip, as the main window says it, changed by `set`. */
function connection(connected: boolean) {
  let now = connected;
  const listeners = new Set<() => void>();
  return {
    current: () => now,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: boolean) {
      now = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

interface Given {
  readonly platform?: KeyboardPlatform;
  readonly connected?: ReturnType<typeof connection>;
  /** Without one, as in the served Studio or a window but Studio's own. */
  readonly host?: "none" | "can't start";
  readonly settings?: HostSettings;
}

/** The real Feedback feature in a desktop window, with what the app gives Studio's own window. */
async function renderWindow({
  platform = "windows",
  connected = connection(true),
  host: without,
  settings,
}: Given) {
  const start = vi.fn();
  const host: FeedbackSettingsHost = {
    platform,
    setShortcut: async () => "saved",
    connected,
    ...(without === "can't start" ? {} : { start }),
  };
  const appFeature = defineFeature({
    id: "app",
    title: "App",
    provides: [
      ...(without === "none" ? [] : [FeedbackSettingsService]),
      ...(settings === undefined ? [] : [HostSettingsService]),
    ],
    register(studio) {
      if (without !== "none") studio.services.provide(FeedbackSettingsService, () => host);
      if (settings !== undefined) studio.services.provide(HostSettingsService, () => settings);
    },
  });
  const page = await renderHelpWindow(appFeature, platform);
  await settle();
  return { page, start };
}

const sendFeedback = "Send feedback (";

verifies("feedback.help-send-feedback", () => {
  describe("Help › Send feedback and its Ctrl K entry", () => {
    it("name the shortcut in Help while connected, and picking the item begins a feedback", async () => {
      const { page, start } = await renderWindow({});

      const item = named(helpItems(page), sendFeedback);
      expect(item?.textContent).toBe("Send feedback (Ctrl+Shift+F)");
      await act(async () => item?.click());
      expect(start).toHaveBeenCalledTimes(1);
    });

    it("are in Ctrl K with the same name while connected, and running it begins a feedback", async () => {
      const { page, start } = await renderWindow({});

      const row = named(paletteRows(page, "Send feedback"), sendFeedback);
      expect(row?.textContent).toContain("Send feedback (Ctrl+Shift+F)");
      await act(async () => row?.click());
      await settle();
      expect(start).toHaveBeenCalledTimes(1);
    });

    it("use the platform's own key names on macOS", async () => {
      const { page } = await renderWindow({ platform: "macos" });

      expect(named(helpItems(page), sendFeedback)?.textContent).toBe("Send feedback (⌘⇧F)");
    });

    it("name the new shortcut once Settings saves it", async () => {
      const { settings, store } = await memorySettings();
      const { page } = await renderWindow({ settings });
      expect(named(helpItems(page), sendFeedback)?.textContent).toBe(
        "Send feedback (Ctrl+Shift+F)",
      );

      await act(async () => store.changeElsewhere("feedback.shortcut", "control+alt+KeyF"));
      await settle();
      expect(named(helpItems(page), sendFeedback)?.textContent).toBe("Send feedback (Ctrl+Alt+F)");
    });

    it("show nowhere while Studio isn't connected to Paperclip, and come back when it connects", async () => {
      const connected = connection(false);
      const { page } = await renderWindow({ connected });

      expect(named(helpItems(page), "Send feedback")).toBeUndefined();
      expect(named(paletteRows(page, "Send feedback"), "Send feedback")).toBeUndefined();

      await act(async () => connected.set(true));
      await settle();
      expect(named(helpItems(page), sendFeedback)?.textContent).toBe(
        "Send feedback (Ctrl+Shift+F)",
      );
    });

    it("show nowhere where the window takes no feedback", async () => {
      const { page } = await renderWindow({ host: "none" });

      expect(named(helpItems(page), "Send feedback")).toBeUndefined();
      expect(named(paletteRows(page, "Send feedback"), "Send feedback")).toBeUndefined();
    });

    it("show nowhere where the window can't begin one", async () => {
      const { page } = await renderWindow({ host: "can't start" });

      expect(named(helpItems(page), "Send feedback")).toBeUndefined();
      expect(named(paletteRows(page, "Send feedback"), "Send feedback")).toBeUndefined();
    });
  });
});
