import type { AsOf, MessagingId, Seat, SpendSummary, TeamStatus } from "@halonicjs/ports";
import type { PlaceSignal } from "@halonicjs/studio-shell";
import { ProblemSignal } from "./problem-signal.ts";
import { type SeatProblem, seatProblems } from "./seat-problems.ts";
import type { TeamClock } from "./team-format.ts";
import { watchTeamStatus } from "./team-watch.ts";

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
  /**
   * The newest reading among the answers the engine gave from its offline
   * cache, for the "Offline, as of …" banner; `undefined` when every answer is live.
   */
  readonly offlineAsOf: string | undefined;
}

/**
 * The Spend and seats screen's reads (requirement `team.spend-and-seats`):
 * one `TeamStatus` source's spend today and this month and its seats, with
 * each seat's problem. The screen shows the first source that serves spend or
 * seats. It holds no copy of the data; each read asks the port again. It
 * keeps only the last problem count, for the sidebar's signal.
 */
export class SpendAndSeats {
  /** Absent where no engine serves `TeamStatus`: the screen then says seat use isn't available. */
  private readonly team: TeamStatus | undefined;
  private readonly clock: TeamClock;
  /** The sidebar's count of the problems in Needs you. */
  private readonly problems = new ProblemSignal({
    count: async () => {
      const state = await this.read();
      return state?.problems.filter((problem) => !problem.quiet).length ?? 0;
    },
    watch: (listener) => this.watch(listener),
    place: "Spend and seats",
  });

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
    // A signed-out seat's stamp says since when it is signed out, and a failed read's is its last
    // good one; neither says how fresh the read is (Sofia's table 1.6: a row-only state).
    const readSeats = seats.filter(
      (seat) => seat.state !== "signed-out" && seat.failedRead === undefined,
    );
    const answers: AsOf[] = [shown.today, shown.month, ...readSeats].flatMap((each) =>
      each === undefined ? [] : [each],
    );
    const cached = answers.filter((each) => each.fromCache === true);
    return {
      canReadSpend: part.spend,
      hasSeats: part.seats,
      ...shown,
      problems,
      asOf: byTime(answers)[0],
      offlineAsOf: byTime(cached).at(-1),
    };
  }

  /**
   * The sidebar's signal for Spend and seats: the problems in Needs you,
   * leaving out the quiet 80% ones (HAL-17510 flows 1.2), shown as "⚠ 2".
   */
  signal(): PlaceSignal {
    return this.problems.signal();
  }

  /**
   * Reads now and whenever a source says it changed, and calls `listener`
   * when the signal's count changed. Returns a function that stops it.
   */
  watchSignal(listener: () => void): () => void {
    return this.problems.watch(listener);
  }

  /** Calls `listener` whenever a source says its team status changed. Returns a function that stops it. */
  watch(listener: () => void): () => void {
    return watchTeamStatus(this.team, listener, "Spend and seats");
  }
}

/** The answers' times, oldest first, compared as times, not as text. */
function byTime(answers: readonly AsOf[]): readonly string[] {
  return answers.map((each) => each.asOf).sort((a, b) => Date.parse(a) - Date.parse(b));
}
