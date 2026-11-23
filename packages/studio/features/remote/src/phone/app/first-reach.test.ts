import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { ComputerId, PairedComputer } from "../phone-tunnel.ts";
import { FIRST_REACH_LIMIT_MS } from "./first-reaches.ts";
import { PhoneAppRouter } from "./phone-app-router.ts";

const laptop = "c-1" as ComputerId;

const computer: PairedComputer = {
  id: laptop,
  name: "Tim's laptop",
  pairedAt: "2026-11-14T10:00:00Z",
  endpoints: ["wss://studio.tail1234.ts.net"],
  standing: "paired",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 10, 42));
});

afterEach(() => {
  vi.useRealTimers();
});

async function opened() {
  const tunnel = new FakePhoneTunnel();
  tunnel.computers.set(laptop, computer);
  const router = new PhoneAppRouter({
    tunnel,
    scanner: { scan: () => Promise.resolve({ kind: "closed" }), close: () => Promise.resolve() },
    report: () => undefined,
  });
  await router.start();
  return { tunnel, router };
}

verifies("remote.phone-first-reach", () => {
  it("waits for the first answer and gives up after 30 seconds", async () => {
    const { tunnel, router } = await opened();
    tunnel.push(laptop, { state: "connecting" });
    expect(router.reachOf(laptop)).toEqual({ since: new Date(), gaveUp: false });
    expect(router.stateOf(computer)).toBe("reconnecting");
    vi.advanceTimersByTime(FIRST_REACH_LIMIT_MS);
    expect(router.reachOf(laptop)?.gaveUp).toBe(true);
    expect(router.stateOf(computer)).toBe("unreachable");
  });

  it("gives up at once when a try fails, and stays given up while the tunnel tries again", async () => {
    const { tunnel, router } = await opened();
    tunnel.push(laptop, { state: "reconnecting", lastTry: "refused" });
    expect(router.reachOf(laptop)?.gaveUp).toBe(true);
    tunnel.push(laptop, { state: "reconnecting" });
    expect(router.stateOf(computer)).toBe("unreachable");
  });

  it("starts over on Try again, connecting at once and setting the old failure aside", async () => {
    const { tunnel, router } = await opened();
    tunnel.push(laptop, { state: "reconnecting", lastTry: "timeout" });
    vi.advanceTimersByTime(5_000);
    tunnel.calls.length = 0;
    router.tryAgain(laptop);
    expect(tunnel.calls).toEqual([`connect ${laptop}`]);
    expect(router.reachOf(laptop)).toEqual({ since: new Date(), gaveUp: false });
    expect(router.stateOf(computer)).toBeUndefined();
  });

  it("ends when the computer answers, so a later loss is the stale banner's", async () => {
    const { tunnel, router } = await opened();
    tunnel.push(laptop, { state: "connected" });
    expect(router.reachOf(laptop)).toBeUndefined();
    tunnel.push(laptop, { state: "reconnecting", lastTry: "timeout" });
    vi.advanceTimersByTime(FIRST_REACH_LIMIT_MS);
    expect(router.reachOf(laptop)).toBeUndefined();
    expect(router.stateOf(computer)).toBe("unreachable");
  });

  it("leaves an offline phone to the stale banner's offline state", async () => {
    const { tunnel, router } = await opened();
    tunnel.push(laptop, { state: "reconnecting", lastTry: "network-down" });
    vi.advanceTimersByTime(FIRST_REACH_LIMIT_MS);
    expect(router.stateOf(computer)).toBe("phoneOffline");
  });

  it("opens Check this connection as the screen's sheet, and Back closes it", async () => {
    const { router } = await opened();
    router.openCheck();
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "check" });
    expect(router.back()).toBe(true);
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "none" });
  });
});
