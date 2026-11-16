import { randomUUID } from "node:crypto";
import type { HarnessEvent, HarnessInput, HarnessRun, HarnessTask } from "@halonicjs/ports";

/** Who is told what happens to the runs in the table, such as the remote gateway's ledger. */
export interface RunObserver {
  started(id: string, task: HarnessTask): void;
  event(id: string, event: HarnessEvent): void;
  answered(id: string, input: HarnessInput): void;
  ended(id: string, outcome: "done" | "failed"): void;
}

/**
 * The harness runs the host has going, by an id it made. A run is here from
 * its start until its event stream ends; the host cancels every run left
 * when it stops, before it closes their sandbox sessions.
 */
export class RunTable {
  private readonly runs = new Map<string, HarnessRun>();
  private stopping = false;
  private readonly observer: RunObserver | undefined;
  private readonly log: (text: string) => void;

  /**
   * @param observer - told about each run's start, events, answers and end;
   *   an error it throws is logged and dropped, never failing the run
   * @param log - where such an error is written
   */
  constructor(
    observer?: RunObserver,
    log: (text: string) => void = (text) => process.stderr.write(text),
  ) {
    this.observer = observer;
    this.log = log;
  }

  /** Tells the observer, so that a fault in it never breaks a local run. */
  private tell(tell: (observer: RunObserver) => void): void {
    if (this.observer === undefined) return;
    try {
      tell(this.observer);
    } catch (error) {
      this.log(
        `A run observer failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  /** True once {@link RunTable.cancelAll} has started: the host starts no more runs. */
  get isStopping(): boolean {
    return this.stopping;
  }

  add(run: HarnessRun, task: HarnessTask): string {
    const id = randomUUID();
    this.runs.set(id, run);
    this.tell((observer) => observer.started(id, task));
    return id;
  }

  /** The run reported an event. */
  record(id: string, event: HarnessEvent): void {
    this.tell((observer) => observer.event(id, event));
  }

  /**
   * Passes a person's answer to the run: the one road for an answer from
   * Studio and from a phone.
   *
   * @throws when there is no such run, or the run refuses the answer
   */
  async send(id: string, input: HarnessInput): Promise<void> {
    const run = this.runs.get(id);
    if (run === undefined) throw new Error("The agent host has no harness run with this id.");
    await run.send(input);
    this.tell((observer) => observer.answered(id, input));
  }

  get(id: string): HarnessRun | undefined {
    return this.runs.get(id);
  }

  /** Forgets a run whose stream has ended, `failed` or not. */
  remove(id: string, outcome: "done" | "failed"): void {
    this.runs.delete(id);
    this.tell((observer) => observer.ended(id, outcome));
  }

  /** Cancels every run, when the host stops. One that fails to stop doesn't stop the others. */
  async cancelAll(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.runs.values()].map((run) => run.cancel()));
  }
}
