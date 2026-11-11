import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { DisplaySettings } from "./display-settings.ts";
import { MemoryDisplayPrefs, theme } from "./test-support/memory-display-prefs.ts";

function setup() {
  const prefs = new MemoryDisplayPrefs();
  const settings = new DisplaySettings(prefs);
  const changed = vi.fn();
  settings.subscribe(changed);
  return { prefs, settings, changed };
}

verifies("settings.display-prefs", () => {
  it("starts from the default when the stored value isn't one the setting accepts", () => {
    const { prefs, settings } = setup();
    prefs.stored.set(theme.key, "sepia");
    expect(settings.get(theme)).toBe("system");
    expect(settings.failure(theme)).toBeUndefined();
  });

  it("gives the same value each time until it changes", () => {
    const prefs = new MemoryDisplayPrefs();
    const colours = {
      key: "appearance.frame",
      fallback: { first: "#3B8BFF" },
      read: () => undefined,
    };
    const settings = new DisplaySettings(prefs);
    expect(settings.get(colours)).toBe(settings.get(colours));
  });

  it("shows a value another window stored", () => {
    const { prefs, settings, changed } = setup();
    expect(settings.get(theme)).toBe("system");
    prefs.changeElsewhere(theme.key, "dark");
    expect(settings.get(theme)).toBe("dark");
    expect(changed).toHaveBeenCalledOnce();
  });

  it("keeps a value that is still saving over one from another window", async () => {
    const { prefs, settings } = setup();
    prefs.holdWrites();
    const saving = settings.set(theme, "light");
    prefs.changeElsewhere(theme.key, "dark");
    expect(settings.get(theme)).toBe("light");
    prefs.release(0);
    await saving;
    expect(settings.get(theme)).toBe("light");
  });

  it("stops listening to the store when nobody listens", () => {
    const prefs = new MemoryDisplayPrefs();
    const subscribe = vi.spyOn(prefs, "subscribe");
    const settings = new DisplaySettings(prefs);
    const stop = settings.subscribe(() => undefined);
    settings.subscribe(() => undefined)();
    expect(subscribe).toHaveBeenCalledOnce();
    stop();
    prefs.changeElsewhere(theme.key, "dark");
    expect(settings.get(theme)).toBe("dark");
  });

  it("reads the store again when listening starts after a change nobody heard", () => {
    const prefs = new MemoryDisplayPrefs();
    const settings = new DisplaySettings(prefs);
    settings.subscribe(() => undefined)();
    expect(settings.get(theme)).toBe("system");
    prefs.changeElsewhere(theme.key, "dark");
    settings.subscribe(() => undefined);
    expect(settings.get(theme)).toBe("dark");
  });
});

verifies("settings.failed-save", () => {
  it("shows a change at once and stores it", async () => {
    const { prefs, settings, changed } = setup();
    const saving = settings.set(theme, "dark");
    expect(settings.get(theme)).toBe("dark");
    expect(await saving).toEqual({ saved: true });
    expect(prefs.stored.get(theme.key)).toBe("dark");
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("goes back to the value from before and keeps the failure", async () => {
    const { prefs, settings } = setup();
    const readOnly = new Error("read-only profile");
    prefs.failNext(readOnly);
    expect(await settings.set(theme, "dark")).toEqual({
      saved: false,
      superseded: false,
      reason: readOnly,
      back: "system",
    });
    expect(settings.get(theme)).toBe("system");
    expect(settings.failure(theme)).toBe(readOnly);
  });

  it("clears the failure on the next save", async () => {
    const { prefs, settings } = setup();
    prefs.failNext(new Error("full"));
    await settings.set(theme, "dark");
    await settings.set(theme, "light");
    expect(settings.get(theme)).toBe("light");
    expect(settings.failure(theme)).toBeUndefined();
  });

  it("doesn't let an older save that fails later undo a newer one", async () => {
    const { prefs, settings } = setup();
    prefs.holdWrites();
    prefs.failNext(new Error("full"));
    const dark = settings.set(theme, "dark");
    const light = settings.set(theme, "light");
    prefs.release(1, 0);
    expect(await light).toEqual({ saved: true });
    expect(await dark).toMatchObject({ saved: false, superseded: true });
    expect(settings.get(theme)).toBe("light");
    expect(settings.failure(theme)).toBeUndefined();
  });

  it("goes back to the stored value when both of two changes fail", async () => {
    const { prefs, settings } = setup();
    prefs.holdWrites();
    prefs.failNext(new Error("full"));
    prefs.failNext(new Error("full"));
    const dark = settings.set(theme, "dark");
    const light = settings.set(theme, "light");
    prefs.release(0, 1);
    expect(await dark).toMatchObject({ saved: false, superseded: true });
    expect(await light).toMatchObject({ saved: false, superseded: false, back: "system" });
    expect(settings.get(theme)).toBe("system");
  });

  it("goes back to a value another window stored while it was saving", async () => {
    const { prefs, settings } = setup();
    prefs.holdWrites();
    prefs.failNext(new Error("full"));
    const dark = settings.set(theme, "dark");
    prefs.changeElsewhere(theme.key, "light");
    prefs.release(0);
    expect(await dark).toMatchObject({ saved: false, superseded: false, back: "light" });
    expect(settings.get(theme)).toBe("light");
  });
});
