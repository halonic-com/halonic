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
 * the first win, a run that finished after **Approve**. Other open folders share that state, so
 * it reads it again before every change, whenever the window shows the folder and when another
 * window saved it (`first-run.one-state`). Whether the folder is the demo is known only once the window has
 * marked it, after it opened, so the window calls {@link notice} when it shows.
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
  readonly #stopWatchingSample: () => void;
  readonly #stopWatchingDevice: () => void;
  /** The finished runs whose log was read, and whether it held an Approve. */
  readonly #answers = new Map<string, Promise<boolean>>();
  #state: FirstRunState;
  /** The text the device held when this folder last read or saved it. */
  #seen: string | undefined;
  #disposed = false;
  /**
   * Whether the Pick a model screen is open. It isn't saved: after a restart the guide card is
   * back, one press from the screen. While it is open the runs don't move the steps, so a change
   * in the runs list never closes the screen under the person.
   */
  #picking = false;
  /**
   * The newest run when Continue started one, until the runs list shows the new run: that older
   * run would put the steps back where it ended.
   */
  #before: string | undefined;
  /** The run going when the runs last changed, so a new one tells even when the steps stay. */
  #lastRunningId: string | undefined;
  /** The run that was the first win here, for "You did it" once the state is `done`. */
  #wonRunId: string | undefined;

  constructor(
    runs: FirstRunRuns,
    sample: Pick<SampleWorkspace, "isSample" | "onMarkedSample">,
    device: FirstRunDevice,
    now: () => Date,
  ) {
    this.#runs = runs;
    this.#sample = sample;
    this.#device = device;
    this.#now = now;
    this.#seen = device.read();
    this.#state = parseFirstRun(this.#seen);
    this.#stopWatching = runs.subscribe(() => {
      this.#tellNewRunning();
      void this.#follow();
    });
    // Open demo on a folder that is open already marks it without opening it again.
    this.#stopWatchingSample = sample.onMarkedSample?.(() => this.notice()) ?? (() => {});
    // Only reads: starting the first run here on another window's change would race Start over's
    // new copy, which turns it off there and then starts it in the copy.
    this.#stopWatchingDevice = device.onChanged?.(() => this.#refresh()) ?? (() => {});
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

  /**
   * The window shows the folder: reads the device's state again, for what another open folder
   * changed, and starts the first run when the folder is the demo and it never started here.
   */
  notice(): void {
    if (this.#disposed) return;
    this.#refresh();
    if (this.#state.kind === "off" && this.#sample.isSample()) {
      this.send({
        kind: "demo-opened",
        folder: this.#device.folder,
        at: this.#now().toISOString(),
      });
    }
  }

  /** Whether the Pick a model screen is open in this folder. */
  get isPicking(): boolean {
    return this.#picking && this.isOnHere;
  }

  /**
   * The run of Support reply the first run is at: the newest since it began here, while it is on
   * at Run and the run is going, for **Cancel run**; `undefined` otherwise.
   */
  get runningId(): string | undefined {
    const state = this.#state;
    if (state.kind !== "on" || state.step !== "run" || state.failed || state.ended)
      return undefined;
    const run = this.#newestRun();
    if (run?.id === this.#before) return undefined;
    return run?.status === "running" ? run.id : undefined;
  }

  /**
   * Whether `runId` is the first run's run in the open folder: the newest run of Support reply
   * since it began, while it is on, or the run that was its first win. "You did it" claims only
   * that run's Approve, which can come back before or after the runs list moves the steps.
   */
  isFirstRun(runId: string): boolean {
    if (this.isOnHere) return this.#newestRun()?.id === runId;
    const state = this.#state;
    return (
      state.kind === "done" && state.folder === this.#device.folder && this.#wonRunId === runId
    );
  }

  /** Opens the Pick a model screen, from **Run your first workflow** or **Pick another model**. */
  pickModel(): void {
    if (!this.isOnHere) return;
    this.#picking = true;
    this.send({ kind: "model-picking" });
    this.#tell();
  }

  /**
   * Closes the Pick a model screen: after **Back** the steps follow the runs again (`model-closed`).
   * After Continue the first run is at Run at once, so the bar offers **Cancel run** before the
   * runs list has the new run, and that run moves the steps from then on.
   */
  closePicker(after: "back" | "started"): void {
    if (!this.#picking) return;
    this.#picking = false;
    if (after === "back") {
      this.#before = undefined;
      this.send({ kind: "model-closed" });
    } else {
      this.#before = this.#newestRun()?.id;
      this.send({ kind: "run-started" });
    }
    this.#tell();
    void this.#follow();
  }

  /** Whether the open folder is the demo, where **Help › First run** shows the guide. */
  get isDemo(): boolean {
    return this.#sample.isSample();
  }

  /** Whether **Start over** can copy the demo again here. */
  get canStartOver(): boolean {
    return this.#device.startOver !== undefined;
  }

  /**
   * **Show the guide again**: takes a first run paused or dismissed here up again at its step,
   * else begins it again at Demo.
   */
  showGuide(): void {
    if (this.isOnHere) return;
    this.send({
      kind: "guide-reopened",
      folder: this.#device.folder,
      at: this.#now().toISOString(),
    });
  }

  /**
   * **Start over**: the app copies the demo again, and once the copy is written the first run goes
   * off, so the copy starts it when it opens. A copy that can't be written leaves it as it was.
   */
  startOver(): void {
    if (this.#device.startOver === undefined) return;
    // Two Start overs before the copy is written both reset; the second is a no-op on `off`.
    this.#device.startOver(() => this.send({ kind: "reset" }));
  }

  /**
   * Applies `event` to the state the device holds now, then saves and tells the listeners if the
   * state changed. An event about the first run's folder changes nothing once it is elsewhere.
   */
  send(event: FirstRunEvent): void {
    if (this.#disposed) return;
    const reloaded = this.#reload();
    const next = this.#isAbout(event) ? nextFirstRun(this.#state, event) : this.#state;
    const text = serializeFirstRun(next);
    if (text === serializeFirstRun(this.#state)) {
      if (reloaded) this.#changed();
      return;
    }
    this.#state = next;
    this.#device.write(text);
    // A save that failed leaves the old text, which then isn't another folder's change.
    this.#seen = this.#device.read();
    this.#changed();
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
    this.#stopWatchingSample();
    this.#stopWatchingDevice();
    this.#listeners.clear();
  }

  /** Takes what another folder saved, if anything, and tells the listeners. */
  #refresh(): void {
    if (this.#disposed) return;
    if (this.#reload()) this.#changed();
  }

  /** Takes the device's state when another folder saved one since; tells whether it did. */
  #reload(): boolean {
    const text = this.#device.read();
    if (text === this.#seen) return false;
    this.#seen = text;
    const saved = parseFirstRun(text);
    if (serializeFirstRun(saved) === serializeFirstRun(this.#state)) return false;
    this.#state = saved;
    return true;
  }

  /** Whether `event` may change the state: one about the first run's folder only from there. */
  #isAbout(event: FirstRunEvent): boolean {
    if (event.kind === "demo-opened" || event.kind === "guide-reopened" || event.kind === "reset") {
      return true;
    }
    return this.#state.kind !== "off" && this.#state.folder === this.#device.folder;
  }

  /** Tells the listeners the state changed, and follows the runs again when it is on. */
  #changed(): void {
    this.#tell();
    // Back on (Continue, Start over, another folder): the runs may have moved on meanwhile.
    if (this.#state.kind === "on") void this.#follow();
  }

  #tell(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  /**
   * Tells when another run is going: a run started from the page's Run form or the CLI moves no
   * step while the first run is at Run, but the bar's **Cancel run** is its way out.
   */
  #tellNewRunning(): void {
    const runningId = this.runningId;
    if (runningId === this.#lastRunningId) return;
    this.#lastRunningId = runningId;
    this.#tell();
  }

  /** Moves the steps by the newest run of Support reply since the first run began here. */
  async #follow(): Promise<void> {
    // Only tells: this is following the runs already.
    if (this.#reload()) this.#tell();
    if (this.#picking) return;
    const newest = this.#newestRun();
    if (newest === undefined) return;
    if (newest.id === this.#before) return;
    this.#before = undefined;
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
    if (this.#picking) return;
    if (event.kind === "first-win") this.#wonRunId = newest.id;
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
        // **Cancel run** ends the run as cancelled: it is over without a win, not a failure.
        return run.reason === "cancelled" ? { kind: "run-ended" } : { kind: "run-failed" };
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
