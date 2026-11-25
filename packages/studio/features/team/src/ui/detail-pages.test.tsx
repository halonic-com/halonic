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
  team.addAgentSpend(source, {
    agent: "agent-Mateo",
    range: "month",
    paid: usd(702.1),
    budget: usd(1000),
  });
  team.addAgentSpend(source, { agent: "agent-Di", range: "week", paid: usd(90) });
  team.addSeat(source, {
    label: "Seat B",
    plan: "Max",
    state: "near-limit",
    agents: ["agent-Mateo", "agent-Owen"],
    windows: [
      {
        kind: "week",
        label: "This week",
        usedPercent: 84,
        resetsAt: "2026-11-26T09:00:00.000Z",
        reaches90At: "2026-11-24T16:40:00.000Z",
      },
    ],
    manualReset: "available",
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
      "button, [role=button], [role=radiogroup] label, a",
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
      expect(list).toContain("Mateo · $20.00 · Seat B");
      expect(list).toContain("Ben · $16.00");
      expect(list).not.toContain("Cy");
      expect(list).toContain("Work on subscription seats is counted at API prices.");
      // "See all ›" sits in the heading, before the rows.
      const seeAll = page.querySelector('[data-opens="agents"] button');
      expect(seeAll?.textContent).toBe("See all");
      expect(
        seeAll?.compareDocumentPosition(
          page.querySelector('section[aria-label="Agents by spend today"] li') as Node,
        ),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      await press(page, "See all");
      expect(page.querySelector("h1")?.textContent).toBe("Agents by spend");
      const head = [...page.querySelectorAll("thead th")].map((each) => each.textContent);
      expect(head).toEqual(["Agent", "Today", "This week", "This month", "Seat"]);
      expect(page.querySelectorAll("tbody tr")).toHaveLength(7);
      expect(page.querySelector("tbody tr")?.textContent).toContain("Mateo");
      expect(page.textContent).toContain("Work on subscription seats is counted at API prices.");

      await press(page, "This week");
      expect(page.querySelector("tbody tr")?.textContent).toContain("Di");
    });

    it("opens a seat from its row, then an agent from the seat", async () => {
      const { spendAndSeats, details } = acme();
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />);
      await settle();
      await press(page, "Seat B", 'section[aria-label="Seats"]');
      expect(page.querySelector("h1")?.textContent).toBe("Seat B · Pool · Max");
      // The back link comes before the title.
      const back = page.querySelector('nav button[aria-label="Back to Spend and seats"]');
      expect(back?.compareDocumentPosition(page.querySelector("h1") as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(page.textContent).toContain("Near limit: reaches 90% around 16:40");
      expect(page.textContent).toContain("84% · resets Thu 09:00 · ↗ reaches 90% around 16:40");
      expect(page.textContent).toContain("Manual resetAvailable");
      expect(section(page, "Agents on Seat B (2)")).toContain("Owen · Working");
      const proposal = section(page, "The Seat Supervisor proposes");
      expect(proposal).toContain("From 12:55 · not done yet");
      expect(proposal).toContain(
        "The app only shows this. The Seat Supervisor or Paperclip makes the move.",
      );

      await press(page, "Mateo");
      expect(page.querySelector("h1")?.textContent).toBe("Mateo");
      expect(page.textContent).toContain("No task right now · Working");
      expect(page.textContent).toContain("$20.00");
      expect(page.textContent).toContain("$61.30");
      expect(page.textContent).toContain("$702.10 of $1,000 · 70%");
      expect(page.textContent).toContain("On Seat B");

      await press(page, "Spend and seats");
      expect(section(page, "Agents by spend today")).toContain("Mateo");
    });

    it("focuses a detail page's h1 when it opens, and the pressed seat row on Back", async () => {
      const { spendAndSeats, details } = acme();
      const page = render(<SpendAndSeatsPage spendAndSeats={spendAndSeats} details={details} />);
      await settle();
      await press(page, "Seat B", 'section[aria-label="Seats"]');
      expect(document.activeElement).toBe(page.querySelector("h1"));

      await press(page, "Spend and seats");
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
