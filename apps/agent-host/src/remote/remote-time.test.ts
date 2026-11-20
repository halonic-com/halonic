import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { systemTime } from "./remote-time.ts";

verifies("agent-host.remote-pairing-rules", () => {
  describe("systemTime", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("gives the current time", () => {
      vi.useFakeTimers({ now: Date.parse("2026-11-20T08:00:00.000Z") });
      expect(systemTime.now().toISOString()).toBe("2026-11-20T08:00:00.000Z");
    });

    it("waits the time it is given, and nothing for none", async () => {
      vi.useFakeTimers();
      await expect(systemTime.wait(0)).resolves.toBeUndefined();
      let woke = false;
      const waiting = systemTime.wait(120_000).then(() => {
        woke = true;
      });
      await vi.advanceTimersByTimeAsync(119_999);
      expect(woke).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(woke).toBe(true);
    });
  });
});
