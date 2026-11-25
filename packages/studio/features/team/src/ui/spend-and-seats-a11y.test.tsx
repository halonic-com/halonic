// @vitest-environment jsdom
import { ChevronRightIcon } from "@halonicjs/studio-kit";
import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendAndSeats } from "../spend-and-seats.ts";
import type { TeamLink } from "../team-words.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SpendAndSeatsPage } from "./spend-and-seats-page.tsx";

afterEach(unmountAll);

/** A fake at 24 Nov 13:00 UTC with one source. */
function acme() {
  const now = new Date("2026-11-24T13:00:00.000Z");
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource({});
  return { team, source, clock: () => now };
}

/** Renders the screen, with `onLink` only when `opened` is given, and lets its first read land. */
async function open(fake: ReturnType<typeof acme>, opened?: TeamLink[]) {
  const spendAndSeats = new SpendAndSeats(fake.team, { now: fake.clock, timeZone: "UTC" });
  const onLink = opened === undefined ? undefined : (link: TeamLink) => opened.push(link);
  const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} onLink={onLink} />);
  await settle();
  return page;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

/** The seat row or Needs you row that names this seat, as a button if it is one. */
function rowsNaming(page: HTMLElement, label: string): HTMLElement[] {
  return [...page.querySelectorAll("li > *")].filter(
    (each): each is HTMLElement =>
      each instanceof HTMLElement && each.textContent?.includes(label) === true,
  );
}

function tryAgain(page: HTMLElement): HTMLButtonElement {
  const found = [...page.querySelectorAll("button")].find(
    (each) => each.textContent === "Try again",
  );
  if (found === undefined) throw new Error("no Try again");
  return found;
}

verifies("team.spend-and-seats", () => {
  describe("SpendAndSeatsPage keyboard and screen readers (a11y check TM1–TM3)", () => {
    it("keeps the same h1 across a failed read and Try again, and focuses it", async () => {
      const fake = acme();
      const parts = fake.team.parts.bind(fake.team);
      let failing = true;
      fake.team.parts = () => (failing ? Promise.reject(new Error("no answer")) : parts());
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const page = await open(fake, []);
      const heading = page.querySelector("h1");
      tryAgain(page).focus();
      failing = false;
      act(() => tryAgain(page).click());
      await settle();
      expect(page.textContent).toContain("No seats are set up in Paperclip's AI seats page.");
      expect(page.querySelector("h1")).toBe(heading);
      expect(document.activeElement).toBe(heading);
      errors.mockRestore();
    });

    it("keeps the same h1 from Loading to the read", async () => {
      const fake = acme();
      const spendAndSeats = new SpendAndSeats(fake.team, { now: fake.clock, timeZone: "UTC" });
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} />);
      const heading = page.querySelector("h1");
      await settle();
      expect(page.querySelector('[aria-busy="true"]')).toBeNull();
      expect(page.querySelector("h1")).toBe(heading);
    });

    it("opens nothing from a seat or Needs you row while offline, and says why", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat C", state: "not-read" });
      fake.team.goOffline(fake.source);
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      const rows = rowsNaming(page, "Seat C");
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.tagName).toBe("BUTTON");
        act(() => row.click());
        expect(row.getAttribute("aria-disabled")).toBe("true");
        const reason = document.getElementById(row.getAttribute("aria-describedby") ?? "");
        expect(reason?.textContent).toContain("Offline, as of");
      }
      expect(opened).toEqual([]);
    });

    it("opens AI seats from a seat row while online", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat A" });
      const opened: TeamLink[] = [];
      const page = await open(fake, opened);
      const [row] = rowsNaming(page, "Seat A");
      expect(row?.hasAttribute("aria-disabled")).toBe(false);
      act(() => row?.click());
      expect(opened).toEqual(["ai-seats"]);
    });

    it("draws rows as plain cards with no › when nothing can open Paperclip", async () => {
      const fake = acme();
      fake.team.addSeat(fake.source, { label: "Seat C", state: "not-read" });
      const chevron = render(<ChevronRightIcon />).innerHTML;
      const page = await open(fake);
      const rows = rowsNaming(page, "Seat C");
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.tagName).not.toBe("BUTTON");
        expect(row.querySelector("button")).toBeNull();
        expect(row.innerHTML).not.toContain(chevron);
      }
    });
  });
});
