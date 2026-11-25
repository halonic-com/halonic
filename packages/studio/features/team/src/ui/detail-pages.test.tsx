// @vitest-environment jsdom
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

/** Acme: seven agents that spent today, Mateo and Owen on Seat B with a proposal. */
function acme() {
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource();
  const messaging = new FakeAgentMessaging({ now: () => now });
  const { id: chat } = messaging.addSource({ label: "Acme" });
  const names = ["Mateo", "Owen", "Kim", "Ada", "Ben", "Cy", "Di"];
  for (const [index, name] of names.entries()) {
    messaging.addAgent(chat, { id: `agent-${name}`, name, activity: "working" });
    team.addAgentSpend(source, { agent: `agent-${name}`, range: "today", paid: usd(20 - index) });
  }
  team.addAgentSpend(source, { agent: "agent-Mateo", range: "week", paid: usd(61.3) });
  team.addAgentSpend(source, { agent: "agent-Mateo", range: "month", paid: usd(402.1) });
  team.addSeat(source, {
    label: "Seat B",
    agents: ["agent-Mateo", "agent-Owen"],
    windows: [{ kind: "week", label: "This week", usedPercent: 84 }],
    proposal: { text: "Move Owen to Seat C", at: "2026-11-24T12:55:00.000Z" },
  });
  const spendAndSeats = new SpendAndSeats(team, clock);
  const details = new TeamDetails(team, messaging, clock);
  return { spendAndSeats, details };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

async function press(page: HTMLElement, text: string, within = "main"): Promise<void> {
  const target = [
    ...(page.querySelector(within) ?? page).querySelectorAll<HTMLElement>(
      "button, [role=button], a",
    ),
  ].find((each) => each.textContent?.includes(text));
  if (target === undefined) throw new Error(`Nothing to press says "${text}"`);
  await act(async () => target.click());
  await settle();
}

const section = (page: HTMLElement, name: string) =>
  page.querySelector(`section[aria-label="${name}"]`)?.textContent ?? "";

verifies("team.agent-and-seat-detail", () => {
  describe("the Team detail pages", () => {
    it("lists the top 5 agents by spend today, and See all lists all seven", async () => {
      const { spendAndSeats, details } = acme();
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />);
      await settle();
      const list = section(page, "Agents by spend today");
      expect(list).toContain("Mateo · $20.00");
      expect(list).toContain("Ben");
      expect(list).not.toContain("Cy");
      await press(page, "See all 7");
      expect(section(page, "Agents by spend today")).toContain("Di");
    });

    it("opens a seat from its row, then an agent from the seat", async () => {
      const { spendAndSeats, details } = acme();
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />);
      await settle();
      await press(page, "Seat B", 'section[aria-label="Seats"]');
      expect(page.textContent).toContain("84%");
      expect(section(page, "Agents on Seat B (2)")).toContain("Owen · Working");
      expect(section(page, "Seat Supervisor proposes")).toContain("(from 12:55, not done)");

      await press(page, "Mateo");
      expect(page.textContent).toContain("$20.00");
      expect(page.textContent).toContain("$61.30");
      expect(page.textContent).toContain("$402.10");
      expect(page.textContent).toContain("On: Seat B");

      await press(page, "Back");
      expect(section(page, "Agents by spend today")).toContain("Mateo");
    });

    it("focuses a detail page's h1 when it opens, and the pressed seat row on Back", async () => {
      const { spendAndSeats, details } = acme();
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />);
      await settle();
      await press(page, "Seat B", 'section[aria-label="Seats"]');
      expect(document.activeElement).toBe(page.querySelector("h1"));

      await press(page, "Back");
      const seatRow = page.querySelector('section[aria-label="Seats"] li button');
      expect(seatRow).not.toBeNull();
      expect(document.activeElement).toBe(seatRow);
    });

    it("keeps a detail page's h1 the same element when its read lands", async () => {
      const { spendAndSeats, details } = acme();
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />);
      await settle();
      const seatRow = page.querySelector<HTMLElement>('section[aria-label="Seats"] li button');
      if (seatRow === null) throw new Error("No seat row");
      act(() => seatRow.click());
      const before = page.querySelector("h1");
      expect(page.querySelector("main")?.getAttribute("aria-busy")).toBe("true");
      await settle();
      expect(page.textContent).toContain("84%");
      expect(page.querySelector("h1")).toBe(before);
      expect(document.activeElement).toBe(before);
    });

    it("keeps seat rows opening AI seats where there are no detail pages", async () => {
      const { spendAndSeats } = acme();
      const opened: string[] = [];
      const page = render(
        <SpendAndSeatsPage spendAndSeats={spendAndSeats} onLink={(link) => opened.push(link)} />,
      );
      await settle();
      expect(section(page, "Agents by spend today")).toBe("");
      await press(page, "Seat B", 'section[aria-label="Seats"]');
      expect(opened).toEqual(["ai-seats"]);
    });
  });
});
