import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SpendAndSeats } from "./spend-and-seats.ts";

const now = new Date("2026-11-24T13:00:00.000Z");

/** A seat at this share of its week, read now. */
const atPercent = (label: string, usedPercent: number) => ({
  label,
  windows: [{ kind: "week" as const, label: "This week", usedPercent }],
});

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

verifies("team.spend-and-seats", () => {
  describe("SpendAndSeats.signal", () => {
    it("counts the problems in Needs you, leaving out the quiet 80% ones", async () => {
      const team = new FakeTeamStatus({ now: () => now });
      const { source } = team.addSource();
      team.addSeat(source, { label: "Seat D", state: "signed-out" });
      team.addSeat(source, atPercent("Seat A", 94));
      team.addSeat(source, atPercent("Seat B", 82));
      const spendAndSeats = new SpendAndSeats(team, { now: () => now });
      let calls = 0;
      const stop = spendAndSeats.watchSignal(() => {
        calls += 1;
      });
      await settle();
      expect(spendAndSeats.signal()).toEqual({ mark: "problems", value: 2, spoken: "2 problems" });
      expect(calls).toBe(1);

      team.addSeat(source, { label: "Seat E", state: "full" });
      await settle();
      expect(spendAndSeats.signal().value).toBe(3);
      expect(calls).toBe(2);
      stop();
    });

    it("tells every watcher about a change, not only the first to read it", async () => {
      const team = new FakeTeamStatus({ now: () => now });
      const { source } = team.addSource();
      const spendAndSeats = new SpendAndSeats(team, { now: () => now });
      const heard = { window: 0, sidebar: 0 };
      const stopWindow = spendAndSeats.watchSignal(() => {
        heard.window += 1;
      });
      const stopSidebar = spendAndSeats.watchSignal(() => {
        heard.sidebar += 1;
      });
      await settle();
      team.addSeat(source, { label: "Seat E", state: "full" });
      await settle();
      expect(spendAndSeats.signal().value).toBe(1);
      expect(heard).toEqual({ window: 1, sidebar: 1 });
      stopWindow();
      stopSidebar();
    });

    it("counts nothing where nothing serves TeamStatus", async () => {
      const spendAndSeats = new SpendAndSeats(undefined, { now: () => now });
      const stop = spendAndSeats.watchSignal(() => {});
      await settle();
      expect(spendAndSeats.signal().value).toBe(0);
      stop();
    });
  });

  describe("SpendAndSeats.read", () => {
    it("gives the newest cached answer's time for the offline banner, and none when live", async () => {
      let at = new Date("2026-11-24T12:10:00.000Z");
      const team = new FakeTeamStatus({ now: () => at });
      const { source } = team.addSource();
      team.setSpend(source, { range: "today", paid: { cents: 100, currency: "USD" } });
      at = new Date("2026-11-24T12:20:00.000Z");
      team.addSeat(source, { label: "Seat A" });
      const spendAndSeats = new SpendAndSeats(team, { now: () => now });
      expect((await spendAndSeats.read())?.offlineAsOf).toBeUndefined();
      team.goOffline(source);
      const offline = await spendAndSeats.read();
      expect(offline?.offlineAsOf).toBe("2026-11-24T12:20:00.000Z");
      expect(offline?.asOf).toBe("2026-11-24T12:10:00.000Z");
    });
  });
});
