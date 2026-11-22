import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FIRST_RUN_STATE, firstRunDeviceOf } from "./first-run-device.ts";

/** A page storage that keeps text, and fails when `blocked` is set. */
function storage(blocked = false) {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => {
      if (blocked) throw new Error("blocked");
      return items.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("quota");
      items.set(key, value);
    },
  };
}

verifies("first-run.state", () => {
  it("keeps one state for the device, whichever folder saved it", () => {
    const pages = storage();
    expect(firstRunDeviceOf("/docs/Acme sample", { storage: pages }).read()).toBeUndefined();
    firstRunDeviceOf("/docs/Acme sample", { storage: pages }).write('{"kind":"off"}');
    const other = firstRunDeviceOf("/work/Shop", { storage: pages });
    expect(other.folder).toBe("/work/Shop");
    expect(other.read()).toBe('{"kind":"off"}');
    expect([...pages.items.keys()]).toEqual([FIRST_RUN_STATE]);
  });

  it("copies the demo again for Start over, where the window can", () => {
    let copies = 0;
    let told = 0;
    const startOver = (copied: () => void) => {
      copies += 1;
      copied();
    };
    firstRunDeviceOf("/docs/Acme sample", { storage: storage(), startOver }).startOver?.(() => {
      told += 1;
    });
    expect(copies).toBe(1);
    expect(told).toBe(1);
    expect(firstRunDeviceOf("/docs/Acme sample", { storage: storage() }).startOver).toBeUndefined();
  });

  it("tells when another window saves the state, until it stops", () => {
    const pages = storage();
    const events = new EventTarget();
    const saved = (key: string | null, storageArea: unknown = pages) =>
      events.dispatchEvent(Object.assign(new Event("storage"), { key, storageArea }));
    const changes = vi.fn();
    const stop = firstRunDeviceOf("/work/Shop", { storage: pages, events }).onChanged?.(changes);

    saved(FIRST_RUN_STATE);
    saved(null);
    saved("halonic.recent");
    saved(FIRST_RUN_STATE, storage());
    stop?.();
    saved(FIRST_RUN_STATE);

    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("reads nothing from blocked storage, and a failed write doesn't throw but is reported", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const device = firstRunDeviceOf("/docs/Acme sample", { storage: storage(true) });
      expect(device.read()).toBeUndefined();
      expect(() => device.write('{"kind":"off"}')).not.toThrow();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
