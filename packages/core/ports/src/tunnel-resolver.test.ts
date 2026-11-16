import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { TunnelEndpoint } from "./tunnel-provider.ts";
import {
  type TunnelResolver,
  type TunnelTransport,
  tunnelBackoff,
  tunnelReconnectDelayMs,
} from "./tunnel-resolver.ts";

verifies("ports.tunnel-resolver", () => {
  it("waits 500 ms before the first try and doubles after each", () => {
    expect([1, 2, 3, 4].map((attempt) => tunnelReconnectDelayMs(attempt, 0.5))).toEqual([
      500, 1000, 2000, 4000,
    ]);
  });

  it("waits a base of at most 30 s, moved by up to 20 % either way, so at most 36 s", () => {
    expect(tunnelReconnectDelayMs(20, 0.5)).toBe(30_000);
    expect(tunnelReconnectDelayMs(20, 0)).toBe(24_000);
    expect(tunnelReconnectDelayMs(20, 0.999_999)).toBeLessThanOrEqual(36_000);
    expect(tunnelReconnectDelayMs(1, 0)).toBe(400);
  });

  it("refuses a try that isn't a whole number from 1", () => {
    expect(() => tunnelReconnectDelayMs(0, 0.5)).toThrow(RangeError);
    expect(() => tunnelReconnectDelayMs(1.5, 0.5)).toThrow(RangeError);
  });

  it("refuses a random number outside 0 up to (not including) 1", () => {
    for (const random of [Number.NaN, -0.1, 1, 2]) {
      expect(() => tunnelReconnectDelayMs(1, random)).toThrow(RangeError);
    }
  });

  it("starts the backoff again after 30 s open", () => {
    expect(tunnelBackoff.resetAfterMs).toBe(30_000);
  });

  typeTest("gives the transport only these members", () => {
    expectTypeOf<keyof TunnelTransport>().toEqualTypeOf<
      "state" | "onState" | "send" | "frames" | "pause" | "resume" | "close"
    >();
    expectTypeOf<TunnelTransport["send"]>().toEqualTypeOf<(frame: Uint8Array) => Promise<void>>();
    expectTypeOf<TunnelResolver["resolve"]>().toEqualTypeOf<
      (endpoint: TunnelEndpoint) => Promise<TunnelTransport>
    >();
  });
});
