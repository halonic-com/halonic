import type { AgentActivity, Seat, SpendRange } from "@halonicjs/ports";

/**
 * The agent and seat detail pages' words and Agents by spend's, as Noah's HAL-17515 `wording`
 * table has them (Shared "Back", S10, S11–S13, S14–S18). Status words are phase 1's. The strings
 * marked "no row" aren't in the table yet and wait for Nina's copy check.
 */
export const teamDetailWords = {
  /** The back link above a detail page's title: "‹ Spend and seats", "‹ Back" on a phone. */
  back: "Spend and seats",
  backShort: "Back",
  backSpoken: "Back to Spend and seats",
  agentsBySpend: "Agents by spend today",
  /** The phone's heading, which opens every agent: "Agents by spend ›" (S24). */
  agentsBySpendPhone: "Agents by spend",
  seeAll: "See all",
  /** Under Agents by spend, so a seat agent's $ isn't read as real money. */
  apiPricesHint: "Work on subscription seats is counted at API prices.",
  /** No row. */
  unknownAgent: "Unknown agent",
  /** No row. */
  notFound: "This agent or seat is gone.",
  activity: {
    working: "Working",
    waiting: "Waiting",
    idle: "Idle",
    /** No row. */
    paused: "Paused",
    /** No row. */
    other: "Status unknown",
  } satisfies Record<AgentActivity, string>,
  worksOn: (task: string) => `Works on ${task}`,
  noTask: "No task right now",
  range: {
    today: "Today",
    week: "This week",
    month: "This month",
  } satisfies Record<SpendRange, string>,
  /** After the month's money, in the muted colour: "of $1,000 · 70%". */
  ofBudget: (budget: string, percent: number) => `of ${budget} · ${percent}%`,
  onSeat: (seat: string) => `On ${seat}`,
  /** No row. */
  noSeat: "Not on a seat",
  tokensByModel: "Tokens this week, by model",
  tokens: (input: string, cached: string, output: string) =>
    `${input} in · ${cached} cached · ${output} out`,
  /** The See all page (S10). */
  allTitle: "Agents by spend",
  sortBy: "Sort by",
  columns: { agent: "Agent", seat: "Seat" },
  /** A seat's title: "Seat B · Pool · Max". */
  seatTitle: (seat: Seat) => {
    const role = seatRoles[seat.role];
    return [seat.label, role, seat.plan].filter((part) => part !== undefined).join(" · ");
  },
  /** The near-limit chip on a seat's page (S14): "Near limit: reaches 90% around 16:40". */
  nearLimitUntil: (time: string) => `Near limit: reaches 90% around ${time}`,
  limits: "Limits",
  resets: (time: string) => `resets ${time}`,
  reaches90: (time: string) => `↗ reaches 90% around ${time}`,
  manualReset: "Manual reset",
  manualResetState: (reset: Seat["manualReset"], group: string | undefined, date: string) => {
    if (reset === "available") return group === undefined ? "Available" : `Available (${group})`;
    // No row: the table has Available and Used only.
    if (reset === "none") return "Not offered";
    return `Used on ${date}`;
  },
  agentsOnSeat: (seat: string, count: number) => `Agents on ${seat} (${count})`,
  noAgents: "No agents on this seat.",
  proposes: "The Seat Supervisor proposes",
  proposedAt: (time: string) => `From ${time} · not done yet`,
  proposalHint: "The app only shows this. The Seat Supervisor or Paperclip makes the move.",
} as const;

/** A seat's role in its title; a paid-API seat and one of no known role show none. */
const seatRoles: Record<Seat["role"], string | undefined> = {
  pool: "Pool",
  reserve: "Reserve",
  "paid-api": undefined,
  other: undefined,
};
