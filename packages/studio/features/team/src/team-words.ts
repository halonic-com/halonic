import type { Seat, SeatReadCause, SeatState } from "@halonicjs/ports";

/** Where a button that leaves the app goes; the shell turns it into the Paperclip page. */
export type TeamLink = "set-budget" | "ai-seats" | "paperclip" | "connect-again";

/**
 * The Spend and seats screen's words, as Noah's HAL-17515 `wording` table has
 * them (revision 2, Nina's check on HAL-17547). The tokens line under Spent
 * today is Nina's, for the board's S1 choice on HAL-17544. A button that leaves
 * the app shows an ↗ icon beside its name, not in it.
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
  /** The freshness slot while offline, with the last good read's time (wording, Shared). */
  asOfOffline: (time: string) => `As of ${time} · offline`,
  needsYou: "Needs you",
  problemCount: (count: number) => (count === 1 ? "1 problem" : `${count} problems`),
  nothingNeedsYou: "Nothing needs you. All seats are under 80%.",
  agentsOn: (count: number) => (count === 1 ? "1 agent on it" : `${count} agents on it`),
  oldReadings: (minutes: number) =>
    `Seat readings are ${minutes} min old. The seats job may have stopped.`,
  spentToday: "Spent today",
  atLeast: (money: string) => `At least ${money}`,
  notPriced: (runs: number) =>
    runs === 1 ? "1 run not priced yet" : `${runs} runs not priced yet`,
  tokensToday: (tokens: string) => `Subscription seats used ${tokens} tokens today.`,
  /** Sofia's table 1.6 row "Cost rows with no known seat" (HAL-17510). */
  seatUnknown: (runs: number) =>
    runs === 1 ? "Seat unknown for 1 run" : `Seat unknown for ${runs} runs`,
  thisMonth: "This month",
  /** After the month's money when no budget is set: "$977 this month". */
  thisMonthAfter: "this month",
  noBudget: "No monthly budget set",
  /** After the month's money, in the muted colour: "$1,380 of $1,500". */
  ofBudget: (budget: string) => `of ${budget}`,
  percent: (value: number) => `${value}%`,
  left: (money: string) => `${money} left`,
  daysToGo: (days: number) => (days === 1 ? "1 day to go" : `${days} days to go`),
  atThisPace: (money: string) => `At this pace: ${money}`,
  passesBudget: (date: string) => `At this pace you pass the budget around ${date}.`,
  budgetUsedUp: "This month's budget is used up. Paperclip stops agents whose budget is used up.",
  cantReadSpend: "This connection can't read spend yet. Connect again to allow it.",
  seatsThisWeek: "Seats this week",
  /** After the pool's percent, in the muted colour: "38% of pool left". */
  ofPoolLeft: "of pool left",
  nearLimit: (count: number) => {
    if (count === 0) return "None near their limit";
    return count === 1 ? "1 near its limit" : `${count} near their limit`;
  },
  signedOutCount: (count: number) => `${count} signed out`,
  nextRefill: (at: string) => `Next refill ${at}`,
  /** The seats' heading, "Seats · worst first", as a List heading's name and detail. */
  seatsHeading: "Seats",
  worstFirst: "worst first",
  seatColumns: ["Seat", "State", "This week", "5 hours", "Agents"],
  /** "Seat A · pool"; a paid-API seat and one of no known role show their label alone. */
  seatName: (seat: Seat): string => {
    const role = teamWords.seatRole(seat);
    return role === undefined ? seat.label : `${seat.label} ${role}`;
  },
  /** The role after a seat's label, "· pool", kept whole when a name wraps; none for other roles. */
  seatRole: (seat: Seat): string | undefined =>
    seat.role === "pool" || seat.role === "reserve" ? `· ${seat.role}` : undefined,
  paidApi: "Money, not a weekly limit",
  seatsMissing: "Seat use isn't available on this Paperclip yet.",
  noSeats: "No seats are set up in Paperclip's AI seats page.",
  links: {
    "set-budget": "Set one in Paperclip",
    "ai-seats": "Open AI seats",
    paperclip: "Open Paperclip",
    "connect-again": "Connect again",
  } satisfies Record<TeamLink, string>,
  /** The page header's button (s01, s09); the ↗ is its icon, beside the name. */
  openAiSeatsInPaperclip: "Open AI seats in Paperclip",
  agentsStillOn: (count: number) =>
    count === 1 ? "1 agent still on it" : `${count} agents still on it`,
  /** The Inbox notices and desktop notifications, HAL-17515 S19 and S20. */
  notice: {
    reaches90: (seat: string, time: string) => `${seat} reaches 90% around ${time}`,
    /** After the agents, as in "4 agents on it · resets Thu 09:00". */
    resets: (at: string) => `resets ${at}`,
    queueHeld: "Runners busy · pushes are on hold",
    queueHeldLine: (minutes: number, pullRequests: number) =>
      `Longest wait ${minutes} min · ${pullRequests === 1 ? "1 PR" : `${pullRequests} PRs`} in the queue`,
  },
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
  /** Under a near-limit seat's week meter, not in its chip: "↗ 90% around 13:40". */
  forecast90: (time: string) => `↗ 90% around ${time}`,
  state: {
    ok: () => "OK",
    "near-limit": () => "Near limit",
    full: (until?: string) => (until === undefined ? "Full" : `Full · until ${until}`),
    // Only "since": the port has one time, `asOf`, so a separate "last read" would repeat it.
    "signed-out": (since?: string) =>
      since === undefined ? "Signed out" : `Signed out · since ${since}`,
    // The chip's ⓘ is its symbol, so the words carry no "?"; "last good" goes under the bar (S6).
    "not-read": () => "Not read",
    other: () => "",
  } satisfies Record<SeatState, (time?: string) => string>,
  /**
   * A failed read's cause in the seat's row, from Sofia's table 1.6 row "One
   * seat's read failed" (HAL-17510): "Not read · rate-limited", with "last good
   * 12:20" under the greyed bar (S6). A cause with no words leaves "Not read".
   */
  readCause: { "rate-limited": "rate-limited", other: undefined } satisfies Record<
    SeatReadCause,
    string | undefined
  >,
  notReadBecause: (cause: string) => `Not read · ${cause}`,
  /** Under a seat's greyed week bar: a not-read seat's "last good 12:20" (S6). */
  lastGood: (time: string) => `last good ${time}`,
  /** Under a signed-out seat's greyed week bar: "last read 09:40" (S1, S6). */
  lastRead: (time: string) => `last read ${time}`,
};
