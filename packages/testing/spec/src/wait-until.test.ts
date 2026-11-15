import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifies } from "./verifies.ts";
import { waitUntil } from "./wait-until.ts";

verifies("spec.wait-until-checks-once", () => {
  describe("waitUntil", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns once the check turns true, without touching expect", async () => {
      let readyAt = 0;
      const ready = vi.fn(() => Date.now() >= readyAt);
      readyAt = Date.now() + 30;
      const countBefore = expect.getState().assertionCalls;

      const waiting = waitUntil("the clock to pass 30 ms", ready);
      await vi.advanceTimersByTimeAsync(40);
      await waiting;

      expect(ready.mock.calls.length).toBeGreaterThan(1);
      expect(expect.getState().assertionCalls - countBefore).toBe(1);
    });

    it("calls an already true check once and does not pause", async () => {
      const ready = vi.fn(() => true);

      await waitUntil("something already true", ready);

      expect(ready).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("waits for a check that returns a promise", async () => {
      let tries = 0;
      const waiting = waitUntil("the second try", async () => {
        tries += 1;
        return tries >= 2;
      });

      await vi.advanceTimersByTimeAsync(20);
      await waiting;

      expect(tries).toBe(2);
    });

    it("throws with the timeout and what it waited for", async () => {
      const waiting = waitUntil("the listener to be called", () => false, { timeout: 100 });
      const outcome = expect(waiting).rejects.toThrow(
        "Timed out after 100 ms waiting for the listener to be called.",
      );

      await vi.advanceTimersByTimeAsync(200);
      await outcome;
    });

    it("gives up after 4 000 ms when the test sets no timeout", async () => {
      const waiting = waitUntil("a check that never passes", () => false);
      const outcome = expect(waiting).rejects.toThrow(
        "Timed out after 4000 ms waiting for a check that never passes.",
      );

      await vi.advanceTimersByTimeAsync(4_100);
      await outcome;
    });
  });
});
