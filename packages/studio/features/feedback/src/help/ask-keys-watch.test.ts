import type { AskKeysSettings } from "@halonicjs/studio-feature-quick-ask/api";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { AskKeysWatch } from "./ask-keys-watch.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lets the keys' read arrive. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("feedback.help-quick-ask", () => {
  it("names no keys without the app's settings", () => {
    const watch = new AskKeysWatch(undefined);
    const stop = watch.subscribe(() => {});
    expect(watch.current()).toBeUndefined();
    stop();
  });

  it("reads the keys once for every subscriber, and tells them when the keys arrive", async () => {
    const keys = vi.fn(async () => ({ shortcut: "control+alt+Space", state: "on" as const }));
    const watch = new AskKeysWatch({ platform: "linux", keys, setKeys: async () => "saved" });
    const help = vi.fn();
    const palette = vi.fn();
    watch.subscribe(help);
    const stop = watch.subscribe(palette);
    await settled();

    expect(watch.current()).toBe("Ctrl+Alt+Space");
    expect(keys).toHaveBeenCalledTimes(1);
    expect([help.mock.calls.length, palette.mock.calls.length]).toEqual([1, 1]);
    stop();
  });

  it("says a failed read in the console and names no keys", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = new Error("the shell is gone");
    const settings: AskKeysSettings = {
      platform: "windows",
      keys: async () => Promise.reject(failed),
      setKeys: async () => "failed",
    };
    const watch = new AskKeysWatch(settings);
    expect(watch.current()).toBeUndefined();
    await settled();

    expect(watch.current()).toBeUndefined();
    expect(error).toHaveBeenCalledWith("Quick ask's keys couldn't be read:", failed);
  });
});
