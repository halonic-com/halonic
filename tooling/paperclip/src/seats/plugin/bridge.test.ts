import { verifies } from "@halonicjs/testing-spec";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { expect, test } from "vitest";
import { registerSeatsBridge } from "./bridge.ts";
import { manualResetActionKey, seatsPageDataKey } from "./bridge-keys.ts";
import { manifest } from "./manifest.ts";
import type { SeatsRouteDeps } from "./routes.ts";
import type { SeatsPage } from "./seats-page.ts";
import { readSeatsSettings } from "./settings.ts";
import type { StoredSeatEvent } from "./store.ts";

// Made-up seats only: no real folder, account or company.
const config = {
  seats: [
    { id: "seat-a", role: "pool", configDir: "/srv/seats/seat-a", resetGroup: "g1" },
    { id: "seat-b", role: "pool", configDir: "/srv/seats/seat-b", resetGroup: "g1" },
  ],
};

function setup() {
  const events: StoredSeatEvent[] = [];
  const settingsRead: string[] = [];
  const deps: SeatsRouteDeps = {
    readSettings: async (companyId) => {
      settingsRead.push(companyId);
      return readSeatsSettings(config);
    },
    store: {
      recordEvent: async (event) => void events.push(event),
      recordReading: async () => undefined,
      manualResets: async () => events.filter((event) => event.kind === "manual-reset"),
      removeOld: async () => undefined,
    },
    now: () => new Date("2026-11-22T11:00:00.000Z"),
    reads: () => ({ readerStartedAt: "2026-11-22T10:00:00.000Z", seats: [] }),
    seatsNow: async () => ({ seats: [], placements: new Map(), agentNames: new Map() }),
    unknownSeatRuns: async () => 0,
  };
  const harness = createTestHarness({ manifest });
  registerSeatsBridge(harness.ctx, deps);
  return { harness, events, settingsRead };
}

const boardUser = { actor: { type: "user", userId: "user-1" }, companyId: "acme" } as const;

verifies("paperclip.seats-page-view", () => {
  test("an agent can't record a manual reset through the page's action", async () => {
    const { harness, events, settingsRead } = setup();
    await expect(
      harness.performAction(
        manualResetActionKey,
        { seatId: "seat-a" },
        { actor: { type: "agent", agentId: "agent-1" }, companyId: "acme" },
      ),
    ).rejects.toThrow("Only the board can record a manual reset.");
    expect(events).toEqual([]);
    expect(settingsRead).toEqual([]);
  });

  test("a board user records one manual reset per reset group", async () => {
    const { harness, events } = setup();
    await harness.performAction(manualResetActionKey, { seatId: "seat-a" }, boardUser);
    expect(events).toEqual([
      {
        seatId: "seat-a",
        kind: "manual-reset",
        at: "2026-11-22T11:00:00.000Z",
        by: "board",
        boardUserId: "user-1",
      },
    ]);
    await expect(
      harness.performAction(manualResetActionKey, { seatId: "seat-b" }, boardUser),
    ).rejects.toThrow("already recorded for seat-a at 2026-11-22T11:00:00.000Z");
    expect(events).toHaveLength(1);
  });

  test("a manual reset needs a company", async () => {
    const { harness, events } = setup();
    await expect(
      harness.performAction(
        manualResetActionKey,
        { seatId: "seat-a" },
        { actor: { type: "user", userId: "user-1" } },
      ),
    ).rejects.toThrow("needs a company");
    expect(events).toEqual([]);
  });

  test("the page's data comes for the company the bridge hands", async () => {
    const { harness, settingsRead } = setup();
    const page = await harness.getData<SeatsPage>(seatsPageDataKey, { companyId: "acme" });
    expect(page.seats).toEqual([]);
    expect(page.at).toBe("2026-11-22T11:00:00.000Z");
    expect(settingsRead).toEqual(["acme"]);
    await expect(harness.getData(seatsPageDataKey, {})).rejects.toThrow("needs a company");
  });

  test("the manifest declares the page and the capability it needs", () => {
    expect(manifest.entrypoints.ui).toBe("ui");
    expect(manifest.capabilities).toContain("ui.page.register");
    expect(manifest.ui?.slots).toEqual([
      {
        type: "page",
        id: "seats",
        displayName: "AI seats",
        exportName: "SeatsPage",
        routePath: "seats",
      },
    ]);
  });
});
