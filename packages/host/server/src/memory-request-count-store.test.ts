import { requestCountStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryRequestCountStore } from "./memory-request-count-store.ts";

requestCountStoreContract(
  "MemoryRequestCountStore",
  { make: async () => new MemoryRequestCountStore() },
  { durable: false },
);

describe("MemoryRequestCountStore", () => {
  verifies("server.request-count-store", () => {
    it("counts up to the limit for a day and starts the next day from zero", async () => {
      const store = new MemoryRequestCountStore();
      expect(await store.countRequest("2026-11-12", 1)).toEqual({ allowed: true, count: 1 });
      expect(await store.countRequest("2026-11-12", 1)).toEqual({ allowed: false, count: 1 });
      expect(await store.countRequest("2026-11-13", 1)).toEqual({ allowed: true, count: 1 });
    });

    it("isn't durable: a new store starts from zero", async () => {
      await new MemoryRequestCountStore().countRequest("2026-11-12", 1);
      expect(await new MemoryRequestCountStore().countRequest("2026-11-12", 1)).toEqual({
        allowed: true,
        count: 1,
      });
    });
  });
});
