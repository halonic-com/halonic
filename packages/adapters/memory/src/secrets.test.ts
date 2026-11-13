import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemorySecretStore } from "./secrets.ts";

verifies("memory.secret-store", () => {
  it("lists the names as last written, sorted by key, whatever the order they were set in", async () => {
    const store = new MemorySecretStore();
    await store.set("zeta", "1");
    await store.set("Open-AI", "2");
    await store.set("alpha", "3");
    await store.set("open_ai", "4");
    expect(await store.names()).toEqual(["alpha", "open_ai", "zeta"]);
  });

  it("reads a secret by any spelling of its name and forgets it when removed", async () => {
    const store = new MemorySecretStore();
    await store.set("Open-AI", "one");
    expect(await store.get("open_ai")).toBe("one");
    expect(await store.names()).toEqual(["Open-AI"]);
    await store.remove("OPEN_AI");
    expect(await store.get("Open-AI")).toBeNull();
  });

  it("refuses an empty value and one over the limit with a RangeError", async () => {
    const store = new MemorySecretStore();
    await expect(store.set("a", "")).rejects.toBeInstanceOf(RangeError);
    await expect(store.set("a", "x".repeat(65_537))).rejects.toBeInstanceOf(RangeError);
    expect(await store.names()).toEqual([]);
  });
});
