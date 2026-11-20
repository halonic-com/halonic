import { pairingRules } from "@halonicjs/ports";
import type { RemoteTime } from "./remote-time.ts";

const minuteMs = 60_000;

/**
 * The host's failed pairing tries over the last minute, across every code
 * (ADR "Pairing and the end-to-end session", pairing rules). Once it holds
 * `pairingRules.failedTriesPerMinute`, the host refuses pairing message 1
 * until the oldest of them is a minute old.
 */
export class FailedTries {
  readonly #time: RemoteTime;
  #at: number[] = [];

  constructor(time: RemoteTime) {
    this.#time = time;
  }

  /** Counts one failed try now. */
  count(): void {
    this.#at.push(this.#time.now().getTime());
  }

  /** Whether the host has had as many failed tries this minute as it takes. */
  get full(): boolean {
    const since = this.#time.now().getTime() - minuteMs;
    this.#at = this.#at.filter((at) => at > since);
    return this.#at.length >= pairingRules.failedTriesPerMinute;
  }
}
