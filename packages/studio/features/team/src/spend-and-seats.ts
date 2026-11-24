import type { MessagingId, Seat, SpendSummary, TeamStatus } from "@halonicjs/ports";
import { type SeatProblem, seatProblems } from "./seat-problems.ts";
import type { TeamClock } from "./team-format.ts";

/** Everything the Spend and seats screen shows, for one source, as read now. */
export interface SpendAndSeatsState {
  /** Whether the connection may read spend; when not, the money tiles say so. */
  readonly canReadSpend: boolean;
  /** Whether this Paperclip serves seat use (the AI seats plugin). */
  readonly hasSeats: boolean;
  readonly today: SpendSummary | undefined;
  readonly month: SpendSummary | undefined;
  /** Seats worst first: those with a problem in the problems' order, then the rest as listed. */
  readonly seats: readonly Seat[];
  readonly problems: readonly SeatProblem[];
  /** The oldest reading on the screen, for its "As of" line. */
  readonly asOf: string | undefined;
}

/**
 * The Spend and seats screen's reads (requirement `team.spend-and-seats`):
 * one `TeamStatus` source's spend today and this month and its seats, with
 * each seat's problem. The screen shows the first source that serves spend or
 * seats. It holds no copy; each read asks the port again.
 */
export class SpendAndSeats {
  /** Absent where no engine serves `TeamStatus`: the screen then says seat use isn't available. */
  private readonly team: TeamStatus | undefined;
  private readonly clock: TeamClock;

  constructor(team: TeamStatus | undefined, clock: TeamClock) {
    this.team = team;
    this.clock = clock;
  }

  /** The clock the screen formats its times with. */
  get timeClock(): TeamClock {
    return this.clock;
  }

  /** The screen's state now, or `undefined` when no source serves spend or seats. */
  async read(): Promise<SpendAndSeatsState | undefined> {
    const team = this.team;
    if (team === undefined) return undefined;
    const parts = await team.parts();
    const part = parts.find((each) => each.spend || each.seats);
    if (part === undefined) return undefined;
    const ofSource = <Item extends { source: MessagingId }>(items: readonly Item[]) =>
      items.filter((each) => each.source === part.source);
    const [today, month, allSeats] = await Promise.all([
      part.spend ? team.spend("today") : [],
      part.spend ? team.spend("month") : [],
      part.seats ? team.seats() : [],
    ]);
    const seats = ofSource(allSeats);
    const problems = seatProblems(seats, this.clock.now());
    const troubled = problems.map((problem) => problem.seat);
    const rest = seats.filter((seat) => !troubled.some((each) => each.id === seat.id));
    const shown = {
      today: ofSource(today)[0],
      month: ofSource(month)[0],
      seats: [...troubled, ...rest],
    };
    const times = [shown.today, shown.month, ...seats].flatMap((each) =>
      each === undefined ? [] : [each.asOf],
    );
    return {
      canReadSpend: part.spend,
      hasSeats: part.seats,
      ...shown,
      problems,
      asOf: times.sort((a, b) => Date.parse(a) - Date.parse(b))[0],
    };
  }

  /** Calls `listener` whenever a source says its team status changed. Returns a function that stops it. */
  watch(listener: () => void): () => void {
    if (this.team === undefined) return () => {};
    const changes = this.team.changes()[Symbol.asyncIterator]();
    let stopped = false;
    const next = (): void => {
      changes.next().then(
        (change) => {
          if (stopped || change.done === true) return;
          listener();
          next();
        },
        (error: unknown) => {
          // A broken change feed ends the watch; the screen still shows its last read.
          if (!stopped) console.error("Spend and seats stopped hearing changes:", error);
        },
      );
    };
    next();
    return () => {
      stopped = true;
      void changes.return?.();
    };
  }
}
