// The runs a workspace has made, for `halonic runs`, `halonic runs show` and
// the Studio's Runs list (C174 on HAL-2000). The command line and the Studio
// read runs through this one service, so both list the same runs in the same
// order and cut the list at the same place.

import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import type { RunFilter, RunStore } from "@halonicjs/ports";

/** How many runs a list shows when the caller doesn't say: the 20 newest. */
export const defaultRunListLimit = 20;

/**
 * Which runs to list. Every field narrows the list; none means every run.
 * There is no `kind`: the list holds real runs only, never test runs.
 */
export type RunListFilter = Omit<RunFilter, "kind">;

/** One page of the run list: the newest runs, and how many runs match in all. */
export interface RunList {
  /** At most the limit, newest start time first. */
  runs: RunSummary[];
  /** Every run that matches the filter, so a caller knows when the list was cut. */
  total: number;
}

/** One run as its log tells it: the summary worked out from the events, and the events. */
export interface RunDetail {
  summary: RunSummary;
  /** Oldest first, the whole log. */
  events: RunEvent[];
}

/** Lists a workspace's runs and shows one, read from its {@link RunStore}. */
export class RunHistory {
  readonly #runs: Pick<RunStore, "list" | "events">;

  constructor(runs: Pick<RunStore, "list" | "events">) {
    this.#runs = runs;
  }

  /**
   * The newest real runs that match the filter, and how many match in all
   * (requirement `app.run-list`).
   *
   * @param filter - narrows the list by hub, workflow or status
   * @param limit - how many runs to return at most, a whole number of 1 or more
   * @throws RangeError when `limit` isn't a whole number of 1 or more; the
   *   caller checks what the user typed before it asks
   *
   * @example
   * await history.listRuns({ status: "failed" }, 20);
   * // { runs: [the 20 newest failed runs], total: 47 }
   */
  async listRuns(filter: RunListFilter = {}, limit = defaultRunListLimit): Promise<RunList> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`The run list limit must be a whole number of 1 or more, not ${limit}.`);
    }
    const matches = await this.#runs.list({ ...filter, kind: "run" });
    return { runs: matches.slice(0, limit), total: matches.length };
  }

  /**
   * One run, real or test, with its summary and its whole log
   * (requirement `app.run-show`). The summary is worked out from the same
   * events it comes with, so the two always agree, even while the run goes on.
   *
   * @returns `null` for a run id the store doesn't know
   *
   * @example
   * await history.showRun("01JD8Q");
   * // { summary: { id: "01JD8Q", status: "completed", … }, events: [run.started, …] }
   */
  async showRun(runId: string): Promise<RunDetail | null> {
    const events = await this.#runs.events(runId);
    const summary = summarize(events);
    if (summary === null) return null;
    return { summary, events };
  }
}
