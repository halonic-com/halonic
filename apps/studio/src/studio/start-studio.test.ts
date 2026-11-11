// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { keyboardPlatform, type StartedStudio, startStudio, studioHost } from "./start-studio.ts";

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

/** The window's tabs and its heading, which React draws in the same pass. */
const tabsSelector = '[role="tablist"][aria-label="Open tabs"]';
const headingSelector = "main h1";

/**
 * Waits until React has drawn the window's tabs and heading. React draws on its own schedule,
 * so a fixed wait is too short when CI is busy; this polls until both are there instead. The
 * ceiling stays under Vitest's 5 s test timeout, so a window that never draws fails on the
 * assertion and not on "Test timed out".
 */
async function drawn(root: HTMLElement): Promise<void> {
  await vi.waitFor(
    () => {
      expect(root.querySelector(tabsSelector)).not.toBeNull();
      expect(root.querySelector(headingSelector)).not.toBeNull();
    },
    { timeout: 4_000 },
  );
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

verifies("studio.entry", () => {
  it("shows the window tabs and Home, as the served Studio in a browser", async () => {
    started = startStudio({ element, window, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    await drawn(element);

    expect(started.host).toBe("served");
    expect(element.querySelector(tabsSelector)).not.toBeNull();
    expect(element.querySelector(headingSelector)?.textContent).toBe("Home");
  });

  it("runs as the desktop app in Tauri's webview", () => {
    const webview = { __TAURI_INTERNALS__: { invoke: async () => undefined } };

    expect(studioHost(webview)).toBe("desktop-app");
    expect(studioHost({})).toBe("served");
  });

  it("reads ⌘ on macOS and Ctrl elsewhere from the user agent", () => {
    expect(keyboardPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("macos");
    expect(keyboardPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(keyboardPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });

  it("takes the window off the page when stopped", async () => {
    const studio = startStudio({ element, window, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" });
    await drawn(element);

    await studio.stop();

    expect(element.childElementCount).toBe(0);
  });
});
