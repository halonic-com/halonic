import type { ComputerId } from "@halonicjs/studio-feature-remote/phone";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { tauriSavedDataStore } from "./tauri-saved-data-store.ts";

const laptop = "c-1" as ComputerId;

verifies("remote.phone-saved-messaging", () => {
  it("reads, writes and clears through the shell's phone_saved commands", async () => {
    const invoke = vi.fn((command: string) =>
      Promise.resolve(command === "phone_saved_read" ? '{"version":1}' : null),
    );
    const store = tauriSavedDataStore({ invoke }, vi.fn());

    await expect(store.read(laptop)).resolves.toBe('{"version":1}');
    await store.write(laptop, '{"version":1}');
    await store.clear(laptop);
    expect(invoke.mock.calls).toEqual([
      ["phone_saved_read", { computer: laptop }],
      ["phone_saved_write", { computer: laptop, text: '{"version":1}' }],
      ["phone_saved_clear", { computer: laptop }],
    ]);
  });

  it("reads nothing saved as undefined, and an answer it doesn't know too, reported", async () => {
    const report = vi.fn();
    const nothing = tauriSavedDataStore({ invoke: () => Promise.resolve(null) }, report);
    await expect(nothing.read(laptop)).resolves.toBeUndefined();
    expect(report).not.toHaveBeenCalled();

    const odd = tauriSavedDataStore({ invoke: () => Promise.resolve(42) }, report);
    await expect(odd.read(laptop)).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("phone_saved_read answered something other than text");
  });

  it("rejects when the shell refuses, as a write over 20 MB", async () => {
    const store = tauriSavedDataStore(
      { invoke: () => Promise.reject(new Error("too-large")) },
      vi.fn(),
    );
    await expect(store.write(laptop, "x")).rejects.toThrow("too-large");
  });
});
