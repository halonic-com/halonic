// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
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

/** Lets React draw what `createRoot().render` scheduled. */
async function drawn() {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
    await drawn();

    expect(started.host).toBe("served");
    expect(element.querySelector('[role="tablist"][aria-label="Open tabs"]')).not.toBeNull();
    expect(element.querySelector("main h1")?.textContent).toBe("Home");
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
    await drawn();

    await studio.stop();

    expect(element.childElementCount).toBe(0);
  });
});
