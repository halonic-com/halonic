// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserDisplayPrefs } from "./browser-display-prefs.ts";

afterEach(() => {
  window.localStorage.clear();
});

/** What the browser fires in this window when another window changes `storage`. */
function storageEvent(key: string | null, storageArea: Storage = window.localStorage) {
  return new StorageEvent("storage", { key, storageArea });
}

verifies("settings.display-prefs", () => {
  it("keeps values as JSON under its own keys", async () => {
    const prefs = new BrowserDisplayPrefs(window.localStorage, window);
    await prefs.write("appearance.frame", { first: "#3B8BFF" });
    expect(window.localStorage.getItem("halonic.settings.appearance.frame")).toBe(
      '{"first":"#3B8BFF"}',
    );
    expect(prefs.read("appearance.frame")).toEqual({ first: "#3B8BFF" });
    expect(prefs.read("appearance.theme")).toBeUndefined();
  });

  it("reads text that isn't JSON, or storage the browser blocks, as nothing", () => {
    window.localStorage.setItem("halonic.settings.appearance.theme", "dark");
    expect(new BrowserDisplayPrefs(window.localStorage, window).read("appearance.theme")).toBe(
      undefined,
    );
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as Storage;
    expect(new BrowserDisplayPrefs(blocked, window).read("appearance.theme")).toBeUndefined();
  });

  it("rejects when the browser can't store the value", async () => {
    const full = {
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    } as unknown as Storage;
    await expect(new BrowserDisplayPrefs(full, window).write("a", 1)).rejects.toThrow("full");
  });

  it("passes on its own keys changed in another window, until it stops", () => {
    const prefs = new BrowserDisplayPrefs(window.localStorage, window);
    const listener = vi.fn();
    const stop = prefs.subscribe(listener);
    window.dispatchEvent(storageEvent("halonic.settings.appearance.theme"));
    window.dispatchEvent(storageEvent("other.key"));
    window.dispatchEvent(storageEvent("halonic.settings.formats.format", window.sessionStorage));
    stop();
    window.dispatchEvent(storageEvent("halonic.settings.appearance.theme"));
    expect(listener.mock.calls).toEqual([["appearance.theme"]]);
  });
});
