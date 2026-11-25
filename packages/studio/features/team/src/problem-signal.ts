import type { PlaceSignal } from "@halonicjs/studio-shell";
import { teamWords } from "./team-words.ts";

/** Where a {@link ProblemSignal} gets its count and hears that it may have changed. */
export interface ProblemCountSource {
  /** The problems the sidebar counts now. */
  readonly count: () => Promise<number>;
  /** Calls `listener` whenever a source says its team status changed; returns a function that stops it. */
  readonly watch: (listener: () => void) => () => void;
  /** The place's name, for the log line when a count can't be read. */
  readonly place: string;
}

/**
 * A Team place's sidebar signal, shown as "⚠ 2" (HAL-17515 S0): problems only, never totals, so a
 * quiet day shows no number. It keeps only the last count any watch read.
 */
export class ProblemSignal {
  private readonly source: ProblemCountSource;
  /** The problems the sidebar counts, as of the newest read any `watch` made. */
  private problemCount = 0;

  constructor(source: ProblemCountSource) {
    this.source = source;
  }

  /** The signal now. */
  signal(): PlaceSignal {
    return {
      mark: "problems",
      value: this.problemCount,
      spoken: teamWords.problemCount(this.problemCount),
    };
  }

  /**
   * Reads now and whenever a source says it changed, and calls `listener`
   * when the count changed. Returns a function that stops it.
   */
  watch(listener: () => void): () => void {
    let watching = true;
    // Each watch keeps the count it last told its listener: the desktop watches places from
    // the window and the sidebar, and each must hear a change, not only the first to read it.
    let heard = 0;
    const readCount = () => {
      this.source.count().then(
        (count) => {
          this.problemCount = count;
          if (!watching || count === heard) return;
          heard = count;
          listener();
        },
        (error: unknown) =>
          console.error(`${this.source.place}' problem count couldn't be read:`, error),
      );
    };
    readCount();
    const stop = this.source.watch(readCount);
    return () => {
      watching = false;
      stop();
    };
  }
}
