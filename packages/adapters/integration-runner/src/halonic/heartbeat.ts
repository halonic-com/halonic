// Between calls Halonic pings the runner and stops it when it doesn't answer
// in time, which catches a busy loop without any help from the OS (A37). It
// also stops a runner that has had no call for a while; the next call starts
// a new one.

import type { RunnerLimits } from "./limits.ts";

/** What the heartbeat needs from the bridge. */
export interface HeartbeatHooks {
  sendPing(n: number): void;
  /** The runner didn't answer a ping in time. */
  onMissedPong(): void;
  /** No call for the idle time. */
  onIdle(): void;
}

/** The ping and the idle timer for one runner. */
export class Heartbeat {
  readonly #limits: RunnerLimits;
  readonly #hooks: HeartbeatHooks;
  #nextPing = 0;
  /** The ping waiting for its `pong`, if any. */
  #waitingFor: number | null = null;
  #pingTimer: ReturnType<typeof setInterval> | undefined;
  #pongTimer: ReturnType<typeof setTimeout> | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(limits: RunnerLimits, hooks: HeartbeatHooks) {
    this.#limits = limits;
    this.#hooks = hooks;
  }

  /** No call is running: ping regularly and count down to the idle stop. */
  betweenCalls(): void {
    this.#stopBetweenCallTimers();
    this.#pingTimer = setInterval(() => this.#ping(), this.#limits.pingIntervalMs);
    this.#idleTimer = setTimeout(() => this.#hooks.onIdle(), this.#limits.idleStopMs);
  }

  /** A call is running: no pings and no idle stop. A ping already sent still needs its answer. */
  duringCall(): void {
    this.#stopBetweenCallTimers();
  }

  /**
   * Takes a `pong` frame. Returns false when it answers no ping Halonic is
   * waiting for (A33).
   */
  pong(n: number): boolean {
    if (this.#waitingFor !== n) return false;
    this.#waitingFor = null;
    clearTimeout(this.#pongTimer);
    return true;
  }

  /** Clears every timer, when the runner stops. */
  stop(): void {
    this.#stopBetweenCallTimers();
    clearTimeout(this.#pongTimer);
  }

  #ping(): void {
    // The previous ping is still unanswered; its own timer stops the runner.
    if (this.#waitingFor !== null) return;
    const n = this.#nextPing;
    this.#nextPing += 1;
    this.#waitingFor = n;
    this.#pongTimer = setTimeout(() => this.#hooks.onMissedPong(), this.#limits.pongTimeoutMs);
    this.#hooks.sendPing(n);
  }

  #stopBetweenCallTimers(): void {
    clearInterval(this.#pingTimer);
    clearTimeout(this.#idleTimer);
  }
}
