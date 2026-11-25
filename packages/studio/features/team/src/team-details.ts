import type {
  AgentActivity,
  AgentMessaging,
  AgentSpend,
  MessagingAgent,
  MessagingId,
  Seat,
  SpendRange,
  TeamStatus,
  WorkItem,
} from "@halonicjs/ports";
import type { TeamClock } from "./team-format.ts";
import { watchTeamStatus } from "./team-watch.ts";

/** How many agents Spend and seats lists before **See all** (HAL-17510 flows 1.1). */
export const agentsBySpendShown = 5;

/** One agent as the detail pages name it: its name, status word and the task it works on. */
export interface AgentLine {
  readonly id: MessagingId;
  /** The agent's name, or `undefined` when messaging doesn't know it: the page then says "Unknown agent". */
  readonly name: string | undefined;
  readonly activity: AgentActivity | undefined;
  /** The task it works on now, when messaging says one is in progress. */
  readonly work: WorkItem | undefined;
}

/** One row of Agents by spend today. */
export interface AgentSpendRow {
  readonly agent: AgentLine;
  readonly spend: AgentSpend;
  /** The seat that lists the agent now, if any. */
  readonly seat: Seat | undefined;
}

/** One row of the See all page: an agent's spend in each range, and its seat now. */
export interface AgentRangesRow {
  readonly agent: AgentLine;
  /** Spend by range; a range the source has no answer for is left out. */
  readonly spend: Readonly<Partial<Record<SpendRange, AgentSpend>>>;
  readonly seat: Seat | undefined;
}

/** Agents by spend today: the top rows, and how many agents spent in all, for **See all**. */
export interface AgentsBySpend {
  readonly rows: readonly AgentSpendRow[];
  readonly total: number;
}

/** What the agent detail page shows (flows 1.3), as far as `TeamStatus` tells it. */
export interface AgentDetail {
  readonly agent: AgentLine;
  /** Spend by range; a range the source has no answer for is left out. */
  readonly spend: Readonly<Partial<Record<SpendRange, AgentSpend>>>;
  /** The seat that lists the agent now, if any. */
  readonly seat: Seat | undefined;
}

/** What the seat detail page shows (flows 1.4). */
export interface SeatDetail {
  readonly seat: Seat;
  readonly agents: readonly AgentLine[];
}

const ranges: readonly SpendRange[] = ["today", "week", "month"];

/**
 * The reads behind the agent and seat detail pages and Agents by spend today
 * (requirement `team.agent-and-seat-detail`). Spend and seats come from
 * `TeamStatus`; names, status words and tasks from `AgentMessaging`, when a
 * workspace has it. It holds no copy; each read asks the ports again.
 */
export class TeamDetails {
  /** Absent where no engine serves `TeamStatus`: every read then gives nothing. */
  private readonly team: TeamStatus | undefined;
  /** Absent where no engine serves messaging: agents then show without a name or task. */
  private readonly messaging: AgentMessaging | undefined;
  private readonly clock: TeamClock;

  constructor(
    team: TeamStatus | undefined,
    messaging: AgentMessaging | undefined,
    clock: TeamClock,
  ) {
    this.team = team;
    this.messaging = messaging;
    this.clock = clock;
  }

  /** The clock the pages format their times with. */
  get timeClock(): TeamClock {
    return this.clock;
  }

  /** Agents by spend today, most paid first, then most tokens; all of them when `limit` is left out. */
  async agentsBySpend(limit?: number): Promise<AgentsBySpend> {
    const team = this.team;
    if (team === undefined) return { rows: [], total: 0 };
    const [spend, seats, lines] = await Promise.all([
      team.agentSpend("today"),
      team.seats(),
      this.readLines(),
    ]);
    const sorted = [...spend].sort(bySpend);
    const rows = sorted.map((each) => ({
      agent: lines(each.agent),
      spend: each,
      seat: seatOf(seats, each.agent),
    }));
    return { rows: limit === undefined ? rows : rows.slice(0, limit), total: rows.length };
  }

  /**
   * Every agent that spent in any range, with its spend in each, most paid in `range` first, for
   * the See all page (HAL-17515 S10). An agent with nothing in `range` goes last.
   */
  async agentsByRange(range: SpendRange): Promise<readonly AgentRangesRow[]> {
    const team = this.team;
    if (team === undefined) return [];
    const [byRange, seats, lines] = await Promise.all([
      Promise.all(ranges.map((each) => team.agentSpend(each))),
      team.seats(),
      this.readLines(),
    ]);
    const spendOf = new Map<MessagingId, Partial<Record<SpendRange, AgentSpend>>>();
    for (const answer of byRange.flat()) {
      const spend = spendOf.get(answer.agent) ?? {};
      spend[answer.range] = answer;
      spendOf.set(answer.agent, spend);
    }
    const rows = [...spendOf].map(([id, spend]) => ({
      agent: lines(id),
      spend,
      seat: seatOf(seats, id),
    }));
    return rows.sort((a, b) => byOptionalSpend(a.spend[range], b.spend[range]));
  }

  /** One agent's page, or `undefined` when no source knows the agent. */
  async agent(id: MessagingId): Promise<AgentDetail | undefined> {
    const team = this.team;
    if (team === undefined) return undefined;
    const [byRange, seats, lines] = await Promise.all([
      Promise.all(ranges.map((range) => team.agentSpend(range))),
      team.seats(),
      this.readLines(),
    ]);
    const spend: Partial<Record<SpendRange, AgentSpend>> = {};
    for (const answers of byRange) {
      const found = answers.find((each) => each.agent === id);
      if (found !== undefined) spend[found.range] = found;
    }
    const seat = seatOf(seats, id);
    const agent = lines(id);
    if (seat === undefined && Object.keys(spend).length === 0 && agent.name === undefined) {
      return undefined;
    }
    return { agent, spend, seat };
  }

  /** One seat's page, or `undefined` when no source has the seat. */
  async seat(id: MessagingId): Promise<SeatDetail | undefined> {
    const team = this.team;
    if (team === undefined) return undefined;
    const [seats, lines] = await Promise.all([team.seats(), this.readLines()]);
    const seat = seats.find((each) => each.id === id);
    if (seat === undefined) return undefined;
    return { seat, agents: seat.agents.map(lines) };
  }

  /** Calls `listener` whenever a source says its team status changed. Returns a function that stops it. */
  watch(listener: () => void): () => void {
    return watchTeamStatus(this.team, listener, "Team details");
  }

  /** A lookup from agent ID to its line. Without messaging, or when it fails, agents show by ID alone. */
  private async readLines(): Promise<(id: MessagingId) => AgentLine> {
    const [agents, work] = await this.readMessaging();
    return (id) => {
      const agent = agents.find((each) => each.id === id);
      return {
        id,
        name: agent?.name,
        activity: agent?.activity,
        work: work.find((each) => each.assignee === id && each.state === "in-progress"),
      };
    };
  }

  /** Names and tasks. The pages still show without them, so a failed read is logged, not thrown. */
  private async readMessaging(): Promise<[readonly MessagingAgent[], readonly WorkItem[]]> {
    if (this.messaging === undefined) return [[], []];
    try {
      return await Promise.all([this.messaging.listAgents(), this.messaging.listWork()]);
    } catch (error) {
      console.error("Team details couldn't read agent names and tasks:", error);
      return [[], []];
    }
  }
}

function tokenTotal(spend: AgentSpend): number {
  return spend.tokens.input + spend.tokens.cached + spend.tokens.output;
}

/** Most paid first, then most tokens. */
function bySpend(a: AgentSpend, b: AgentSpend): number {
  return b.paid.cents - a.paid.cents || tokenTotal(b) - tokenTotal(a);
}

/** As {@link bySpend}, with no spend in the range last. */
function byOptionalSpend(a: AgentSpend | undefined, b: AgentSpend | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return bySpend(a, b);
}

/** The seat that lists the agent now, if any. */
function seatOf(seats: readonly Seat[], agent: MessagingId): Seat | undefined {
  return seats.find((each) => each.agents.includes(agent));
}
