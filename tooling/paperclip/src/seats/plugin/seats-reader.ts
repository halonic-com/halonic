import { ReadRounds } from "../read/read-round.ts";
import type { SeatReadOutcome, SeatToRead } from "../read/read-seat.ts";
import {
  readingAgeMs,
  type SeatAlertKind,
  type SeatWatch,
  seatAlerts,
  startWatch,
} from "../read/seat-watch.ts";
import { readOffsetMs } from "../read-schedule.ts";
import type { ReadError, SeatId } from "../records.ts";
import type { SeatSetting } from "./settings.ts";
import type { SeatsStore } from "./store.ts";

export interface SeatsReaderDeps {
  readonly read: (seat: SeatToRead) => Promise<SeatReadOutcome>;
  readonly store: SeatsStore;
  readonly now: () => Date;
}

/** What one tick of `seats.read` did. */
export interface TickResult {
  readonly skipped: boolean;
  readonly read: number;
  readonly errors: readonly ReadError[];
}

/** What the board may see about one seat's reads: no folder, account or program output. */
export interface SeatReadStatus {
  readonly seatId: SeatId;
  readonly nextReadAt: string;
  readonly lastReadAt: string | undefined;
  /** How old the last good reading is, in ms; undefined before the first one. */
  readonly readingAgeMs: number | undefined;
  readonly lastError: ReadError | undefined;
  readonly alerts: readonly SeatAlertKind[];
  /** When the seat's sign-in expires, if Claude Code said at the last read. */
  readonly signInExpiresAt: string | undefined;
}

/** Old rows are removed at most once an hour. */
const removeEveryMs = 60 * 60_000;

/**
 * Runs `seats.read` for the worker's lifetime. It keeps one watch per seat
 * in memory, so after a worker restart every seat starts fresh, without its
 * back-off; `startedAt` says when that was, and the page shows it.
 */
export class SeatsReader {
  readonly startedAt: string;
  private readonly deps: SeatsReaderDeps;
  private readonly watches = new Map<SeatId, SeatWatch>();
  private readonly rounds: ReadRounds;
  private removedAt: number | undefined;

  constructor(deps: SeatsReaderDeps) {
    this.deps = deps;
    this.startedAt = deps.now().toISOString();
    this.rounds = new ReadRounds(deps.read, () => deps.now().toISOString());
  }

  /** One tick: reads the seats that are due, stores each reading and removes old rows. */
  async tick(seats: readonly SeatSetting[]): Promise<TickResult> {
    const result = await this.rounds.run(seats.map(seatToRead), this.followSettings(seats));
    if (result.skipped) {
      return { skipped: true, read: 0, errors: [] };
    }
    for (const { reading } of result.outcomes) {
      await this.deps.store.recordReading(reading);
    }
    const now = this.deps.now();
    if (this.removedAt === undefined || now.getTime() - this.removedAt >= removeEveryMs) {
      await this.deps.store.removeOld(now);
      this.removedAt = now.getTime();
    }
    const errors = result.outcomes.flatMap(({ reading }) =>
      reading.error === undefined ? [] : [reading.error],
    );
    return { skipped: false, read: result.outcomes.length, errors };
  }

  /** Each seat's reads as they stand now, in the settings' order. */
  status(seats: readonly SeatSetting[]): SeatReadStatus[] {
    const now = this.deps.now().toISOString();
    return seats.flatMap((seat) => {
      const watch = this.watches.get(seat.id);
      if (watch === undefined) {
        return [];
      }
      return [
        {
          seatId: seat.id,
          nextReadAt: watch.nextReadAt,
          lastReadAt: watch.lastReadAt,
          readingAgeMs: readingAgeMs(watch, now),
          lastError: watch.lastError,
          alerts: seatAlerts(watch, now).map((alert) => alert.kind),
          signInExpiresAt: watch.signIn?.expiresAt,
        },
      ];
    });
  }

  /**
   * Keeps one watch per seat in the settings. A new seat, or one whose place
   * in the list moved its read minute, starts a fresh watch; a seat the board
   * removed is no longer read.
   */
  private followSettings(seats: readonly SeatSetting[]): Map<SeatId, SeatWatch> {
    const ids = seats.map((seat) => seat.id);
    const now = this.deps.now().toISOString();
    for (const id of [...this.watches.keys()]) {
      if (!ids.includes(id)) {
        this.watches.delete(id);
      }
    }
    for (const id of ids) {
      const offsetMs = readOffsetMs(ids, id) ?? 0;
      if (this.watches.get(id)?.offsetMs !== offsetMs) {
        this.watches.set(id, startWatch(id, offsetMs, now));
      }
    }
    return this.watches;
  }
}

function seatToRead(seat: SeatSetting): SeatToRead {
  return { id: seat.id, configDir: seat.configDir, account: seat.account };
}
