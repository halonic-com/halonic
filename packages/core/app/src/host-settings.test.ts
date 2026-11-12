import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { HostSettings, hostSetting } from "./host-settings.ts";
import { TestHostSettingsStore } from "./testing/test-host-settings-store.ts";

const turnLimit = hostSetting(
  "assistant.turn-limit",
  16,
  (value): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 64,
);
const connectorTools = hostSetting(
  "assistant.connector-tools",
  true,
  (value): value is boolean => typeof value === "boolean",
);
const stop = hostSetting(
  "assistant.stop",
  [] as string[],
  (value): value is string[] =>
    Array.isArray(value) && value.every((part) => typeof part === "string"),
);

/** A loaded `HostSettings`, its store, and a second store as another window or the CLI. */
async function loaded() {
  const store = new TestHostSettingsStore();
  const elsewhere = new TestHostSettingsStore(store);
  const settings = new HostSettings(store);
  await settings.load();
  return { store, elsewhere, settings };
}

/** Waits until queued saves and re-reads have run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("app.host-settings", () => {
  describe("a setting", () => {
    it("refuses a key a store can't save, and a fallback its own check refuses", () => {
      const always = (value: unknown): value is number => typeof value === "number";
      expect(() => hostSetting("turn-limit", 16, always)).toThrow(RangeError);
      expect(() => hostSetting("assistant.turn-limit", 0, (v): v is number => v === 1)).toThrow(
        RangeError,
      );
    });
  });

  describe("reading", () => {
    it("gives the fallback when none is saved or the saved value doesn't fit", async () => {
      const { elsewhere } = await loaded();
      for (const saved of [0, 65, 2.5, "16"]) await elsewhere.set("assistant.turn-limit", saved);
      const settings = new HostSettings(elsewhere);
      await settings.load();
      expect(settings.get(turnLimit)).toBe(16);
      expect(settings.get(connectorTools)).toBe(true);
    });

    it("gives every fallback when the saved settings can't be parsed", async () => {
      const store = new TestHostSettingsStore();
      await store.set("assistant.turn-limit", 20);
      store.writeText("{");
      const settings = new HostSettings(store);
      await settings.load();
      expect(settings.get(turnLimit)).toBe(16);
    });

    it("refuses to read before it is loaded, and passes on a store that can't be read", async () => {
      const store = new TestHostSettingsStore();
      const elsewhere = new TestHostSettingsStore(store);
      store.readError = new Error("permission denied");
      const settings = new HostSettings(store);
      expect(() => settings.get(turnLimit)).toThrow("Load the host settings before reading one.");
      await expect(settings.load()).rejects.toThrow("permission denied");
      // A failed load doesn't keep watching.
      const read = vi.spyOn(store, "read");
      await elsewhere.set("assistant.turn-limit", 20);
      await settle();
      expect(read).not.toHaveBeenCalled();

      store.readError = undefined;
      await settings.load();
      expect(settings.get(turnLimit)).toBe(20);
    });
  });

  describe("saving", () => {
    it("saves a value that fits, and refuses one that doesn't without saving", async () => {
      const { store, settings } = await loaded();
      await settings.set(turnLimit, 20);
      expect(settings.get(turnLimit)).toBe(20);
      await expect(settings.set(turnLimit, 65)).rejects.toThrow(RangeError);
      expect(settings.get(turnLimit)).toBe(20);
      expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
    });

    it("keeps the value from before when the save fails", async () => {
      const { store, settings } = await loaded();
      await settings.set(turnLimit, 20);
      store.saveError = new Error("read-only profile");
      await expect(settings.set(turnLimit, 24)).rejects.toThrow("read-only profile");
      expect(settings.get(turnLimit)).toBe(20);
    });

    it("resets a setting to its fallback by removing it, and keeps the value when that fails", async () => {
      const { store, settings } = await loaded();
      await settings.set(turnLimit, 20);
      await settings.set(connectorTools, false);
      store.saveError = new Error("read-only profile");
      await expect(settings.reset(turnLimit)).rejects.toThrow("read-only profile");
      expect(settings.get(turnLimit)).toBe(20);

      store.saveError = undefined;
      await settings.reset(turnLimit);
      expect(settings.get(turnLimit)).toBe(16);
      expect(await store.read()).toEqual({ "assistant.connector-tools": false });
    });

    it("resets and saves in the order they were asked", async () => {
      const { settings } = await loaded();
      void settings.set(turnLimit, 20);
      void settings.reset(turnLimit);
      await settings.set(connectorTools, false);
      expect(settings.get(turnLimit)).toBe(16);
    });

    it("keeps what was saved, whatever the caller does with its array later", async () => {
      const { settings } = await loaded();
      const words = ["END"];
      await settings.set(stop, words);
      words.push("STOP");
      expect(settings.get(stop)).toEqual(["END"]);
    });
  });

  describe("changes made elsewhere", () => {
    it("tells its listeners which keys changed, but not about its own saves", async () => {
      const { elsewhere, settings } = await loaded();
      const listener = vi.fn();
      settings.onChange(listener);

      await settings.set(turnLimit, 20);
      await settle();
      expect(listener).not.toHaveBeenCalled();

      await elsewhere.set("assistant.connector-tools", false);
      await settle();
      expect(listener).toHaveBeenCalledExactlyOnceWith(["assistant.connector-tools"]);
      expect(settings.get(connectorTools)).toBe(false);
    });

    it("reads once for changes that come together, and reports a removed key", async () => {
      const { store, elsewhere, settings } = await loaded();
      await settings.set(turnLimit, 20);
      const read = vi.spyOn(store, "read");
      const listener = vi.fn();
      settings.onChange(listener);

      void elsewhere.remove("assistant.turn-limit");
      void elsewhere.set("assistant.connector-tools", false);
      await settle();
      expect(read).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledExactlyOnceWith([
        "assistant.turn-limit",
        "assistant.connector-tools",
      ]);
      expect(settings.get(turnLimit)).toBe(16);
    });

    it("keeps the values from before when a re-read fails, reports it, and reads again on the next change", async () => {
      const store = new TestHostSettingsStore();
      const elsewhere = new TestHostSettingsStore(store);
      const onRefreshError = vi.fn();
      const settings = new HostSettings(store, { onRefreshError });
      await settings.load();
      const listener = vi.fn();
      settings.onChange(listener);
      const failure = new Error("permission denied");
      store.readError = failure;
      await elsewhere.set("assistant.turn-limit", 20);
      await settle();
      expect(settings.get(turnLimit)).toBe(16);
      expect(listener).not.toHaveBeenCalled();
      expect(onRefreshError).toHaveBeenCalledExactlyOnceWith(failure);

      store.readError = undefined;
      await elsewhere.set("assistant.turn-limit", 24);
      await settle();
      expect(settings.get(turnLimit)).toBe(24);
      expect(listener).toHaveBeenCalledExactlyOnceWith(["assistant.turn-limit"]);
    });

    it("keeps watching when the error report itself throws", async () => {
      const store = new TestHostSettingsStore();
      const elsewhere = new TestHostSettingsStore(store);
      const settings = new HostSettings(store, {
        onRefreshError: () => {
          throw new Error("no log");
        },
      });
      await settings.load();
      store.readError = new Error("busy");
      await elsewhere.set("assistant.turn-limit", 20);
      await settle();
      store.readError = undefined;
      await elsewhere.set("assistant.turn-limit", 24);
      await settle();
      expect(settings.get(turnLimit)).toBe(24);
    });

    it("tells the other listeners when one throws, and none after it is stopped", async () => {
      const { elsewhere, settings } = await loaded();
      const stopped = vi.fn();
      const listener = vi.fn();
      settings.onChange(() => {
        throw new Error("a broken section");
      });
      settings.onChange(stopped)();
      settings.onChange(listener);

      await elsewhere.set("assistant.turn-limit", 20);
      await settle();
      expect(listener).toHaveBeenCalledOnce();
      expect(stopped).not.toHaveBeenCalled();
    });

    it("sees a change made while it loads", async () => {
      const store = new TestHostSettingsStore();
      const elsewhere = new TestHostSettingsStore(store);
      const read = store.read.bind(store);
      vi.spyOn(store, "read").mockImplementationOnce(async () => {
        const values = await read();
        await elsewhere.set("assistant.turn-limit", 20);
        return values;
      });
      const settings = new HostSettings(store);
      await settings.load();
      expect(settings.get(turnLimit)).toBe(16);
      await settle();
      expect(settings.get(turnLimit)).toBe(20);
    });

    it("watches once however often it loads, and stops when closed", async () => {
      const { store, elsewhere, settings } = await loaded();
      await settings.load();
      const read = vi.spyOn(store, "read");
      await elsewhere.set("assistant.turn-limit", 20);
      await settle();
      expect(read).toHaveBeenCalledOnce();

      settings.close();
      settings.close();
      await elsewhere.set("assistant.turn-limit", 24);
      await settle();
      expect(read).toHaveBeenCalledOnce();
      expect(settings.get(turnLimit)).toBe(20);
    });
  });
});
