import type { HostSettingsStore, HostSettingValue } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import golden from "./golden/host-settings-limits.json" with { type: "json" };

/** One empty store under test, and ways to look at and change what it holds behind its back. */
export interface HostSettingsStoreHarness {
  store: HostSettingsStore;
  /** The saved settings' text, as `host.json` holds it; `undefined` when none is saved. */
  saved(): Promise<string | undefined>;
  /** The broken copy's text, as `host.json.broken` holds it; `undefined` when there is none. */
  brokenCopy(): Promise<string | undefined>;
  /** Replaces the saved settings' text, the way a file cut off halfway or a newer Halonic would. */
  writeSaved(text: string): Promise<void>;
  /** Saves `value` under `key` the way another window or the CLI would, through another store. */
  changeElsewhere(key: string, value: HostSettingValue): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeHostSettingsStore = () => Promise<HostSettingsStoreHarness>;

/**
 * The contract every {@link HostSettingsStore} adapter passes. The port only
 * stores JSON values by key; `HostSettings` gives them meaning. A save
 * changes one key, so two windows that change two settings keep both. The
 * keys, sizes and saved shapes come from the port's golden cases, which the
 * desktop shell's Rust side checks too.
 */
export function hostSettingsStoreContract(name: string, make: MakeHostSettingsStore): void {
  verifies("contracts.host-settings-store", () => {
    describe(`HostSettingsStore contract: ${name}`, () => {
      storageCases(make);
      savedCases(make);
      refusalCases(make);
      changeCases(make);
    });
  });
}

function storageCases(make: MakeHostSettingsStore): void {
  it("starts empty, and saves one key without touching the others", async () => {
    const { store } = await make();
    expect(await store.read()).toEqual({});

    await store.set("assistant.turn-limit", 20);
    await store.set("assistant.model", { provider: "ollama", local: true, stop: ["END"] });
    await store.set("assistant.turn-limit", 24);
    expect(await store.read()).toEqual({
      "assistant.turn-limit": 24,
      "assistant.model": { provider: "ollama", local: true, stop: ["END"] },
    });
  });

  it("removes a key, keeps null as a value, and removing none is not an error", async () => {
    const { store } = await make();
    await store.set("assistant.turn-limit", 20);
    await store.set("assistant.connector-tools", false);
    await store.set("assistant.model", null);
    await store.remove("assistant.turn-limit");
    await store.remove("assistant.instructions");
    expect(await store.read()).toEqual({
      "assistant.connector-tools": false,
      "assistant.model": null,
    });
  });

  it("keeps every save when twenty keys are saved at once", async () => {
    const { store } = await make();
    const keys = Array.from({ length: 20 }, (_, index) => `assistant.key-${index}`);
    await Promise.all(keys.map((key, index) => store.set(key, index)));
    expect(await store.read()).toEqual(Object.fromEntries(keys.map((key, index) => [key, index])));
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const model = { provider: "anthropic", stop: ["END"] };
    await store.set("assistant.model", model);
    model.stop.push("STOP");

    const read = (await store.read())["assistant.model"] as { stop: string[] };
    expect(read.stop).toEqual(["END"]);
    read.stop.push("STOP");
    expect(await store.read()).toEqual({
      "assistant.model": { provider: "anthropic", stop: ["END"] },
    });
  });
}

function savedCases(make: MakeHostSettingsStore): void {
  for (const { name, text, values, afterSave } of golden.saved) {
    it(`reads and saves over ${name}`, async () => {
      const { store, saved, brokenCopy, writeSaved } = await make();
      await writeSaved(text);
      expect(await store.read()).toEqual(values ?? {});

      await store.set("assistant.turn-limit", 24);
      expect(JSON.parse((await saved()) ?? "null")).toEqual(afterSave);
      // Unparsable settings are kept as a broken copy, so they can still be recovered.
      expect(await brokenCopy()).toBe(values === null ? text : undefined);
    });
  }

  it("keeps only the latest broken copy, and none for a save over parsable settings", async () => {
    const { store, brokenCopy, writeSaved } = await make();
    await writeSaved('{"values":');
    await store.remove("assistant.turn-limit");
    await writeSaved('{"values":[]}');
    await store.set("assistant.turn-limit", 20);
    await store.set("assistant.turn-limit", 24);
    expect(await brokenCopy()).toBe('{"values":[]}');
  });
}

function refusalCases(make: MakeHostSettingsStore): void {
  it("refuses a key that isn't a setting's, and saves nothing", async () => {
    const { store, saved } = await make();
    for (const { key } of golden.keys.filter(({ allowed }) => !allowed)) {
      await expect(store.set(key, 1), key).rejects.toThrow(RangeError);
      await expect(store.remove(key), key).rejects.toThrow(RangeError);
    }
    expect(await saved()).toBeUndefined();
  });

  it("refuses a number JSON can't hold, and keeps the value before it", async () => {
    const { store } = await make();
    await store.set("assistant.turn-limit", 20);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, [Number.NEGATIVE_INFINITY]]) {
      await expect(store.set("assistant.turn-limit", value)).rejects.toThrow(RangeError);
    }
    expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
  });

  for (const { name, key, character, count, fits } of golden.sizes) {
    it(`${fits ? "saves" : "refuses, saving nothing,"} ${name}`, async () => {
      const { store, saved } = await make();
      const value = character.repeat(count);
      if (fits) {
        await store.set(key, value);
        expect(await store.read()).toEqual({ [key]: value });
      } else {
        await expect(store.set(key, value)).rejects.toThrow(RangeError);
        expect(await saved()).toBeUndefined();
      }
    });
  }
}

function changeCases(make: MakeHostSettingsStore): void {
  it("tells a watcher about its own saves and about changes made elsewhere", async () => {
    const { store, changeElsewhere } = await make();
    const listener = vi.fn();
    const stop = store.watch(listener);
    try {
      await store.set("assistant.turn-limit", 20);
      await vi.waitFor(() => expect(listener).toHaveBeenCalled());

      listener.mockClear();
      await changeElsewhere("assistant.turn-limit", 32);
      await vi.waitFor(() => expect(listener).toHaveBeenCalled());
      expect(await store.read()).toEqual({ "assistant.turn-limit": 32 });
    } finally {
      stop();
    }
  });

  it("stops telling a watcher once it is stopped", async () => {
    const { store, changeElsewhere } = await make();
    const stopped = vi.fn();
    const watching = vi.fn();
    store.watch(stopped)();
    const stop = store.watch(watching);
    try {
      await changeElsewhere("assistant.turn-limit", 32);
      await store.set("assistant.connector-tools", false);
      // The other watcher has heard of both changes, so the stopped one had its chance too.
      await vi.waitFor(() => expect(watching).toHaveBeenCalled());
      expect(stopped).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
}
