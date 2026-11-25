// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SpendAndSeats } from "../spend-and-seats.ts";
import { TeamDetails } from "../team-details.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SpendAndSeatsPage } from "./spend-and-seats-page.tsx";

afterEach(unmountAll);

const now = new Date("2026-11-24T13:00:00.000Z");
const clock = { now: () => now, timeZone: "UTC" };
const usd = (dollars: number) => ({ cents: Math.round(dollars * 100), currency: "USD" });

/** Acme as S24 draws it: money today and this month, Seat B near its limit, Seat D signed out. */
function acme() {
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource();
  const messaging = new FakeAgentMessaging({ now: () => now });
  const { id: chat } = messaging.addSource({ label: "Acme" });
  const names = ["Mateo", "Owen", "Kim", "Ada", "Ben", "Cy"];
  for (const [index, name] of names.entries()) {
    messaging.addAgent(chat, { id: `agent-${name}`, name, activity: "working" });
    team.addAgentSpend(source, { agent: `agent-${name}`, range: "today", paid: usd(9 - index) });
  }
  team.setSpend(source, { range: "today", paid: usd(41.2) });
  team.setSpend(source, { range: "month", paid: usd(977), budget: usd(1500) });
  team.addSeat(source, {
    label: "Seat B",
    state: "near-limit",
    windows: [
      {
        kind: "week",
        label: "This week",
        usedPercent: 62,
        resetsAt: "2026-11-25T06:00:00.000Z",
        reaches90At: "2026-11-24T13:40:00.000Z",
      },
    ],
  });
  team.addSeat(source, { label: "Seat D", state: "signed-out" });
  return {
    spendAndSeats: new SpendAndSeats(team, clock),
    details: new TeamDetails(team, messaging, clock),
  };
}

/** Renders the screen as a phone draws it and lets its reads land. */
async function openOnPhone(): Promise<HTMLElement> {
  const { spendAndSeats, details } = acme();
  const page = render(
    <PresentationProvider presentation="phone">
      <SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />
    </PresentationProvider>,
  );
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
  return page;
}

const headings = (page: HTMLElement) =>
  [...page.querySelectorAll("main h2")].map((heading) => heading.textContent);

const section = (page: HTMLElement, name: string) =>
  page.querySelector(`section[aria-label="${name}"]`)?.textContent ?? "";

verifies("team.spend-and-seats", () => {
  describe("SpendAndSeatsPage on a phone (HAL-17515 S24)", () => {
    it("heads its parts Needs you, Money and seats, Seats · this week and Agents by spend ›", async () => {
      const page = await openOnPhone();
      expect(headings(page)).toEqual([
        expect.stringMatching(/^Needs you/),
        "Money and seats",
        "Seats· , this week",
        "Agents by spend›",
      ]);
    });

    it("draws the tiles as rows with the table's shortened words", async () => {
      const page = await openOnPhone();
      const rows = [...page.querySelectorAll('[aria-label="Money and seats"] h3')].map(
        (title) => title.parentElement?.parentElement?.textContent,
      );
      expect(rows).toEqual([
        expect.stringMatching(/^Spent today\$41\.20/),
        expect.stringMatching(
          /^This month\$977 of \$1,500.*\$523 left · 6 days to go · at this pace \$1,221$/,
        ),
        "Seats this week38% left1 near its limit · 1 signed out · next refill Wed 06:00",
      ]);
      expect(page.querySelector('[aria-label="Money and seats"] h2')).not.toBeNull();
    });

    it("opens every agent from the Agents by spend heading, with no See all under the rows", async () => {
      const page = await openOnPhone();
      const agents = section(page, "Agents by spend today");
      expect(agents).not.toContain("See all");
      const heading = page.querySelector<HTMLButtonElement>("main h2 button");
      await act(async () => heading?.click());
      await act(async () => {
        for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
      });
      expect(page.textContent).toContain("Cy");
    });
  });
});
