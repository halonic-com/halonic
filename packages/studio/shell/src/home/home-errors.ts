import { createContext } from "react";

/**
 * Tells Home that a section shows its error with this reason. The returned function takes it back
 * once the section shows something else. Home then says each reason once to screen readers, not
 * once per section: when the engine isn't answering, every section fails for the same reason
 * (a11y 1.5).
 */
export const HomeErrorReport = createContext<(reason: string) => () => void>(() => () => {});

/** One section's report: an object of its own, so two sections with the same reason stay apart. */
interface Report {
  readonly reason: string;
}

/**
 * The reasons Home's sections show their errors for. A store, not React state in the page, so a
 * section's report redraws only the page's status line: redrawing the page would redraw a section
 * that is still loading, and React would then hold back its rows for a moment once they arrive.
 */
export class HomeErrorReasons {
  #reports: readonly Report[] = [];
  #reasons: readonly string[] = [];
  readonly #listeners = new Set<() => void>();

  /** Adds a section's reason; the returned function takes it back. */
  readonly report = (reason: string): (() => void) => {
    const entry: Report = { reason };
    this.#update([...this.#reports, entry]);
    return () => this.#update(this.#reports.filter((other) => other !== entry));
  };

  /** Each reason once, in the order it first came. The same array until the reasons change. */
  readonly reasons = (): readonly string[] => this.#reasons;

  /** Calls `listener` whenever the reasons may have changed; returns the unsubscribe. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #update(reports: readonly Report[]): void {
    this.#reports = reports;
    const reasons = [...new Set(reports.map((entry) => entry.reason))];
    if (sameReasons(reasons, this.#reasons)) {
      return;
    }
    this.#reasons = reasons;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** Whether both lists hold the same reasons in the same order, compared one by one. */
function sameReasons(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((reason, index) => reason === second[index]);
}
