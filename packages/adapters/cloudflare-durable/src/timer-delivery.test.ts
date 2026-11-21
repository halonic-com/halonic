import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { napFor } from "./timer-delivery.ts";

const second = 1000;

// The delivery loop over a real Durable Object's SQLite storage, inside workerd.
await runSuitesInWorkerd([new URL("./test/timer-delivery.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.timers", register),
});

// How the loop waits uses no storage, and its first case spies on setTimeout, so it runs in Node.
verifies("cloudflare-durable.timers", () => {
  describe("napFor", () => {
    it("waits no longer than setTimeout keeps, for a timer more than 24 days away", async () => {
      const delays: unknown[] = [];
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        _callback: unknown,
        delay: unknown,
      ) => {
        delays.push(delay);
        return 0;
      }) as unknown as typeof setTimeout);
      try {
        void napFor(30 * 24 * 60 * 60 * second, new AbortController().signal);
      } finally {
        setTimeoutSpy.mockRestore();
      }
      expect(delays).toEqual([2 ** 31 - 1]);
    });

    it("resolves when the time has passed, and at once when it is aborted", async () => {
      const abort = new AbortController();
      await expect(napFor(1, abort.signal)).resolves.toBeUndefined();
      const waiting = napFor(60_000, abort.signal);
      abort.abort();
      await expect(waiting).resolves.toBeUndefined();
    });
  });
});
