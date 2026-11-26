// @vitest-environment jsdom

import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** The desktop app's webview in the window the shell labelled `label`, recording each command. */
function webviewLabelled(label: string, called: string[]) {
  return {
    __TAURI_INTERNALS__: {
      invoke: async (command: string) => {
        called.push(command);
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: { currentWindow: { label } },
    },
  };
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

function start(label: string, called: string[]) {
  // Acme is in Recent, so a window that opened the last workspace would ask the shell for it.
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
  new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
  started = startStudio({
    element,
    window: webviewLabelled(label, called),
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    storage,
  });
}

verifies("studio.feedback-windows", () => {
  it("shows only the not-available window in the window labelled feedback-unavailable", async () => {
    const called: string[] = [];
    start("feedback-unavailable", called);
    await vi.waitFor(() =>
      expect(element.textContent).toBe(
        "Studio can't take a screenshot for feedback on this system.Not now",
      ),
    );
    expect(called).toEqual([]);
  });
});

verifies("studio.feedback-window", () => {
  it.each(["inbox", "messenger"])("starts no feedback shortcut in the %s window", async (label) => {
    const called: string[] = [];
    // The page's own window, so a shortcut started in it would hear the keys. jsdom has no
    // `matchMedia`, which the shell follows the phone width with.
    const page = Object.assign(window, webviewLabelled(label, called), {
      matchMedia: (media: string) => ({
        matches: false,
        media,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    });
    try {
      started = startStudio({
        element,
        window: page,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      });
      await vi.waitFor(() => expect(element.textContent).not.toBe(""));
      const keys = new KeyboardEvent("keydown", {
        code: "KeyF",
        key: "F",
        ctrlKey: true,
        shiftKey: true,
        cancelable: true,
      });
      window.dispatchEvent(keys);

      expect(keys.defaultPrevented).toBe(false);
      expect(called).not.toContain("plugin:feedback|start");
    } finally {
      await started?.stop();
      started = undefined;
      Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    }
  });
});
