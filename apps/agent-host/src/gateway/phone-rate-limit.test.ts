import { ManualClock } from "@halonicjs/adapter-memory";
import type { GatewayRateLimited } from "@halonicjs/adapter-remote-gateway";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PhoneRateLimits, phoneCallsPerMinute } from "./phone-rate-limit.ts";

const pixel = new Uint8Array(32).fill(1);
const other = new Uint8Array(32).fill(2);

/** Takes `count` calls of `kind`; gives how many were allowed. */
function takeMany(
  rate: ReturnType<PhoneRateLimits["forPhone"]>,
  kind: GatewayRateLimited,
  count: number,
) {
  let allowed = 0;
  for (let call = 0; call < count; call++) if (rate.take(kind)) allowed++;
  return allowed;
}

verifies("agent-host.gateway-phone-messaging", () => {
  describe("PhoneRateLimits", () => {
    it("allows 10 searches a minute, then refuses, and refills one every six seconds", () => {
      const clock = new ManualClock("2026-11-25T08:00:00.000Z");
      const limits = new PhoneRateLimits(clock);
      const rate = limits.forPhone(pixel);
      expect(takeMany(rate, "search", 11)).toBe(phoneCallsPerMinute.search);
      clock.advance(5_999);
      expect(rate.take("search")).toBe(false);
      clock.advance(1);
      expect(rate.take("search")).toBe(true);
      expect(rate.take("search")).toBe(false);
    });

    it("allows 30 reactions reads a minute, on their own rate, and refills one every two seconds", () => {
      const clock = new ManualClock("2026-11-25T08:00:00.000Z");
      const limits = new PhoneRateLimits(clock);
      const rate = limits.forPhone(pixel);
      expect(takeMany(rate, "reactions", 31)).toBe(30);
      expect(rate.take("search")).toBe(true);
      clock.advance(2_000);
      expect(rate.take("reactions")).toBe(true);
      expect(rate.take("reactions")).toBe(false);
    });

    it("keeps a used-up rate when the same phone reconnects", () => {
      const clock = new ManualClock("2026-11-25T08:00:00.000Z");
      const limits = new PhoneRateLimits(clock);
      expect(takeMany(limits.forPhone(pixel), "send", 10)).toBe(10);
      const reconnected = limits.forPhone(pixel);
      expect(reconnected.take("send")).toBe(false);
    });

    it("rates each phone and each kind on its own", () => {
      const clock = new ManualClock("2026-11-25T08:00:00.000Z");
      const limits = new PhoneRateLimits(clock);
      expect(takeMany(limits.forPhone(pixel), "search", 10)).toBe(10);
      expect(limits.forPhone(pixel).take("send")).toBe(true);
      expect(limits.forPhone(other).take("search")).toBe(true);
    });

    it("refills nothing when the clock goes back", () => {
      // A clock of its own: the manual clock only moves forward.
      let nowMs = Date.parse("2026-11-25T08:00:00.000Z");
      const limits = new PhoneRateLimits({ now: () => new Date(nowMs) });
      const rate = limits.forPhone(pixel);
      takeMany(rate, "search", 10);
      nowMs -= 60_000;
      expect(rate.take("search")).toBe(false);
    });
  });
});
