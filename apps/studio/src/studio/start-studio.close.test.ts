// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeLimitMs, type StartedStudio, startStudio } from "./start-studio.ts";

/** A desktop window: jsdom has no `matchMedia`, and the shell follows the phone width with it. */
function desktopMediaQueries(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

/** The desktop app's webview: Tauri's IPC answering what the Studio asks while it starts. */
function desktopWebview() {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list") return [];
    if (command === "host_settings_read") return {};
    return command === "run_logs" ? [] : null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { calls, page: { __TAURI_INTERNALS__: internals } };
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

/** A desktop window whose close button can be pressed; `hang` makes the shell's unlisten never answer. */
function closableWebview(hang = false) {
  const { calls, page } = desktopWebview();
  const callbacks: ((message: unknown) => void)[] = [];
  const internals = {
    ...page.__TAURI_INTERNALS__,
    invoke: async (command: string, args?: Record<string, unknown>) => {
      if (command === "plugin:event|unlisten" && hang) return new Promise<never>(() => {});
      return page.__TAURI_INTERNALS__.invoke(command, args);
    },
    transformCallback: (callback: (message: unknown) => void) => callbacks.push(callback),
  };
  const destroyed = () => calls.filter((call) => call.command === "plugin:window|destroy");
  return {
    calls,
    page: { __TAURI_INTERNALS__: internals },
    destroyed,
    press: () => callbacks[0]?.({}),
  };
}

verifies("studio.entry", () => {
  it("stops the Studio, then closes the desktop window, when the person closes it", async () => {
    const webview = closableWebview();
    started = startStudio({ element, window: webview.page, userAgent: "Mozilla/5.0 (X11; Linux)" });
    await vi.waitFor(() => expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio"));

    webview.press();

    await vi.waitFor(() => expect(webview.destroyed()).toHaveLength(1));
    expect(element.querySelector("h1")).toBeNull();
    expect(webview.calls.map((call) => call.command)).toContain("plugin:event|unlisten");
  });

  it("closes the window anyway when stopping takes longer than the limit", async () => {
    vi.useFakeTimers();
    try {
      const webview = closableWebview(true);
      started = startStudio({
        element,
        window: webview.page,
        userAgent: "Mozilla/5.0 (X11; Linux)",
      });
      webview.press();
      await vi.advanceTimersByTimeAsync(closeLimitMs - 1);
      expect(webview.destroyed()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(webview.destroyed()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      started = undefined;
    }
  });
});
