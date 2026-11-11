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

  it("reads damaged settings as none saved, and tells its watchers", async () => {
    const store = new MemoryHostSettingsStore();
    await store.set("assistant.turn-limit", 20);
    const listener = vi.fn();
    store.watch(listener);
    store.damage();
    expect(await store.read()).toEqual({});
    expect(listener).toHaveBeenCalledOnce();
  });
});
