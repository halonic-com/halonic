import { type ComputerId, type PhoneStatus, phoneStatusLabelState } from "../phone-tunnel.ts";

/** How long the first reach of a computer waits for an answer (first-run-progress 6). */
export const FIRST_REACH_LIMIT_MS = 30_000;

/** A computer the phone opened and hasn't reached yet. */
export interface FirstReach {
  readonly since: Date;
  /** No answer in {@link FIRST_REACH_LIMIT_MS}, or a try failed: the screen shows the give-up. */
  readonly gaveUp: boolean;
}

/** A reach with the timer that gives it up; a reach that gave up has none. */
type Timed = FirstReach & { readonly timer?: ReturnType<typeof setTimeout> };

/**
 * The first reach of each computer the phone opened and hasn't reached since (first-run-progress
 * section 6). A reach gives up after {@link FIRST_REACH_LIMIT_MS} without an answer, or at once
 * when a try fails, and stays given up while the tunnel tries again in the background, until Try
 * again starts it over. An answer, or a standing such as Removed, ends it.
 */
export class FirstReaches {
  readonly #reaches = new Map<ComputerId, Timed>();
  readonly #clock: () => Date;
  /** Told when a reach gives up on its own, at the time limit. */
  readonly #onGaveUp: () => void;

  constructor(clock: () => Date, onGaveUp: () => void) {
    this.#clock = clock;
    this.#onGaveUp = onGaveUp;
  }

  /** The computer's reach, if one is under way or gave up. */
  get(computer: ComputerId): FirstReach | undefined {
    const reach = this.#reaches.get(computer);
    return reach === undefined ? undefined : { since: reach.since, gaveUp: reach.gaveUp };
  }

  has(computer: ComputerId): boolean {
    return this.#reaches.has(computer);
  }

  /** Starts a reach, or starts it over, from now. */
  start(computer: ComputerId): void {
    this.stop(computer);
    const timer = setTimeout(() => {
      this.#giveUp(computer);
      this.#onGaveUp();
    }, FIRST_REACH_LIMIT_MS);
    this.#reaches.set(computer, { since: this.#clock(), gaveUp: false, timer });
  }

  /** A failed try gives the reach up; an answer or a standing ends it; a retry changes nothing. */
  follow(computer: ComputerId, status: PhoneStatus): void {
    if (!this.#reaches.has(computer)) return;
    const state = phoneStatusLabelState(status);
    if (state === "unreachable") this.#giveUp(computer);
    else if (state !== "reconnecting" && state !== "phoneOffline") this.stop(computer);
  }

  stop(computer: ComputerId): void {
    clearTimeout(this.#reaches.get(computer)?.timer);
    this.#reaches.delete(computer);
  }

  stopAll(): void {
    for (const computer of [...this.#reaches.keys()]) this.stop(computer);
  }

  #giveUp(computer: ComputerId): void {
    const reach = this.#reaches.get(computer);
    if (reach === undefined || reach.gaveUp) return;
    clearTimeout(reach.timer);
    this.#reaches.set(computer, { since: reach.since, gaveUp: true });
  }
}
