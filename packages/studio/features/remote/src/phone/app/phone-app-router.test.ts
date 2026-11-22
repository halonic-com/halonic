import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { ComputerId, PairedComputer } from "../phone-tunnel.ts";
import { PhoneAppRouter } from "./phone-app-router.ts";

const scanner: PhoneScanner = {
  scan: () => Promise.resolve({ kind: "closed" }),
  close: () => Promise.resolve(),
};

const laptop = "c-1" as ComputerId;
const desktop = "c-2" as ComputerId;

function paired(id: ComputerId, name: string, lastConnectedAt?: string): PairedComputer {
  return {
    id,
    name,
    pairedAt: "2026-11-14T10:00:00Z",
    ...(lastConnectedAt === undefined ? {} : { lastConnectedAt }),
    endpoints: ["wss://studio.tail1234.ts.net"],
    standing: "paired",
  };
}

function setUp(...computers: PairedComputer[]) {
  const tunnel = new FakePhoneTunnel();
  for (const computer of computers) tunnel.computers.set(computer.id, computer);
  const events: string[] = [];
  const router = new PhoneAppRouter({
    tunnel,
    scanner,
    report: () => undefined,
    hold: (computer) => ({ dispose: () => events.push(`dropped ${computer.id}`) }),
  });
  router.subscribe(() => {
    const { screen } = router.view;
    if (screen.screen !== "computer") {
      events.push(`shows ${screen.screen}`);
      return;
    }
    const shown = tunnel.computers.get(screen.computer);
    const state = shown?.standing === "unreadable" ? undefined : shown && router.stateOf(shown);
    events.push(`shows ${screen.computer} ${state ?? "no state"}`);
  });
  return { tunnel, router, events };
}

verifies("remote.phone-app", () => {
  it("with no paired computer it shows Pair with a computer", async () => {
    const { router } = setUp();
    await router.start();
    expect(router.view.screen.screen).toBe("pair");
    expect(router.back()).toBe(false);
  });

  it("it opens the computer connected last and connects to it", async () => {
    const { tunnel, router } = setUp(
      paired(laptop, "Tim's laptop", "2026-11-20T09:00:00Z"),
      paired(desktop, "Office desktop", "2026-11-21T09:00:00Z"),
    );
    await router.start();
    expect(router.view.screen).toEqual({ screen: "computer", computer: desktop, sheet: false });
    expect(tunnel.calls).toEqual([`connect ${desktop}`]);
  });

  it("Back closes the sheet, then leaves Paired computers", async () => {
    const { router } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    router.openSheet();
    expect(router.view.canGoBack).toBe(true);
    router.openComputers();
    expect(router.view.screen.screen).toBe("computers");
    router.pair();
    expect(router.back()).toBe(true);
    expect(router.back()).toBe(true);
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: false });
    expect(router.back()).toBe(false);
  });

  it("Removed drops what was held before any screen hears of it", async () => {
    const { tunnel, router, events } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    tunnel.push(laptop, { state: "connected" });
    events.length = 0;
    tunnel.push(laptop, { state: "removed" });
    expect(events).toEqual([`dropped ${laptop}`, `shows ${laptop} removed`]);
  });

  it("Can't confirm drops nothing", async () => {
    const { tunnel, router, events } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    events.length = 0;
    tunnel.push(laptop, { state: "cant-confirm" });
    expect(events).toEqual([`shows ${laptop} cantConfirm`]);
  });

  it("after Forget on its screen, the next computer shows, else Pair", async () => {
    const { tunnel, router } = setUp(
      paired(laptop, "Tim's laptop", "2026-11-21T09:00:00Z"),
      paired(desktop, "Office desktop", "2026-11-20T09:00:00Z"),
    );
    await router.start();
    const shown = tunnel.computers.get(laptop);
    if (shown === undefined) throw new Error("The laptop isn't listed.");
    await router.forget(shown);
    router.leaveForgotten();
    expect(router.view.screen).toEqual({ screen: "computer", computer: desktop, sheet: false });
    const next = tunnel.computers.get(desktop);
    if (next === undefined) throw new Error("The desktop isn't listed.");
    await router.forget(next);
    router.leaveForgotten();
    expect(router.view.screen.screen).toBe("pair");
  });
});
