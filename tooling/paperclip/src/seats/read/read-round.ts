import type { SeatId } from "../records.ts";
import type { SeatReadOutcome, SeatToRead } from "./read-seat.ts";
import { afterRead, isDue, type SeatWatch } from "./seat-watch.ts";

/** What one round did: the reads it made, and whether it was skipped. */
export interface RoundResult {
  readonly skipped: boolean;
  readonly outcomes: readonly SeatReadOutcome[];
}

/**
 * Runs `seats.read`'s rounds. The job wakes every minute and the round reads
 * each seat that is due, one after the other. While a round is still
 * running, the next one is skipped, so two reads of one seat never overlap
 * and only one `claude` program runs at a time.
 */
export class ReadRounds {
  private running = false;
  private readonly read: (seat: SeatToRead) => Promise<SeatReadOutcome>;
  private readonly now: () => string;

  constructor(read: (seat: SeatToRead) => Promise<SeatReadOutcome>, now: () => string) {
    this.read = read;
    this.now = now;
  }

  /** Reads the due seats and updates their watches in `watches` as each read ends. */
  async run(seats: readonly SeatToRead[], watches: Map<SeatId, SeatWatch>): Promise<RoundResult> {
    if (this.running) {
      return { skipped: true, outcomes: [] };
    }
    this.running = true;
    try {
      const outcomes: SeatReadOutcome[] = [];
      for (const seat of seats) {
        const watch = watches.get(seat.id);
        if (watch === undefined || !isDue(watch, this.now())) {
          continue;
        }
        const outcome = await this.read(seat);
        watches.set(seat.id, afterRead(watch, outcome));
        outcomes.push(outcome);
      }
      return { skipped: false, outcomes };
    } finally {
      this.running = false;
    }
  }
}
