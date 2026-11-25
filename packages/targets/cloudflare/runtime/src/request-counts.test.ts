import { MemoryCoordination } from "@halonicjs/adapter-memory";
import { CoordinationRequestCountStore } from "@halonicjs/host-server";
import type { Clock } from "@halonicjs/ports";
import { requestCountStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const clock: Clock = { now: () => new Date("2026-11-12T10:00:00Z") };

// The Worker counts in its Durable Object coordination; the memory one passes the same
// `Coordination` contract, so this runs the store the Worker uses without a Worker.
let current = new MemoryCoordination(clock);

requestCountStoreContract(
  "CoordinationRequestCountStore, as the Worker builds it",
  {
    async make() {
      current = new MemoryCoordination(clock);
      return new CoordinationRequestCountStore(current);
    },
    async reopen() {
      return new CoordinationRequestCountStore(current);
    },
  },
  { durable: true },
);

describe("CoordinationRequestCountStore", () => {
  verifies("server.request-count-store", () => {
    it("keeps one value per scope, overwritten when a new day starts", async () => {
      const coordination = new MemoryCoordination(clock);
      const store = new CoordinationRequestCountStore(coordination);
      await store.countRequest("2026-11-12", 5, "u/acme");
      await store.countRequest("2026-11-13", 5, "u/acme");
      const key = `daily-request-share:${await sha256Hex("u/acme")}`;
      expect(await coordination.read(key)).toBe("2026-11-13 1");
    });

    it("counts a late request from the day before into the scope's newer day", async () => {
      const store = new CoordinationRequestCountStore(new MemoryCoordination(clock));
      await store.countRequest("2026-11-13", 2, "u/acme");
      expect(await store.countRequest("2026-11-12", 2, "u/acme")).toEqual({
        allowed: true,
        count: 2,
      });
      expect((await store.countRequest("2026-11-13", 2, "u/acme")).allowed).toBe(false);
    });

    it("throws, rather than starting again, on a scope count stored in an unknown form", async () => {
      const coordination = new MemoryCoordination(clock);
      const key = `daily-request-share:${await sha256Hex("u/acme")}`;
      await coordination.compareAndSet(key, null, "not a count");
      const store = new CoordinationRequestCountStore(coordination);
      await expect(store.countRequest("2026-11-12", 2, "u/acme")).rejects.toThrow(/unknown form/);
    });
  });
});

/** The SHA-256 of a text as hex, the way the store names a scope's key. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
