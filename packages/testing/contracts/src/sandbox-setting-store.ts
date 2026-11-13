import type { SandboxSetting, SandboxSettingStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty sandbox setting store under test, and a way to damage what it holds. */
export interface SandboxSettingStoreHarness {
  store: SandboxSettingStore;
  /** Makes the saved choice unreadable, the way a damaged or hand-edited file would be. The suite only damages a choice it saved. */
  damage(): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeSandboxSettingStore = () => Promise<SandboxSettingStoreHarness>;

const chosenAt = "2026-11-13T09:00:00.000Z";

/** A choice of `backend`; `at` tells two saves apart. */
export function sandboxChoiceOf(
  backend: Exclude<SandboxSetting["backend"], "none">,
  at = chosenAt,
): SandboxSetting {
  return { backend, chosenAt: at };
}

/** A choice to continue without a sandbox. */
export function sandboxChoiceOfNone(appVersion = "0.1.0"): SandboxSetting {
  return { backend: "none", chosenAt, appVersion };
}

/** The contract every {@link SandboxSettingStore} adapter passes. The port only stores; it decides nothing. */
export function sandboxSettingStoreContract(name: string, make: MakeSandboxSettingStore): void {
  verifies("contracts.sandbox-setting-store", () => {
    describe(`SandboxSettingStore contract: ${name}`, () => {
      storageCases(make);
      damageCases(make);
    });
  });
}

function storageCases(make: MakeSandboxSettingStore): void {
  it("starts empty, and gives back every field of a saved choice", async () => {
    const { store } = await make();
    expect(await store.get()).toBeNull();
    await store.save(sandboxChoiceOf("srt-wsl"));
    expect(await store.get()).toEqual(sandboxChoiceOf("srt-wsl"));
  });

  it("keeps a choice of no sandbox with the app version it was made in", async () => {
    const { store } = await make();
    await store.save(sandboxChoiceOfNone("0.1.3"));
    expect(await store.get()).toEqual(sandboxChoiceOfNone("0.1.3"));
  });

  it("replaces the choice when another is saved, even between a backend and none", async () => {
    const { store } = await make();
    await store.save(sandboxChoiceOf("srt", "2026-11-13T09:00:00.000Z"));
    await store.save(sandboxChoiceOf("mxc", "2026-11-13T10:00:00.000Z"));
    expect(await store.get()).toEqual(sandboxChoiceOf("mxc", "2026-11-13T10:00:00.000Z"));
    await store.save(sandboxChoiceOfNone());
    expect(await store.get()).toEqual(sandboxChoiceOfNone());
    await store.save(sandboxChoiceOf("srt"));
    expect(await store.get()).toEqual(sandboxChoiceOf("srt"));
  });

  it("removes the choice, and removing one that isn't there is not an error", async () => {
    const { store } = await make();
    await store.remove();
    await store.save(sandboxChoiceOf("srt"));
    await store.remove();
    expect(await store.get()).toBeNull();
    await store.remove();
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = sandboxChoiceOf("srt");
    await store.save(saved);
    saved.chosenAt = "changed";

    const read = await store.get();
    expect(read).toEqual(sandboxChoiceOf("srt"));
    if (read !== null) read.chosenAt = "changed";
    expect(await store.get()).toEqual(sandboxChoiceOf("srt"));
  });
}

function damageCases(make: MakeSandboxSettingStore): void {
  it("throws on a damaged choice instead of reading it as not chosen, and still removes it", async () => {
    const harness = await make();
    await harness.store.save(sandboxChoiceOf("srt"));
    await harness.damage();

    await expect(harness.store.get()).rejects.toThrow("sandbox");
    await harness.store.remove();
    expect(await harness.store.get()).toBeNull();
  });

  it("reads a choice again once it is saved over the damaged one", async () => {
    const harness = await make();
    await harness.store.save(sandboxChoiceOf("srt"));
    await harness.damage();
    await harness.store.save(sandboxChoiceOf("mxc"));
    expect(await harness.store.get()).toEqual(sandboxChoiceOf("mxc"));
  });
}
