import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { MemoryHostSettingsStore } from "./host-settings-store.ts";

verifies("memory.host-settings-store", () => {
  it("shares its settings with a store made from it, as two windows share the profile", async () => {
    const first = new MemoryHostSettingsStore();
    const second = new MemoryHostSettingsStore(first);
    const listener = vi.fn();
    const stop = first.watch(listener);

    await second.set("assistant.turn-limit", 20);
    expect(await first.read()).toEqual({ "assistant.turn-limit": 20 });
    expect(listener).toHaveBeenCalledOnce();
    stop();
    expect(await new MemoryHostSettingsStore().read()).toEqual({});
  });

  it("keeps the settings as a file holds them, and tells its watchers when the text is replaced", async () => {
    const store = new MemoryHostSettingsStore();
    expect(store.savedText()).toBeUndefined();
    await store.set("assistant.turn-limit", 20);
    expect(JSON.parse(store.savedText() ?? "")).toEqual({
      version: 1,
      values: { "assistant.turn-limit": 20 },
    });

    const listener = vi.fn();
    store.watch(listener);
    store.writeText("{");
    expect(await store.read()).toEqual({});
    expect(listener).toHaveBeenCalledOnce();
    await store.remove("assistant.turn-limit");
    expect(store.brokenText()).toBe("{");
  });
});
