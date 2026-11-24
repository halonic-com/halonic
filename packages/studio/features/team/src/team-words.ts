import type { Seat, SeatState } from "@halonicjs/ports";

/** Where a button that leaves the app goes; the shell turns it into the Paperclip page. */
export type TeamLink = "set-budget" | "ai-seats" | "paperclip" | "connect-again";

/**
 * The Spend and seats screen's words, as Noah's HAL-17515 `wording` table has
 * them (revision 2, Nina's check on HAL-17547). The tokens line under Spent
 * today is Nina's, for the board's S1 choice on HAL-17544. A button that leaves
 * the app ends with "↗".
 */
export const teamWords = {
  title: "Spend and seats",
  loading: "Loading…",
  loadingSpoken: "Loading spend and seats",
  /** The phase 1 offline banner with HAL-17515's second sentence: a read failed after a good one. */
  offline: (time: string) =>
    `Offline, as of ${time}. Numbers stay as they were; opening things in Paperclip is off until Paperclip answers again.`,
  /** The first read failed, so there are no numbers to keep. Not in HAL-17515's table: new wording. */
  notAnswering: "Paperclip isn't answering.",
  tryAgain: "Try again",
  asOf: (time: string, minutes: number) => `As of ${time} · ${minutes} min ago`,
  needsYou: "Needs you",
  problemCount: (count: number) => (count === 1 ? "1 problem" : `${count} problems`),
  nothingNeedsYou: "Nothing needs you. All seats are under 80%.",
  agentsOn: (count: number) => (count === 1 ? "1 agent on it" : `${count} agents on it`),
  oldReadings: (minutes: number) =>
    `Seat readings are ${minutes} min old. The seats job may have stopped.`,
  spentToday: "Spent today",
  atLeast: (money: string) => `At least ${money}`,
  notPriced: (runs: number) => `${runs} runs not priced yet`,
  tokensToday: (tokens: string) => `Subscription seats used ${tokens} tokens today.`,
  thisMonth: "This month",
  monthNoBudget: (money: string) => `${money} this month`,
  noBudget: "No monthly budget set",
  monthOfBudget: (spent: string, budget: string) => `${spent} of ${budget}`,
  percent: (value: number) => `${value}%`,
  left: (money: string) => `${money} left`,
  daysToGo: (days: number) => (days === 1 ? "1 day to go" : `${days} days to go`),
  atThisPace: (money: string) => `At this pace: ${money}`,
  passesBudget: (date: string) => `At this pace you pass the budget around ${date}.`,
  budgetUsedUp: "This month's budget is used up. Paperclip stops agents whose budget is used up.",
  cantReadSpend: "This connection can't read spend yet. Connect again to allow it.",
  seatsThisWeek: "Seats this week",
  poolLeft: (percent: number) => `${percent}% of pool left`,
  nearLimit: (count: number) => (count === 0 ? "None near their limit" : `${count} near its limit`),
  signedOutCount: (count: number) => `${count} signed out`,
  nextRefill: (at: string) => `Next refill ${at}`,
  seatsHeading: "Seats · worst first",
  seatColumns: ["Seat", "State", "This week", "5 hours", "Agents"],
  /** "Seat A · pool"; a paid-API seat and one of no known role show their label alone. */
  seatName: (seat: Seat) =>
    seat.role === "pool" || seat.role === "reserve" ? `${seat.label} · ${seat.role}` : seat.label,
  paidApi: "Money, not a weekly limit",
  seatsMissing: "Seat use isn't available on this Paperclip yet.",
  noSeats: "No seats are set up in Paperclip's AI seats page.",
  links: {
    "set-budget": "Set one in Paperclip ↗",
    "ai-seats": "Open AI seats ↗",
    paperclip: "Open Paperclip ↗",
    "connect-again": "Connect again",
  } satisfies Record<TeamLink, string>,
  openAiSeatsInPaperclip: "Open AI seats in Paperclip ↗",
  problem: {
    full: (seat: string, until: string) => `${seat} is full until ${until}`,
    signedOut: (seat: string) => `${seat} is signed out`,
    since: (time: string) => `Since ${time}`,
    notRead: (seat: string) => `${seat} · Not read`,
    lastGood: (time: string) => `last good ${time}`,
    reaches90: (seat: string, time: string) => `${seat} reaches 90% of its week around ${time}`,
    used: (seat: string, percent: number) => `${seat} has used ${percent}% of its week`,
    resets: (at: string) => `Resets ${at}`,
  },
  state: {
    ok: () => "OK",
    "near-limit": (forecast?: string) =>
      forecast === undefined ? "Near limit" : `Near limit · ↗ 90% around ${forecast}`,
    full: (until?: string) => (until === undefined ? "Full" : `Full · until ${until}`),
    // Only "since": the port has one time, `asOf`, so a separate "last read" would repeat it.
    "signed-out": (since?: string) =>
      since === undefined ? "Signed out" : `Signed out · since ${since}`,
    "not-read": (since?: string) =>
      since === undefined ? "? Not read" : `? Not read · last good ${since}`,
    other: () => "",
  } satisfies Record<SeatState, (time?: string) => string>,
};
