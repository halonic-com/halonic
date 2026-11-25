import type { AgentNotice, NoticeTarget, Notifier } from "@halonicjs/studio-services";
import {
  endedRuns,
  failedRunsNotice,
  type NotifiableRun,
  type RunNotificationSettings,
  runNotice,
} from "./run-notices.ts";

/** How long failures after a shown one wait, to show together as one notification. */
export const failureGroupMs = 60_000;

/** Every source's runs, read again whenever one reports a change. */
export interface RunsReader {
  read(): Promise<readonly NotifiableRun[]>;
  changes(): AsyncIterable<unknown>;
}

/** What {@link watchRunNotifications} needs besides the runs and the notifier. */
export interface RunNotificationsOptions {
  /** The switches as set now; read on every change. */
  settings(): RunNotificationSettings;
  now(): Date;
  /** Opens Runs on the run, or on the Failed group. It only shows it. */
  open(target: NoticeTarget): void;
  /** Hears a failed read or a notification the system refused; the watch goes on. */
  onError(error: unknown): void;
}

/** A running watch; `stop` ends it and resolves once it has. */
export interface RunNotificationsWatch {
  /** Resolves once the first read is in: what it found shows nothing. */
  readonly ready: Promise<void>;
  stop(): Promise<void>;
}

interface Reading {
  readonly runs: readonly NotifiableRun[];
  readonly at: Date;
}

/**
 * Shows a notification for each run that fails or finishes, as the user's
 * switches allow (requirement `runs.run-notifications`). A failure shows at
 * once; failures in the minute after it wait and then show as one, such as
 * "3 runs failed". What is there when the watch starts shows nothing.
 *
 * @example
 * const watch = watchRunNotifications(runs, quietNotifier, { settings, now, open, onError });
 * await watch.stop();
 */
export function watchRunNotifications(
  runs: RunsReader,
  notifier: Notifier,
  options: RunNotificationsOptions,
): RunNotificationsWatch {
  // Listen before the first read, so a change between the two isn't missed.
  const changes = runs.changes()[Symbol.asyncIterator]();
  // A reader's `return` need not settle a `next` already waiting, so stopping also ends the wait.
  let endWait: (end: IteratorResult<unknown>) => void = () => undefined;
  const stopped = new Promise<IteratorResult<unknown>>((resolve) => {
    endWait = resolve;
  });
  const next = () => Promise.race([changes.next(), stopped]);
  const failures = new FailureGroups((notice) => show(notice, notifier, options));
  const first = readOrReport(runs, options);
  const running = follow(runs, next, first, notifier, failures, options);
  return {
    ready: first.then(() => undefined),
    async stop() {
      endWait({ done: true, value: undefined });
      failures.stop();
      await changes.return?.();
      await running;
    },
  };
}

async function follow(
  runs: RunsReader,
  nextChange: () => Promise<IteratorResult<unknown>>,
  first: Promise<Reading | undefined>,
  notifier: Notifier,
  failures: FailureGroups,
  options: RunNotificationsOptions,
): Promise<void> {
  let last = await first;
  for (let change = await nextChange(); change.done !== true; change = await nextChange()) {
    const next = await readOrReport(runs, options);
    if (last !== undefined && next !== undefined) {
      const readings = { before: last.runs, after: next.runs, since: last.at };
      const ended = endedRuns(readings, options.settings());
      failures.add(ended.filter((run) => run.phase === "failed"));
      for (const run of ended.filter((each) => each.phase === "succeeded")) {
        await show(runNotice(run), notifier, options);
      }
    }
    last = next ?? last;
  }
}

async function readOrReport(
  runs: RunsReader,
  options: RunNotificationsOptions,
): Promise<Reading | undefined> {
  try {
    const at = options.now();
    return { runs: await runs.read(), at };
  } catch (error) {
    options.onError(error);
    return undefined;
  }
}

/** Shows a notice; a refusal is reported, never left to end the watch. */
async function show(
  notice: AgentNotice,
  notifier: Notifier,
  options: RunNotificationsOptions,
): Promise<void> {
  try {
    await notifier.show(notice, () => options.open(notice.target));
  } catch (error) {
    options.onError(error);
  }
}

/**
 * Failures, one notification per minute at most: the first shows at once and
 * opens a minute; what fails in it is held and shown together when it ends,
 * which opens the next minute.
 */
class FailureGroups {
  readonly #show: (notice: AgentNotice) => Promise<void>;
  #held: NotifiableRun[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(show: (notice: AgentNotice) => Promise<void>) {
    this.#show = show;
  }

  add(failed: readonly NotifiableRun[]): void {
    if (failed.length === 0) {
      return;
    }
    if (this.#timer !== undefined) {
      this.#held.push(...failed);
      return;
    }
    this.#showNow(failed);
  }

  /** Drops what is held and the minute waiting for it. */
  stop(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#held = [];
  }

  #showNow(failed: readonly NotifiableRun[]): void {
    const [only] = failed;
    const notice =
      failed.length === 1 && only !== undefined ? runNotice(only) : failedRunsNotice(failed);
    void this.#show(notice);
    this.#timer = setTimeout(() => this.#endMinute(), failureGroupMs);
  }

  #endMinute(): void {
    const held = this.#held;
    this.stop();
    if (held.length > 0) {
      this.#showNow(held);
    }
  }
}
