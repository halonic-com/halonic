// @vitest-environment jsdom

import { phoneQuery } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { keyboardPlatform, phonePointerQuery, studioHost } from "./studio-host.ts";

/** A `matchMedia` where only the given queries match; jsdom has none of its own. */
function mediaQueriesMatching(matching: readonly string[]) {
  return (query: string): MediaQueryList => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

const jsdomMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = jsdomMatchMedia;
});

verifies("studio.entry", () => {
  it("runs as the desktop app in Tauri's webview", () => {
    const webview = { __TAURI_INTERNALS__: { invoke: async () => undefined } };

    expect(studioHost(webview)).toBe("desktop-app");
    expect(studioHost({})).toBe("served");
  });

  it("runs as the served Studio on a phone where the browser's main pointer is a touchscreen", () => {
    window.matchMedia = mediaQueriesMatching([phonePointerQuery]);

    expect(studioHost(window)).toBe("phone");
  });

  it("stays the served Studio in a desktop browser narrowed to a phone's width", () => {
    window.matchMedia = mediaQueriesMatching([phoneQuery]);

    expect(studioHost(window)).toBe("served");
  });

  it("reads ⌘ on macOS and Ctrl elsewhere from the user agent", () => {
    expect(keyboardPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)")).toBe("macos");
    expect(keyboardPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(keyboardPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });
});
