// Halonic's table of the runner's tool calls. A call is `running` from its
// `call` frame until its `result`, or until it is cancelled. A cancelled call
// has given up on its answer but still runs in the runner, so it stays in
// the table until the runner answers, and the runner is stopped if that takes
// longer than the grace. When a call stops running, the bridge closes its
// requests (HAL-4353).

import { isErrorKind } from "@halonicjs/std";
import type { RunnerFrame } from "../frames.ts";
import {
  RunnerCallTimeoutError,
  type RunnerLimits,
  RunnerToolError,
  type RunnerToolFailure,
} from "./limits.ts";

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
  /** A call stopped running: it answered, was cancelled, or failed with the runner. */
  onEnded(call: number): void;
}

interface TableCall {
  state: "running" | "cancelled";
  resolve(text: string): void;
  reject(error: unknown): void;
  /** Clears the call's timers and its abort listener. */
  cleanUp(): void;
}

/** A `result` frame's outcome: its text, or its error with what the runner said about why. */
type ResultOutcome = Pick<
  Extract<RunnerFrame, { type: "result" }>,
  "text" | "error" | "kind" | "failureCause"
>;

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

  /** The number the next call gets. Numbers only go up. */
  get nextCall(): number {
    return this.#nextId;
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
    // Throws when the arguments are too large to send. The number is taken
    // only once the frame is sent, so the runner can't use one it never saw.
    this.#hooks.send({ type: "call", call: id, name, args });
    this.#nextId += 1;
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
  settle(call: number, outcome: ResultOutcome): boolean {
    const entry = this.#calls.get(call);
    if (entry === undefined) return false;
    this.#remove(call, entry);
    if (entry.state === "cancelled") return true;
    this.#hooks.onEnded(call);
    if (outcome.error !== undefined) {
      entry.reject(
        new RunnerToolError(this.#hooks.filter(outcome.error), this.#failureOf(outcome)),
      );
    } else {
      entry.resolve(this.#hooks.filter(outcome.text ?? ""));
    }
    return true;
  }

  /**
   * What the runner said about why a call failed. A `kind` that is not an
   * error kind is dropped. A `code`, a `detail` key or a `detail` value the
   * secret filter changes is dropped, never kept in its filtered form: a changed value is
   * not what the integration meant, and may hold part of a secret.
   */
  #failureOf(outcome: ResultOutcome): RunnerToolFailure {
    const failure: RunnerToolFailure = {};
    if (isErrorKind(outcome.kind)) failure.kind = outcome.kind;
    const named = outcome.failureCause;
    if (named === undefined) return failure;
    const cause: NonNullable<RunnerToolFailure["failureCause"]> = {};
    if (named.code !== undefined && this.#isUnchanged(named.code)) cause.code = named.code;
    const kept = Object.entries(named.detail ?? {}).filter(
      ([key, value]) => this.#isUnchanged(key) && this.#isUnchanged(value),
    );
    if (kept.length > 0) cause.detail = Object.fromEntries(kept);
    if (cause.code !== undefined || cause.detail !== undefined) failure.failureCause = cause;
    return failure;
  }

  #isUnchanged(text: string): boolean {
    return this.#hooks.filter(text) === text;
  }

  /** Fails every call with `error`, when the runner stops. */
  failAll(error: Error): void {
    for (const [call, entry] of this.#calls) {
      this.#remove(call, entry);
      if (entry.state === "running") {
        entry.reject(error);
        this.#hooks.onEnded(call);
      }
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
    this.#hooks.onEnded(call);
  }

  #remove(call: number, entry: TableCall): void {
    entry.cleanUp();
    this.#calls.delete(call);
    if (this.#calls.size === 0) this.#hooks.onIdle();
  }
}
