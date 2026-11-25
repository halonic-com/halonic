import type { Seat, SeatWindow, SpendSummary, TeamStatus } from "@halonicjs/ports";
import { loadSpendAndSeatsScreen } from "@halonicjs/studio-feature-team/api";
import { PHONE_MAX_WIDTH, PresentationProvider } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
 * The Spend and seats screen (HAL-17515 s01, s06, S24) from a made-up team: $1,380 of a $1,500
 * budget, Spent today with runs not priced yet, and five seats, one in each state the screen
 * tells apart, plus a paid-API seat. `?state=loading` holds the first read, for s08. The clock
 * is fixed at 24 Nov 13:00 UTC, so the times never change.
 */

const now = new Date("2026-11-24T13:00:00.000Z");
const source = "acme-paperclip";
const asOf = "2026-11-24T12:58:00.000Z";
const tokens = { input: 30_000_000, cached: 10_000_000, output: 1_000_000 };
const usd = (dollars: number) => ({ cents: Math.round(dollars * 100), currency: "USD" });

const spend: Record<"today" | "month", SpendSummary> = {
  today: { source, range: "today", asOf, paid: usd(41.2), tokens, unpricedRuns: 560 },
  month: {
    source,
    range: "month",
    asOf,
    paid: usd(1380),
    budget: usd(1500),
    tokens,
    unpricedRuns: 0,
  },
};

function week(usedPercent: number, extra: Partial<SeatWindow> = {}): SeatWindow {
  return {
    kind: "week",
    label: "This week",
    usedPercent,
    resetsAt: "2026-11-26T09:00:00.000Z",
    ...extra,
  };
}

function fiveHours(usedPercent: number): SeatWindow {
  return { kind: "five-hour", label: "5 hours", usedPercent };
}

function seat(label: string, state: Seat["state"], windows: SeatWindow[], agents: number): Seat {
  return {
    id: `seat-${label}`,
    source,
    label,
    role: label === "Paid API" ? "paid-api" : "pool",
    state,
    windows,
    agents: Array.from({ length: agents }, (_, index) => `agent-${index}`),
    manualReset: "none",
    asOf,
  };
}

const seats: Seat[] = [
  seat("Seat C", "full", [week(100), fiveHours(100)], 2),
  seat("Seat D", "signed-out", [], 2),
  seat(
    "Seat B",
    "near-limit",
    [week(84, { reaches90At: "2026-11-24T13:40:00.000Z" }), fiveHours(61)],
    4,
  ),
  seat("Seat A", "ok", [week(48), fiveHours(12)], 3),
  seat("Seat E with a much longer label than the others", "ok", [week(22), fiveHours(5)], 1),
  seat("Paid API", "ok", [], 1),
];

/** As the shell decides it: below the phone width the screen draws its phone layout (S24). */
const phone = matchMedia(`(width < ${PHONE_MAX_WIDTH}px)`).matches;
const loading = new URLSearchParams(location.search).get("state") === "loading";
const never = new Promise<never>(() => {});

const team: TeamStatus = {
  parts: async () => {
    if (loading) return never;
    return [{ source, spend: true, seats: true, pullRequests: false }];
  },
  spend: async (range) => (range === "week" ? [] : [spend[range]]),
  agentSpend: async () => [],
  seats: async () => seats,
  pullRequests: async () => [],
  pullRequest: async () => undefined,
  mergeQueue: async () => [],
  changes: async function* () {},
};

/** Draws the screen once the feature's code has loaded. */
async function show(): Promise<void> {
  const { SpendAndSeatsPage, SpendAndSeats } = await loadSpendAndSeatsScreen();
  const spendAndSeats = new SpendAndSeats(team, { now: () => now, timeZone: "UTC" });
  const root = document.getElementById("root");
  if (root === null) throw new Error("The page has no #root.");
  createRoot(root).render(
    <StrictMode>
      <PresentationProvider presentation={phone ? "phone" : "desktop"}>
        <SpendAndSeatsPage spendAndSeats={spendAndSeats} onLink={() => {}} />
      </PresentationProvider>
    </StrictMode>,
  );
}

show().catch((error: unknown) => {
  console.error("The Spend and seats page couldn't be drawn:", error);
});
