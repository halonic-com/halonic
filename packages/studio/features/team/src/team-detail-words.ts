import type { AgentActivity, Seat } from "@halonicjs/ports";

/**
 * The agent and seat detail pages' words and Agents by spend's, as Sofia's
 * flows 1.1, 1.3 and 1.4 on HAL-17510 have them. Status words are phase 1's.
 */
export const teamDetailWords = {
  agentsBySpend: "Agents by spend today",
  /** The phone's heading, which opens every agent: "Agents by spend ›" (S24). */
  agentsBySpendPhone: "Agents by spend",
  seeAll: (count: number) => `See all ${count}`,
  back: "Back",
  unknownAgent: "Unknown agent",
  notFound: "This agent or seat is gone.",
  activity: {
    working: "Working",
    waiting: "Waiting",
    idle: "Idle",
    paused: "Paused",
    other: "Status unknown",
  } satisfies Record<AgentActivity, string>,
  worksOn: (task: string) => `Works on ${task}`,
  today: "Today",
  week: "This week",
  month: "This month",
  ofBudget: (budget: string, percent: number) => `of ${budget} · ${percent}%`,
  onSeat: (seat: string) => `On: ${seat}`,
  noSeat: "Not on a seat",
  tokensByModel: "Tokens this week, by model",
  tokens: (input: string, cached: string, output: string) =>
    `${input} in · ${cached} cached · ${output} out`,
  manualReset: (reset: Seat["manualReset"], date: (at: string) => string) => {
    if (reset === "available") return "Manual reset available";
    if (reset === "none") return "Manual reset not offered";
    return `Manual reset used on ${date(reset.usedAt)}`;
  },
  resets: (time: string) => `resets ${time}`,
  reaches90: (time: string) => `reaches 90% around ${time}`,
  agentsOnSeat: (seat: string, count: number) => `Agents on ${seat} (${count})`,
  proposes: "Seat Supervisor proposes",
  proposedAt: (time: string) => `(from ${time}, not done)`,
} as const;
