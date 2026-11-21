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
    expect(firstRunDeviceOf("/docs/Acme sample", pages).read()).toBeUndefined();
    firstRunDeviceOf("/docs/Acme sample", pages).write('{"kind":"off"}');
    const other = firstRunDeviceOf("/work/Shop", pages);
    expect(other.folder).toBe("/work/Shop");
    expect(other.read()).toBe('{"kind":"off"}');
    expect([...pages.items.keys()]).toEqual([FIRST_RUN_STATE]);
  });

  it("reads nothing from blocked storage, and a failed write doesn't throw but is reported", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const device = firstRunDeviceOf("/docs/Acme sample", storage(true));
      expect(device.read()).toBeUndefined();
      expect(() => device.write('{"kind":"off"}')).not.toThrow();
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});
