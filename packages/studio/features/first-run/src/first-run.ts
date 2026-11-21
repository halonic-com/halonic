import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import type { FirstRunDevice, SampleWorkspace } from "./api.ts";
import {
  type FirstRunEvent,
  type FirstRunState,
  nextFirstRun,
  parseFirstRun,
  serializeFirstRun,
} from "./first-run-state.ts";

/** The demo's one workflow of the first run, as its id is in Acme. */
export const SUPPORT_WORKFLOW = "support-reply";

/** The hub of Acme that holds {@link SUPPORT_WORKFLOW}. */
export const SUPPORT_HUB = "support";

/** What the first run reads of the runs list: its runs, and a finished run's log. */
export type FirstRunRuns = Pick<RunsList, "state" | "subscribe"> & {
  readonly source: Pick<RunsList["source"], "log">;
};

/**
 * The first run as the open folder sees it (`first-run.state`). It keeps the device's one state,
 * saved through the app after every change, and moves its steps by the runs of Support reply
 * in the folder the first run is in: started, waiting for you, failed, ended without a win, and
 * the first win, a run that finished after **Approve**. Whether the folder is the demo is known
 * only once the window has marked it, after it opened, so the window calls {@link notice} when
 * it shows.
 *
 * @example
 * const firstRun = new FirstRun(runsList, sample, device, () => new Date());
 * firstRun.notice();
 * firstRun.subscribe(() => render(firstRun.state));
 */
export class FirstRun {
  readonly #runs: FirstRunRuns;
  readonly #sample: Pick<SampleWorkspace, "isSample">;
  readonly #device: FirstRunDevice;
  readonly #now: () => Date;
  readonly #listeners = new Set<() => void>();
  readonly #stopWatching: () => void;
  /** The finished runs whose log was read, and whether it held an Approve. */
  readonly #answers = new Map<string, Promise<boolean>>();
  #state: FirstRunState;
  #disposed = false;

  constructor(
    runs: FirstRunRuns,
    sample: Pick<SampleWorkspace, "isSample">,
    device: FirstRunDevice,
    now: () => Date,
  ) {
    this.#runs = runs;
    this.#sample = sample;
    this.#device = device;
    this.#now = now;
    this.#state = parseFirstRun(device.read());
    this.#stopWatching = runs.subscribe(() => void this.#follow());
    void this.#follow();
  }

  /** The first run on this device now. */
  get state(): FirstRunState {
    return this.#state;
  }

  /** Whether the first run is paused in the open folder, so the Inbox lists its setup item. */
  get isPausedHere(): boolean {
    return this.#state.kind === "paused" && this.#state.folder === this.#device.folder;
  }

  /** Whether the first run is going on in the open folder, so the bar and the guide card show. */
  get isOnHere(): boolean {
    return this.#state.kind === "on" && this.#state.folder === this.#device.folder;
  }

  /** Starts the first run when the open folder is the demo and it never started on this device. */
  notice(): void {
    if (this.#state.kind === "off" && this.#sample.isSample()) {
      this.send({
        kind: "demo-opened",
        folder: this.#device.folder,
        at: this.#now().toISOString(),
      });
    }
  }

  /** Applies `event`, then saves and tells the listeners if the state changed. */
  send(event: FirstRunEvent): void {
    if (this.#disposed) return;
    const next = nextFirstRun(this.#state, event);
    const text = serializeFirstRun(next);
    if (text === serializeFirstRun(this.#state)) return;
    this.#state = next;
    this.#device.write(text);
    for (const listener of [...this.#listeners]) listener();
    // Back on (Continue, Start over): the runs may have moved on while it was paused.
    if (next.kind === "on") void this.#follow();
  }

  /** Calls `listener` after every change of {@link state}. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stops following the runs, when the workspace closes. */
  dispose(): void {
    this.#disposed = true;
    this.#stopWatching();
    this.#listeners.clear();
  }

  /** Moves the steps by the newest run of Support reply since the first run began here. */
  async #follow(): Promise<void> {
    const newest = this.#newestRun();
    if (newest === undefined) return;
    let event: FirstRunEvent;
    try {
      event = await this.#eventOf(newest);
    } catch {
      // A log that can't be read now is read again on the runs' next change: nothing is lost.
      return;
    }
    // While the log was read, a newer run or a new status may have been followed already: this
    // answer is then stale and would move the steps back.
    const stillNewest = this.#newestRun();
    if (stillNewest?.id !== newest.id || stillNewest.status !== newest.status) return;
    this.send(event);
  }

  /** The newest run of Support reply since the first run began here, while it is on or paused. */
  #newestRun(): RunSummary | undefined {
    const state = this.#state;
    if ((state.kind !== "on" && state.kind !== "paused") || state.folder !== this.#device.folder) {
      return undefined;
    }
    // The list is newest first; a test run or an older run says nothing about this first run.
    return this.#runs.state.runs
      .map((each) => each.summary)
      .find(
        (run) =>
          run.kind === "run" && run.workflowId === SUPPORT_WORKFLOW && run.startedAt >= state.since,
      );
  }

  async #eventOf(run: RunSummary): Promise<FirstRunEvent> {
    switch (run.status) {
      case "running":
        return { kind: "run-started" };
      case "waiting":
        return { kind: "run-waiting" };
      case "failed":
      case "cant-try":
        return { kind: "run-failed" };
      case "completed":
        return (await this.#approved(run.id)) ? { kind: "first-win" } : { kind: "run-ended" };
    }
  }

  /** Whether the finished run's log holds an Approve, read once per run unless the read fails. */
  #approved(runId: string): Promise<boolean> {
    let answer = this.#answers.get(runId);
    if (answer === undefined) {
      answer = this.#runs.source.log(runId).then(hasApprove);
      answer.catch(() => this.#answers.delete(runId));
      this.#answers.set(runId, answer);
    }
    return answer;
  }
}

function hasApprove(log: readonly RunEvent[]): boolean {
  return log.some((event) => event.type === "event.received" && event.event === "approve");
}
