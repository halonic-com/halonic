import { sandboxChoiceOf } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemorySandboxSettingStore } from "./sandbox-setting-store.ts";

verifies("memory.sandbox-setting-store", () => {
  it("makes a damaged choice unreadable", async () => {
    const store = new MemorySandboxSettingStore();
    await store.save(sandboxChoiceOf("srt"));
    store.damage();
    await expect(store.get()).rejects.toThrow("The sandbox choice can't be read.");
  });

  it("refuses a choice with a backend that isn't listed", async () => {
    const store = new MemorySandboxSettingStore();
    await store.save({ backend: "docker", chosenAt: "2026-11-13T09:00:00.000Z" } as never);
    await expect(store.get()).rejects.toThrow("The sandbox choice isn't a valid choice.");
  });

  it("refuses to damage a choice it doesn't hold", async () => {
    const store = new MemorySandboxSettingStore();
    expect(() => store.damage()).toThrow("There is no sandbox choice to damage.");
    expect(await store.get()).toBeNull();
  });
});
