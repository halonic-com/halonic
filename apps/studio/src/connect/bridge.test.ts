// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { localAddressStore } from "./bridge.ts";

afterEach(() => {
  localStorage.clear();
});

verifies("studio.connect.remembered-address", () => {
  it("has no address to load before one is saved", () => {
    expect(localAddressStore(localStorage).load()).toBeUndefined();
  });

  it("loads the address that was saved, also through a new store on the same storage", () => {
    localAddressStore(localStorage).save("192.168.1.20:4280");

    expect(localAddressStore(localStorage).load()).toBe("192.168.1.20:4280");
  });

  it("keeps only the latest address, under one key", () => {
    const store = localAddressStore(localStorage);

    store.save("192.168.1.20:4280");
    store.save("192.168.1.21:4280");

    expect(Object.entries(localStorage)).toEqual([
      ["halonic.connect.address", "192.168.1.21:4280"],
    ]);
  });

  it("loads an empty saved address as it is, not as missing", () => {
    const store = localAddressStore(localStorage);

    store.save("");

    expect(store.load()).toBe("");
  });

  it("lets the storage's own failure through, for example when it is full", () => {
    const full: Storage = {
      ...localStorage,
      getItem: () => null,
      setItem: () => {
        throw new Error("The storage is full.");
      },
    };

    expect(() => localAddressStore(full).save("192.168.1.20:4280")).toThrow("The storage is full.");
  });
});
