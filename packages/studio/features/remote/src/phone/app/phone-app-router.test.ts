import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FakePhoneRemote } from "../../test-support/fake-phone-remote.ts";
import { FakeSavedDataStore } from "../../test-support/fake-saved-data-store.ts";
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
  const saved = new FakeSavedDataStore();
  const router = new PhoneAppRouter({
    tunnel,
    scanner,
    saved,
    report: () => undefined,
    hold: (computer) =>
      Object.assign(new FakePhoneRemote(), {
        dispose: () => events.push(`dropped ${computer.id}`),
      }),
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
  return { tunnel, router, events, saved };
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
    expect(router.view.screen).toEqual({ screen: "computer", computer: desktop, sheet: "none" });
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
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "none" });
    expect(router.back()).toBe(false);
  });

  it("Paired computers closes the sheet and opens in one change (C48 HB1)", async () => {
    const { router, events } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    router.openSheet();
    events.length = 0;
    router.openComputers();
    expect(events).toEqual(["shows computers"]);
    expect(router.view.canGoBack).toBe(true);
    expect(router.back()).toBe(true);
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "none" });
  });

  it("Back on a pairing step of the first screen goes back to its start (C48 BK1)", async () => {
    const { router } = setUp();
    await router.start();
    const { screen } = router.view;
    if (screen.screen !== "pair") throw new Error("Pair with a computer isn't showing.");
    screen.flow.typeInstead();
    expect(router.view.canGoBack).toBe(true);
    expect(router.back()).toBe(true);
    expect(screen.flow.view.step).toBe("start");
    expect(router.view.canGoBack).toBe(false);
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

  it("a tapped agent's run detail shows on the computer's screen, and Back leaves it", async () => {
    const { router } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    expect(router.remoteOf(laptop)).toBeInstanceOf(FakePhoneRemote);
    router.openRun("s-1");
    expect(router.view.screen).toEqual({
      screen: "computer",
      computer: laptop,
      sheet: "none",
      run: "s-1",
    });
    expect(router.view.canGoBack).toBe(true);
    router.openSheet();
    expect(router.back()).toBe(true);
    expect(router.view.screen).toMatchObject({ sheet: "none", run: "s-1" });
    expect(router.back()).toBe(true);
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "none" });
    expect(router.back()).toBe(false);
  });

  it("Removed closes the run detail and drops the computer's agents", async () => {
    const { tunnel, router } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    tunnel.push(laptop, { state: "connected" });
    router.openRun("s-1");
    tunnel.push(laptop, { state: "removed" });
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "none" });
    expect(router.remoteOf(laptop)).toBeUndefined();
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
    expect(router.view.screen).toEqual({ screen: "computer", computer: desktop, sheet: "none" });
    // The app says it, since the screen that asked has gone (C48 ST1).
    expect(router.view.forgotten).toBe(shown);
    const next = tunnel.computers.get(desktop);
    if (next === undefined) throw new Error("The desktop isn't listed.");
    await router.forget(next);
    expect(router.view.screen.screen).toBe("pair");
    expect(router.view.canGoBack).toBe(false);
  });

  it("after Forget in Paired computers, Back skips the forgotten computer", async () => {
    const { tunnel, router } = setUp(
      paired(laptop, "Tim's laptop", "2026-11-21T09:00:00Z"),
      paired(desktop, "Office desktop", "2026-11-20T09:00:00Z"),
    );
    await router.start();
    router.openComputers();
    const shown = tunnel.computers.get(laptop);
    if (shown === undefined) throw new Error("The laptop isn't listed.");
    await router.forget(shown);
    expect(router.view.screen.screen).toBe("computers");
    // Paired computers says it itself.
    expect(router.view.forgotten).toBeUndefined();
    expect(router.back()).toBe(true);
    expect(router.view.screen).toEqual({ screen: "computer", computer: desktop, sheet: "none" });
    expect(router.back()).toBe(false);
  });

  it("after Forget of the last computer in Paired computers, Back shows Pair", async () => {
    const { tunnel, router } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    router.openComputers();
    const shown = tunnel.computers.get(laptop);
    if (shown === undefined) throw new Error("The laptop isn't listed.");
    await router.forget(shown);
    expect(router.back()).toBe(true);
    expect(router.view.screen.screen).toBe("pair");
    expect(router.back()).toBe(false);
  });

  it("Back from Check the code ends the pairing on both sides", async () => {
    const { tunnel, router } = setUp(paired(laptop, "Tim's laptop"));
    tunnel.waitForAllow = () => new Promise(() => undefined);
    await router.start();
    router.pair();
    const { screen } = router.view;
    if (screen.screen !== "pair") throw new Error("Pair with a computer isn't showing.");
    screen.flow.pairTyped("4F7 2KQ", {
      name: "Tim's laptop",
      endpoint: "ws://10.0.0.2",
      wifi: true,
    });
    await vi.waitFor(() => expect(screen.flow.view.step).toBe("check"));
    expect(router.back()).toBe(true);
    expect(tunnel.calls).toContain("cancel pairing-1");
    expect(router.view.screen).toEqual({ screen: "computer", computer: laptop, sheet: "none" });
  });
});

verifies("remote.phone-saved-messaging", () => {
  it("Forget and Removed delete what the phone saved of that computer", async () => {
    const { tunnel, router, saved } = setUp(
      paired(laptop, "Tim's laptop"),
      paired(desktop, "Desk"),
    );
    await router.start();
    tunnel.push(desktop, { state: "removed" });
    const shown = tunnel.computers.get(laptop);
    if (shown === undefined) throw new Error("The laptop isn't listed.");
    await router.forget(shown);
    expect(saved.cleared).toEqual([desktop, laptop]);
  });

  it("Can't confirm keeps what the phone saved", async () => {
    const { tunnel, router, saved } = setUp(paired(laptop, "Tim's laptop"));
    await router.start();
    tunnel.push(laptop, { state: "cant-confirm" });
    expect(saved.cleared).toEqual([]);
  });
});
