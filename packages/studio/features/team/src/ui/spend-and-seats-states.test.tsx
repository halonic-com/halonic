// @vitest-environment jsdom

import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendAndSeats } from "../spend-and-seats.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SpendAndSeatsPage } from "./spend-and-seats-page.tsx";

afterEach(unmountAll);

/** A fake whose clock a test can move, starting at 24 Nov 13:00 UTC. */
function acme() {
  let now = new Date("2026-11-24T13:00:00.000Z");
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource();
  const setNow = (at: string) => {
    now = new Date(at);
  };
  return { team, source, setNow, clock: () => now };
}

/** Renders the screen and lets its first read land. */
async function open(fake: ReturnType<typeof acme>) {
  const spendAndSeats = new SpendAndSeats(fake.team, { now: fake.clock, timeZone: "UTC" });
  const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} onLink={() => {}} />);
  await settle();
  return page;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

const text = (page: HTMLElement) => page.textContent ?? "";

/** The seat row whose words name this seat. */
function rowOf(page: HTMLElement, label: string): Element | undefined {
  return [...page.querySelectorAll("li .grid")].find((each) => each.textContent?.includes(label));
}

/** Whether a row's week meter is drawn greyed: its fill is the disabled grey. */
function greyed(row: Element | undefined): boolean {
  return row !== undefined && row.querySelector(".bg-fg-disabled") !== null;
}

// HAL-18326, from Noah's visual check against HAL-17515 s01, s06, s09 and the wording's Shared rows.
verifies("team.spend-and-seats", () => {
  describe("Spend and seats states", () => {
    it("keeps one seat's failed read to its row, with no page-wide old-readings warning", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T12:20:00.000Z");
      fake.team.addSeat(fake.source, {
        label: "Seat C",
        failedRead: { cause: "rate-limited", at: "2026-11-24T13:00:00.000Z" },
        windows: [{ kind: "week", label: "This week", usedPercent: 61 }],
      });
      fake.setNow("2026-11-24T12:58:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat A" });
      fake.setNow("2026-11-24T13:03:00.000Z");
      const page = await open(fake);
      expect(text(page)).not.toContain("Seat readings are");
      expect(text(page)).not.toContain("⚠");
      expect(text(page)).toContain("As of 12:58 · 5 min ago");
      expect(rowOf(page, "Seat C")?.textContent).toContain("last good 12:20");
    });

    it("greys a signed-out seat's week bar and says when it was last read", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T09:40:00.000Z");
      fake.team.addSeat(fake.source, {
        label: "Seat D",
        state: "signed-out",
        windows: [{ kind: "week", label: "This week", usedPercent: 40 }],
      });
      fake.setNow("2026-11-24T13:00:00.000Z");
      fake.team.addSeat(fake.source, {
        label: "Seat A",
        windows: [{ kind: "week", label: "This week", usedPercent: 40 }],
      });
      const page = await open(fake);
      expect(rowOf(page, "Seat D")?.textContent).toContain("last read 09:40");
      expect(greyed(rowOf(page, "Seat D"))).toBe(true);
      expect(greyed(rowOf(page, "Seat A"))).toBe(false);
    });

    it("says offline in the freshness line, with the last good read's time", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat A" });
      fake.setNow("2026-11-24T13:03:00.000Z");
      const page = await open(fake);
      expect(text(page)).toContain("As of 13:00 · 3 min ago");
      fake.team.parts = () => Promise.reject(new Error("no answer"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      fake.team.addSeat(fake.source, { label: "Seat B" });
      await settle();
      expect(text(page)).toContain("As of 13:03 · offline");
      expect(text(page)).not.toContain("min ago");
      errors.mockRestore();
    });

    it("draws the offline banner and the tiles' warning lines in amber, not violet", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat A" });
      const page = await open(fake);
      fake.team.parts = () => Promise.reject(new Error("no answer"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      fake.team.addSeat(fake.source, { label: "Seat B" });
      await settle();
      expect(page.querySelector(".bg-attention-soft")?.textContent).toContain("Offline, as of");
      expect(page.querySelector(".bg-warning-soft")).toBeNull();
      errors.mockRestore();
    });
  });
});
