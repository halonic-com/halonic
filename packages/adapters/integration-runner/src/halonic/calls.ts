// Halonic's table of the runner's tool calls. A call is `running` from its
// `call` frame until its `result`, or until it is cancelled. A cancelled call
// has given up on its answer but still runs in the runner, so it stays in
// the table until the runner answers, and the runner is stopped if that takes
// longer than the grace.

import { RunnerCallTimeoutError, type RunnerLimits, RunnerToolError } from "./limits.ts";

/** What the call table needs from the bridge. */
export interface CallTableHooks {
  /** Sends a `call` or `cancel` frame. Throws when the frame is too large to send. */
  send(frame: { type: "call"; call: number; name: string; args: Record<string, unknown> }): void;
  sendCancel(call: number): void;
  /** Filters text that leaves the runner. */
  filter(text: string): string;
  /** A cancelled call didn't answer within the grace. */
  onGraceOver(): void;
  /** The first call started after none were left in the table. */
  onBusy(): void;
  /** The last call left the table. */
  onIdle(): void;
}

interface TableCall {
  state: "running" | "cancelled";
  resolve(text: string): void;
  reject(error: unknown): void;
  /** Clears the call's timers and its abort listener. */
  cleanUp(): void;
}

/** Halonic's record of the runner's calls. */
export class CallTable {
  readonly #limits: RunnerLimits;
  readonly #hooks: CallTableHooks;
  readonly #calls = new Map<number, TableCall>();
  #nextId = 0;

  constructor(limits: RunnerLimits, hooks: CallTableHooks) {
    this.#limits = limits;
    this.#hooks = hooks;
  }

  /** Whether Halonic ever started a call with this number. */
  wasStarted(call: number): boolean {
    return call < this.#nextId;
  }

  /** Whether the call is still running, so a `fetch` for it is allowed (A37). */
  isRunning(call: number): boolean {
    return this.#calls.get(call)?.state === "running";
  }

  /**
   * Starts a call and settles with its result. Aborting `signal`, or running
   * past the call time limit, cancels it.
   */
  start(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const id = this.#nextId;
    this.#nextId += 1;
    // Throws before the call is in the table when its arguments are too large to send.
    this.#hooks.send({ type: "call", call: id, name, args });
    return new Promise<string>((resolve, reject) => {
      const deadline = setTimeout(
        () => this.#cancel(id, new RunnerCallTimeoutError("the tool call took too long")),
        this.#limits.callTimeoutMs,
      );
      const onAbort = () => this.#cancel(id, signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const cleanUp = () => {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", onAbort);
      };
      if (this.#calls.size === 0) this.#hooks.onBusy();
      this.#calls.set(id, { state: "running", resolve, reject, cleanUp });
    });
  }

  /**
   * Takes a `result` frame. Returns false when no call with that number is
   * waiting for one: a result Halonic never asked for, or a second one (A33).
   */
  settle(
    call: number,
    outcome: { text?: string | undefined; error?: string | undefined },
  ): boolean {
    const entry = this.#calls.get(call);
    if (entry === undefined) return false;
    this.#remove(call, entry);
    if (entry.state === "cancelled") return true;
    if (outcome.error !== undefined) {
      entry.reject(new RunnerToolError(this.#hooks.filter(outcome.error)));
    } else {
      entry.resolve(this.#hooks.filter(outcome.text ?? ""));
    }
    return true;
  }

  /** Fails every call with `error`, when the runner stops. */
  failAll(error: Error): void {
    for (const [call, entry] of this.#calls) {
      this.#remove(call, entry);
      if (entry.state === "running") entry.reject(error);
    }
  }

  /** Gives up on a running call: tells the runner, and waits the grace for its answer. */
  #cancel(call: number, reason: unknown): void {
    const entry = this.#calls.get(call);
    if (entry?.state !== "running") return;
    entry.cleanUp();
    entry.state = "cancelled";
    const grace = setTimeout(() => this.#hooks.onGraceOver(), this.#limits.callGraceMs);
    entry.cleanUp = () => clearTimeout(grace);
    entry.reject(reason);
    this.#hooks.sendCancel(call);
  }

  #remove(call: number, entry: TableCall): void {
    entry.cleanUp();
    this.#calls.delete(call);
    if (this.#calls.size === 0) this.#hooks.onIdle();
  }
}
