// @vitest-environment jsdom
import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendAndSeats } from "../spend-and-seats.ts";
import type { TeamLink } from "../team-words.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SpendAndSeatsPage } from "./spend-and-seats-page.tsx";

afterEach(unmountAll);

const usd = (dollars: number) => ({ cents: Math.round(dollars * 100), currency: "USD" });

/** A fake whose clock a test can move, starting at 24 Nov 13:00 UTC. */
function acme(parts: { spend?: boolean; seats?: boolean } = {}) {
  let now = new Date("2026-11-24T13:00:00.000Z");
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource(parts);
  const setNow = (at: string) => {
    now = new Date(at);
  };
  return { team, source, setNow, clock: () => now };
}

/** Renders the screen and lets its first read land; `opened` collects the buttons pressed. */
async function open(fake: ReturnType<typeof acme>, opened: TeamLink[] = []) {
  const spendAndSeats = new SpendAndSeats(fake.team, { now: fake.clock, timeZone: "UTC" });
  const page = render(
    <SpendAndSeatsPage spendAndSeats={spendAndSeats} onLink={(link) => opened.push(link)} />,
  );
  await settle();
  return page;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

async function pressAndSettle(page: HTMLElement, label: string): Promise<void> {
  press(page, label);
  await settle();
}

const text = (page: HTMLElement) => page.textContent ?? "";

function press(page: HTMLElement, label: string): void {
  const button = [...page.querySelectorAll("button")].find((each) => each.textContent === label);
  if (button === undefined) throw new Error(`no button ${label}`);
  act(() => button.click());
}

verifies("team.spend-and-seats", () => {
  describe("SpendAndSeatsPage", () => {
    it("says Loading… until the first read lands", () => {
      const fake = acme();
      const spendAndSeats = new SpendAndSeats(fake.team, { now: fake.clock, timeZone: "UTC" });
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} onLink={() => {}} />);
      expect(page.querySelector('[aria-label="Loading spend and seats"]')?.textContent).toContain(
        "Loading…",
      );
    });

    it("shows a month with no budget set, with Set one in Paperclip", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "month", paid: usd(977) });
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      expect(text(page)).toContain("$977 this month · No monthly budget set");
      press(page, "Set one in Paperclip ↗");
      expect(opened).toEqual(["set-budget"]);
    });

    it("shows Spent today as at least the priced part, with tokens on its second line", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, {
        range: "today",
        paid: usd(41.2),
        unpricedRuns: 560,
        tokens: { input: 30_000_000, cached: 10_000_000, output: 1_000_000 },
      });
      const page = await open(fake);
      expect(text(page)).toContain("At least $41.20 · 560 runs not priced yet");
      expect(text(page)).toContain("Subscription seats used 41M tokens today.");
    });

    it("shows a month at 92% of its budget passing it before the month ends", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "month", paid: usd(1380), budget: usd(1500) });
      const page = await open(fake);
      expect(text(page)).toContain("$1,380 of $1,500 · 92%");
      expect(text(page)).toContain("$120 left · 6 days to go");
      expect(text(page)).toContain("At this pace you pass the budget around 27 Nov.");
    });

    it("says when this month's budget is used up", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "month", paid: usd(1500), budget: usd(1500) });
      const page = await open(fake);
      expect(text(page)).toContain("$1,500 of $1,500 · 100%");
      expect(text(page)).toContain(
        "This month's budget is used up. Paperclip stops agents whose budget is used up.",
      );
    });

    it("says seat use isn't available when the AI seats plugin isn't there, and still shows money", async () => {
      const fake = acme({ seats: false });
      fake.team.setSpend(fake.source, { range: "today", paid: usd(41.2) });
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      expect(text(page)).toContain("Seat use isn't available on this Paperclip yet.");
      expect(text(page)).toContain("$41.20");
      press(page, "Open Paperclip ↗");
      expect(opened).toEqual(["paperclip"]);
    });

    it("says no seats are set up, with Open AI seats", async () => {
      const page = await open(acme());
      expect(text(page)).toContain("No seats are set up in Paperclip's AI seats page.");
      expect(text(page)).toContain("Open AI seats ↗");
    });

    it("shows a seat whose read failed as not read, with its last good time", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T12:20:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat C", state: "not-read" });
      fake.setNow("2026-11-24T12:50:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat A" });
      const page = await open(fake);
      expect(text(page)).toContain("? Not read · last good 12:20");
    });

    it("shows a signed-out seat in its row and under Needs you", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T09:40:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat D", state: "signed-out", agents: ["a", "b"] });
      fake.setNow("2026-11-24T09:50:00.000Z");
      const page = await open(fake);
      expect(text(page)).toContain("Signed out · since 09:40");
      expect(text(page)).not.toContain("last read");
      expect(text(page)).toContain("Seat D is signed out / Since 09:40 · 2 agents on it");
    });

    it("warns when every seat reading is older than 30 minutes", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T12:18:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat A" });
      fake.setNow("2026-11-24T13:00:00.000Z");
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      expect(text(page)).toContain("Seat readings are 42 min old. The seats job may have stopped.");
      expect(text(page)).toContain("⚠ As of 12:18 · 42 min ago");
      press(page, "Open AI seats ↗");
      expect(opened).toEqual(["ai-seats"]);
    });

    it("lists a seat reaching 90% within an hour under Needs you, with its forecast in its row", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, {
        label: "Seat B",
        state: "near-limit",
        agents: ["a", "b", "c", "d"],
        windows: [
          {
            kind: "week",
            label: "This week",
            usedPercent: 84,
            resetsAt: "2026-11-26T09:00:00.000Z",
            reaches90At: "2026-11-24T13:40:00.000Z",
          },
        ],
      });
      const page = await open(fake);
      expect(text(page)).toContain("Needs you · 1 problem");
      expect(text(page)).toContain(
        "Seat B reaches 90% of its week around 13:40 / Resets Thu 09:00 · 4 agents on it",
      );
      expect(text(page)).toContain("Near limit · ↗ 90% around 13:40");
      expect(text(page)).toContain("1 near its limit");
    });

    it("says nothing needs the board when every seat is under 80%", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, {
        label: "Seat A",
        windows: [
          {
            kind: "week",
            label: "This week",
            usedPercent: 48,
            resetsAt: "2026-11-25T06:00:00.000Z",
          },
        ],
      });
      const page = await open(fake);
      expect(text(page)).toContain("Nothing needs you. All seats are under 80%.");
      expect(text(page)).toContain(
        "52% of pool left · None near their limit · Next refill Wed 06:00",
      );
    });

    it("says the connection can't read spend, with Connect again", async () => {
      const fake = acme({ spend: false });
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      expect(text(page)).toContain(
        "This connection can't read spend yet. Connect again to allow it.",
      );
      press(page, "Connect again");
      expect(opened).toEqual(["connect-again"]);
    });

    it("says a seat at 94% of its week has used 94%, not the 90% threshold", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, {
        label: "Seat A",
        windows: [{ kind: "week", label: "This week", usedPercent: 94 }],
      });
      const page = await open(fake);
      expect(text(page)).toContain("Seat A has used 94% of its week");
    });

    it("says Paperclip isn't answering when the first read fails, and reads again on Try again", async () => {
      const fake = acme();
      const parts = fake.team.parts.bind(fake.team);
      let failing = true;
      fake.team.parts = () => (failing ? Promise.reject(new Error("no answer")) : parts());
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const page = await open(fake);
      expect(text(page)).toContain("Paperclip isn't answering.");
      expect(text(page)).not.toContain("Loading…");
      failing = false;
      await pressAndSettle(page, "Try again");
      expect(text(page)).toContain("No seats are set up in Paperclip's AI seats page.");
      errors.mockRestore();
    });

    it("keeps the numbers under the offline banner when a later read fails", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "today", paid: usd(41.2) });
      const page = await open(fake);
      fake.team.parts = () => Promise.reject(new Error("no answer"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      fake.team.setSpend(fake.source, { range: "today", paid: usd(50) });
      await settle();
      expect(text(page)).toContain("Offline, as of 13:00. Numbers stay as they were;");
      expect(text(page)).toContain("$41.20");
      errors.mockRestore();
    });

    it("shows a seat's label as plain text", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "<b>Seat</b> [x](javascript:alert(1))" });
      const page = await open(fake);
      expect(page.querySelector("b, a")).toBeNull();
      expect(text(page)).toContain("<b>Seat</b> [x](javascript:alert(1)) · pool");
    });
  });
});
