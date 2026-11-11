import {
  type HostSettingsStore,
  type HostSettingValue,
  hostSettingsMaxBytes,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

/** One empty store under test, and two ways to change what it holds behind its back. */
export interface HostSettingsStoreHarness {
  store: HostSettingsStore;
  /** Makes the saved settings unparsable, the way a file cut off halfway would be. */
  damage(): Promise<void>;
  /** Saves `value` under `key` the way another window or the CLI would, through another store. */
  changeElsewhere(key: string, value: HostSettingValue): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeHostSettingsStore = () => Promise<HostSettingsStoreHarness>;

/**
 * The contract every {@link HostSettingsStore} adapter passes. The port only
 * stores JSON values by key; `HostSettings` gives them meaning. A save
 * changes one key, so two windows that change two settings keep both.
 */
export function hostSettingsStoreContract(name: string, make: MakeHostSettingsStore): void {
  verifies("contracts.host-settings-store", () => {
    describe(`HostSettingsStore contract: ${name}`, () => {
      storageCases(make);
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

  it("removes a key when its value is undefined, and removing none is not an error", async () => {
    const { store } = await make();
    await store.set("assistant.turn-limit", 20);
    await store.set("assistant.connector-tools", false);
    await store.set("assistant.turn-limit", undefined);
    await store.set("assistant.instructions", undefined);
    expect(await store.read()).toEqual({ "assistant.connector-tools": false });
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

  it("reads unparsable settings as none saved, and the next save starts afresh", async () => {
    const { store, damage } = await make();
    await store.set("assistant.turn-limit", 20);
    await damage();
    expect(await store.read()).toEqual({});

    await store.set("assistant.connector-tools", false);
    expect(await store.read()).toEqual({ "assistant.connector-tools": false });
  });
}

function refusalCases(make: MakeHostSettingsStore): void {
  it("refuses a key that isn't a setting's, and saves nothing", async () => {
    const { store } = await make();
    for (const key of ["turn-limit", "Assistant.model", "__proto__.polluted", "../host.json"]) {
      await expect(store.set(key, 1), key).rejects.toThrow(RangeError);
    }
    expect(await store.read()).toEqual({});
  });

  it("refuses a number JSON can't hold, and keeps the value before it", async () => {
    const { store } = await make();
    await store.set("assistant.turn-limit", 20);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, [Number.NEGATIVE_INFINITY]]) {
      await expect(store.set("assistant.turn-limit", value)).rejects.toThrow(RangeError);
    }
    expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
  });

  it("refuses settings over 256 KiB, and keeps the value before it", async () => {
    const { store } = await make();
    await store.set("assistant.instructions", "Be brief.");
    const tooLong = "x".repeat(hostSettingsMaxBytes);
    await expect(store.set("assistant.instructions", tooLong)).rejects.toThrow(RangeError);
    expect(await store.read()).toEqual({ "assistant.instructions": "Be brief." });
  });
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
