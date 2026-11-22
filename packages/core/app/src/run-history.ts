// The runs a workspace has made, for `halonic runs`, `halonic runs show` and
// the Studio's Runs list (C174 on HAL-2000). The command line and the Studio
// read runs through this one service, so both list the same runs in the same
// order and cut the list at the same place.

import {
  type RunEvent,
  type RunSends,
  type RunSummary,
  sendsOf,
  summarize,
} from "@halonicjs/events";
import type { RunFilter, RunStore } from "@halonicjs/ports";
import { failedChildOf } from "./failed-child.ts";

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

/**
 * How many characters of a run's id its short id has, or, for a child run,
 * how many of its top-level run's id come before the child's own part.
 */
export const shortRunIdLength = 6;

/**
 * The id a person sees and types back, as stored and never uppercased. The
 * command line and the Studio print the same one (mc W4, cli-output 3.4).
 *
 * A top-level run's is the last 6 characters of its id. A child run's id is
 * its parent's id with `.<step>` or `.<step>.<item>` added (the engine's
 * `workflow` and `forEach` steps), so its short id is the short id of the
 * top-level run followed by everything from the first `.` on: it starts with
 * the short id of the run that started it, and is never cut (HAL-15744).
 *
 * @example
 * shortRunId("run_mfx3k2a1_a1b2c3d4"); // "b2c3d4"
 * shortRunId("run_mfx3k2a1_a17k2m9p.3.1"); // "7k2m9p.3.1"
 */
export function shortRunId(runId: string): string {
  const firstDot = runId.indexOf(".");
  if (firstDot === -1) return runId.slice(-shortRunIdLength);
  const topLevelEnd = runId.slice(0, firstDot).slice(-shortRunIdLength);
  return topLevelEnd + runId.slice(firstDot);
}

/**
 * Whether someone typed a short id rather than a whole run id: 6 characters,
 * as every short id had before child runs got their own part (so an old
 * `09.2.0` still works), or 6 characters before the first `.` and a child's
 * part after it.
 */
function looksLikeShortRunId(typed: string): boolean {
  if (typed.length === shortRunIdLength) return true;
  const firstDot = typed.indexOf(".");
  return firstDot === shortRunIdLength;
}

/**
 * What a run id someone typed points to: one run, no run, or several runs
 * whose ids end in the short id typed.
 */
export type RunLookup<Run> =
  | { found: "one"; run: Run }
  | { found: "none" }
  /**
   * `shortId` is the short id as stored, as the list prints it, whatever
   * case was typed; the caller asks for the full id instead.
   */
  | { found: "several"; shortId: string };

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
   * Whether the workspace has test runs, which the list never shows, so an
   * empty list can say "only test runs" (requirement `app.run-list-facts`).
   */
  async hasTestRuns(): Promise<boolean> {
    return (await this.#runs.list({ kind: "test" })).length > 0;
  }

  /**
   * What the run sent, may have sent, and whether it made a tool call, read
   * from its log by `sendsOf`; the summary doesn't say (requirement
   * `app.run-list-facts`). The list's ✓ Done row says it as the receipt does.
   *
   * @example
   * await history.sends("run_mfx3k2a1_a1b2c3d4");
   * // { sent: [{ verb: "sent", counts: [{ noun: { one: "email", many: "emails" }, calls: 1 }] }], maySend: [], madeToolCalls: true }
   */
  async sends(runId: string): Promise<RunSends> {
    return sendsOf(await this.#runs.events(runId));
  }

  /**
   * The full id of the run that someone typed, real or test (requirement
   * `app.run-short-id`). They may type the full id or its short id, in any
   * case. `runs show`, `runs send`, the Studio's links and Ctrl K all look a
   * run up here, so each finds the same run.
   *
   * @example
   * await history.findRun("B2C3D4");
   * // { found: "one", run: "run_mfx3k2a1_a1b2c3d4" }
   */
  async findRun(typed: string): Promise<RunLookup<string>> {
    // The list first, so a full id in capitals becomes the id as stored before
    // the store reads a log with it: on Windows the file system ignores case,
    // and the store would open the run's log under the wrong id and refuse it.
    const ids = (await this.#runs.list()).map((run) => run.id);
    const wanted = typed.toLowerCase();
    const sameId = ids.find((id) => id.toLowerCase() === wanted);
    if (sameId !== undefined) {
      return { found: "one", run: sameId };
    }
    // Then the id as typed: the list may lag the log (RunStore.list), and a
    // run that has only just started must be found by its full id.
    if ((await this.#runs.events(typed)).length > 0) {
      return { found: "one", run: typed };
    }
    if (!looksLikeShortRunId(typed)) {
      return { found: "none" };
    }
    const [first, ...others] = ids.filter((id) => id.toLowerCase().endsWith(wanted));
    if (first === undefined) {
      return { found: "none" };
    }
    // The end of the stored id that was typed, so its case is as stored.
    return others.length > 0
      ? { found: "several", shortId: first.slice(-typed.length) }
      : { found: "one", run: first };
  }

  /**
   * One run, real or test, with its summary and its whole log
   * (requirements `app.run-show` and `app.run-short-id`). The run is looked
   * up as {@link RunHistory.findRun} does. The summary is worked out from the
   * same events it comes with, so the two always agree, even while the run
   * goes on.
   *
   * @example
   * await history.showRun("01JD8Q");
   * // { found: "one", run: { summary: { id: "01JD8Q", status: "completed", … }, events: [run.started, …] } }
   */
  async showRun(typed: string): Promise<RunLookup<RunDetail>> {
    const lookup = await this.findRun(typed);
    if (lookup.found !== "one") return lookup;
    const events = await this.#runs.events(lookup.run);
    const summary = summarize(events);
    if (summary === null) return { found: "none" };
    return { found: "one", run: { summary, events } };
  }

  /**
   * The child run a failed run's step failed with, and its whole log, so a
   * caller can say the child's cause on the parent's line (requirement
   * `app.failed-child-run`). `undefined` when the run failed with no child,
   * or the child's log is gone.
   *
   * @example
   * await history.failedChild(run);
   * // { item: 1, run: { summary: { id: "run_a1.4.1", status: "failed", … }, events: […] } }
   */
  async failedChild(run: RunDetail): Promise<FailedChildRun | undefined> {
    const child = failedChildOf(run.events);
    if (child === undefined) return undefined;
    const events = await this.#runs.events(child.runId);
    const summary = summarize(events);
    if (summary === null) return undefined;
    return { item: child.item, run: { summary, events } };
  }

  /**
   * The run a waiting run's answer goes to, and its whole log, when the run
   * waits because a child run it started waits (requirement
   * `app.waiting-child-run`): the child it waits on, or that child's own
   * waiting child, down to the run that waits for the person. `undefined`
   * when the run doesn't wait on a child, a log on the way is gone, or the
   * runs go deeper than {@link maxChildDepth}.
   *
   * @example
   * await history.waitingChild(run);
   * // { summary: { id: "run_triage.2", status: "waiting", accepts: ["approve", "reject"], … }, events: […] }
   */
  async waitingChild(run: RunDetail): Promise<RunDetail | undefined> {
    let childId = waitingOnOf(run.summary);
    for (let depth = 0; childId !== undefined && depth < maxChildDepth; depth++) {
      const events = await this.#runs.events(childId);
      const summary = summarize(events);
      if (summary === null) return undefined;
      const next = waitingOnOf(summary);
      if (next === undefined) return { summary, events };
      childId = next;
    }
    return undefined;
  }
}

/** How many runs deep {@link RunHistory.waitingChild} follows a run waiting on its child. */
const maxChildDepth = 8;

/** The child run a waiting run waits on; `undefined` for any other run. */
function waitingOnOf(summary: RunSummary): string | undefined {
  return summary.status === "waiting" && summary.waitingOn !== null ? summary.waitingOn : undefined;
}

/** The child run a failed run's step failed with, as {@link RunHistory.failedChild} reads it. */
export interface FailedChildRun {
  /** The for-each item it ran for, 0-based; `undefined` for a `workflow` step. */
  readonly item: number | undefined;
  readonly run: RunDetail;
}
