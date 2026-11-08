import { maxIntegrationWaitMs } from "@halonicjs/ports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeTransport, memoryTokens, policy, secrets } from "./fake-transport.test-helper.ts";
import { createIntegrationHost } from "./host.ts";
import { clampWaitMs, integrationWait } from "./wait.ts";

describe("integration-kit.wait-capped", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clamps the pause to 0 … 30 000 ms", () => {
    expect(clampWaitMs(2_000)).toBe(2_000);
    expect(clampWaitMs(Number.NaN)).toBe(0);
    expect(clampWaitMs(-5)).toBe(0);
    expect(clampWaitMs(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clampWaitMs(Number.POSITIVE_INFINITY)).toBe(maxIntegrationWaitMs);
    expect(clampWaitMs(maxIntegrationWaitMs + 1)).toBe(maxIntegrationWaitMs);
  });

  it("resolves after the pause the server asked for, and not before", async () => {
    let done = false;
    const waiting = integrationWait(2_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });

  it("waits at most 30 seconds, even for Infinity", async () => {
    let done = false;
    const waiting = integrationWait(Number.POSITIVE_INFINITY).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(maxIntegrationWaitMs);
    await waiting;
    expect(done).toBe(true);
  });

  it("rejects with the reason of an already aborted signal and starts no timer", async () => {
    const reason = new Error("call cancelled");
    await expect(integrationWait(2_000, AbortSignal.abort(reason))).rejects.toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with the reason when the signal aborts during the wait, and clears the timer", async () => {
    const controller = new AbortController();
    const reason = new Error("call cancelled");
    const waiting = integrationWait(10_000, controller.signal);
    await vi.advanceTimersByTimeAsync(500);
    controller.abort(reason);
    await expect(waiting).rejects.toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is the host's wait", async () => {
    const { host } = createIntegrationHost({
      policy,
      transport: fakeTransport().transport,
      secrets,
      tokens: memoryTokens(),
    });
    const waiting = host.wait(Number.NaN);
    await vi.advanceTimersByTimeAsync(0);
    await expect(waiting).resolves.toBeUndefined();
  });
});
