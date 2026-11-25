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

/** A button's visible words without its icon, which is hidden from screen readers. */
function wordsOf(button: HTMLButtonElement): string {
  const copy = button.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? "";
}

function button(page: HTMLElement, label: string): HTMLButtonElement {
  const found = [...page.querySelectorAll("button")].find((each) => wordsOf(each) === label);
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

function press(page: HTMLElement, label: string): void {
  const found = button(page, label);
  act(() => found.click());
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
      expect(text(page)).toContain("$977 this month");
      expect(text(page)).toContain("No monthly budget set");
      press(page, "Set one in Paperclip");
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
      expect(text(page)).toContain("At least $41.20");
      expect(text(page)).toContain("560 runs not priced yet");
      expect(text(page)).toContain("Subscription seats used 41M tokens today.");
    });

    it("shows a month at 92% of its budget passing it before the month ends", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "month", paid: usd(1380), budget: usd(1500) });
      const page = await open(fake);
      expect(text(page)).toContain("$1,380 of $1,500");
      expect(text(page)).toContain("92%");
      expect(text(page)).toContain("$120 left · 6 days to go");
      expect(text(page)).toContain("At this pace you pass the budget around 27 Nov.");
    });

    it("says when this month's budget is used up", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "month", paid: usd(1500), budget: usd(1500) });
      const page = await open(fake);
      expect(text(page)).toContain("$1,500 of $1,500");
      expect(text(page)).toContain("100%");
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
      press(page, "Open Paperclip");
      expect(opened).toEqual(["paperclip"]);
    });

    it("says no seats are set up, with Open AI seats", async () => {
      const page = await open(acme());
      expect(text(page)).toContain("No seats are set up in Paperclip's AI seats page.");
      expect(page.querySelector("button")?.textContent).toContain("Open AI seats");
    });

    it("shows a seat whose read failed as not read, with its last good time", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T12:20:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat C", state: "not-read" });
      fake.setNow("2026-11-24T12:50:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat A" });
      const page = await open(fake);
      expect(text(page)).toContain("Not read");
      expect(text(page)).not.toContain("? Not read");
      expect(text(page)).toContain("last good 12:20");
    });

    it("shows a signed-out seat in its row and under Needs you", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T09:40:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat D", state: "signed-out", agents: ["a", "b"] });
      fake.setNow("2026-11-24T09:50:00.000Z");
      const page = await open(fake);
      expect(text(page)).toContain("Signed out · since 09:40");
      // The chip says since when; the time under the week's greyed bar says "last read" (S1, S6).
      expect(text(page)).not.toContain("Signed out · since 09:40 · last read");
      expect(text(page)).toContain("Seat D is signed out");
      expect(text(page)).toContain("Since 09:40 · 2 agents on it");
      // Signed out stops the seat's agents, as full does: the chip and the Needs you icon are both red.
      const chip = [...page.querySelectorAll("span.text-caption")].find(
        (each) => each.textContent === "Signed out · since 09:40",
      );
      expect(chip?.className).toContain("bg-danger-soft");
      const problem = page.querySelector('[aria-label="Needs you"] li span.text-danger');
      expect(problem?.querySelector("svg")).not.toBeNull();
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
      press(page, "Open AI seats");
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
      const heading = page.querySelector('[aria-label="Needs you"] h2')?.textContent;
      expect(heading).toMatch(/^Needs you.*1 problem$/);
      expect(text(page)).toContain("Seat B reaches 90% of its week around 13:40");
      expect(text(page)).toContain("Resets Thu 09:00 · 4 agents on it");
      expect(text(page)).toContain("Near limit");
      expect(text(page)).toContain("↗ 90% around 13:40");
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
      expect(text(page)).toContain("52% of pool left");
      expect(text(page)).toContain("None near their limit · Next refill Wed 06:00");
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

    it('writes a Needs you row as its two lines, never with the table\'s " / " mark', async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat D", state: "signed-out", agents: ["a"] });
      fake.team.addSeat(fake.source, {
        label: "Seat A",
        windows: [{ kind: "week", label: "This week", usedPercent: 94 }],
      });
      const page = await open(fake);
      const rows = [...page.querySelectorAll('[aria-label="Needs you"] li')];
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.textContent).not.toContain(" / ");
    });

    it("leaves out Needs you when no seats are set up", async () => {
      const page = await open(acme());
      expect(page.querySelector('[aria-label="Needs you"]')).toBeNull();
      expect(text(page)).not.toContain("Nothing needs you.");
    });

    it("shows a seat's State as a status chip in its tone, with the state's words", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, {
        label: "Seat B",
        state: "near-limit",
        windows: [
          {
            kind: "week",
            label: "This week",
            usedPercent: 84,
            reaches90At: "2026-11-24T13:40:00.000Z",
          },
        ],
      });
      const page = await open(fake);
      const chip = [...page.querySelectorAll("span.text-caption")].find(
        (each) => each.textContent === "Near limit",
      );
      expect(chip?.className).toContain("bg-attention-soft");
      // The state's symbol sits in the chip, and the forecast stays out of it.
      expect(chip?.querySelector("svg")).not.toBeNull();
    });

    it("keeps a seat's role whole when its name wraps", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat C" });
      const page = await open(fake);
      const role = [...page.querySelectorAll("li span.whitespace-nowrap")].map(
        (each) => each.textContent,
      );
      expect(role).toContain("· pool");
    });

    it("dates freshness and the offline banner from readings, not a signed-out seat's since", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T09:40:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat D", state: "signed-out" });
      fake.setNow("2026-11-24T13:00:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat A" });
      fake.setNow("2026-11-24T13:03:00.000Z");
      const page = await open(fake);
      expect(text(page)).toContain("As of 13:00 · 3 min ago");
      expect(text(page)).not.toContain("⚠");
      expect(text(page)).not.toContain("The seats job may have stopped.");
      fake.team.parts = () => Promise.reject(new Error("no answer"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      fake.team.addSeat(fake.source, { label: "Seat B" });
      await settle();
      expect(text(page)).toContain("Offline, as of 13:03.");
      errors.mockRestore();
    });

    it("counts seats near their limit the way Needs you does, not by their state", async () => {
      const fake = acme();
      for (const [label, usedPercent] of [
        ["Seat A", 94],
        ["Seat B", 82],
      ] as const) {
        fake.team.addSeat(fake.source, {
          label,
          windows: [{ kind: "week", label: "This week", usedPercent }],
        });
      }
      const page = await open(fake);
      const heading = page.querySelector('[aria-label="Needs you"] h2')?.textContent;
      expect(heading).toMatch(/^Needs you.*2 problems$/);
      expect(text(page)).not.toContain("None near their limit");
      expect(text(page)).toContain("2 near their limit");
    });

    it("shows the offline banner as of the newest cached answer, with its links off", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T12:10:00.000Z");
      fake.team.setSpend(fake.source, { range: "month", paid: usd(977) });
      fake.setNow("2026-11-24T12:20:00.000Z");
      fake.team.addSeat(fake.source, { label: "Seat A" });
      fake.team.goOffline(fake.source);
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      expect(text(page)).toContain("Offline, as of 12:20. Numbers stay as they were;");
      expect(text(page)).toContain("$977 this month");
      press(page, "Set one in Paperclip");
      expect(opened).toEqual([]);
      const off = button(page, "Set one in Paperclip");
      expect(off.getAttribute("aria-disabled")).toBe("true");
      const reasonIds = off.getAttribute("aria-describedby")?.split(" ") ?? [];
      const reasons = reasonIds.map((id) => document.getElementById(id)?.textContent);
      expect(reasons).toContain(
        "Offline, as of 12:20. Numbers stay as they were; opening things in Paperclip is off until Paperclip answers again.",
      );
      expect(button(page, "Try again").hasAttribute("aria-disabled")).toBe(false);
    });

    it("turns the links off under the banner when a later read fails", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "month", paid: usd(977) });
      const page = await open(fake);
      expect(button(page, "Set one in Paperclip").hasAttribute("aria-disabled")).toBe(false);
      fake.team.parts = () => Promise.reject(new Error("no answer"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      fake.team.setSpend(fake.source, { range: "month", paid: usd(980) });
      await settle();
      expect(button(page, "Set one in Paperclip").getAttribute("aria-disabled")).toBe("true");
      errors.mockRestore();
    });

    it("says why a seat's read failed, with its last good time and numbers, greyed", async () => {
      const fake = acme();
      fake.setNow("2026-11-24T12:20:00.000Z");
      fake.team.addSeat(fake.source, {
        label: "Seat C",
        failedRead: { cause: "rate-limited", at: "2026-11-24T12:55:00.000Z" },
        windows: [{ kind: "week", label: "This week", usedPercent: 61 }],
      });
      fake.setNow("2026-11-24T13:00:00.000Z");
      const page = await open(fake);
      const row = [...page.querySelectorAll("li .grid")].find((each) =>
        each.textContent?.includes("Seat C"),
      );
      // One symbol, the chip's ⓘ; "last good 12:20" sits under the greyed bar (S6).
      expect(row?.textContent).toContain("Not read · rate-limited");
      expect(row?.textContent).not.toContain("?");
      expect(row?.textContent).toContain("last good 12:20");
      expect(row?.textContent).toContain("61%");
      expect(row?.className).toContain("text-fg-muted");
    });

    it("says how many of today's runs have no known seat under Spent today", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "today", paid: usd(41.2), unknownSeatRuns: 3 });
      const page = await open(fake);
      expect(text(page)).toContain("Seat unknown for 3 runs");
    });

    it("leaves out the seat line when every run's seat is known", async () => {
      const fake = acme();
      fake.team.setSpend(fake.source, { range: "today", paid: usd(41.2), unknownSeatRuns: 0 });
      const page = await open(fake);
      expect(text(page)).not.toContain("Seat unknown");
    });

    it("draws no link buttons when nothing can open a Paperclip page", async () => {
      const fake = acme({ seats: false });
      const spendAndSeats = new SpendAndSeats(fake.team, { now: fake.clock, timeZone: "UTC" });
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} />);
      await settle();
      expect(text(page)).toContain("Seat use isn't available on this Paperclip yet.");
      expect(text(page)).not.toContain("Open Paperclip");
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
