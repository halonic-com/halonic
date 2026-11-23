import { type ComputerId, type PhoneStatus, phoneStatusLabelState } from "../phone-tunnel.ts";

/** How long the first reach of a computer waits for an answer (first-run-progress 6). */
export const FIRST_REACH_LIMIT_MS = 30_000;

/** A computer the phone opened and hasn't reached yet. */
export interface FirstReach {
  readonly since: Date;
  /** No answer in {@link FIRST_REACH_LIMIT_MS}, or a try failed: the screen shows the give-up. */
  readonly gaveUp: boolean;
}

/**
 * A reach with the timer that gives it up; a reach that gave up has none. A held reach has no
 * timer either, and `heldAt` says when the wait stopped counting.
 */
type Timed = FirstReach & {
  readonly timer?: ReturnType<typeof setTimeout>;
  readonly heldAt?: Date;
};

/**
 * The first reach of each computer the phone opened and hasn't reached since (first-run-progress
 * section 6). A reach gives up after {@link FIRST_REACH_LIMIT_MS} without an answer, or at once
 * when a try fails, and stays given up while the tunnel tries again in the background, until Try
 * again starts it over. An answer, or a standing such as Removed, ends it. While the phone is
 * offline, the app is away or the tunnel is closed, the wait holds: no answer could come, so
 * those seconds don't count, and the wait goes on from where it was once the tunnel tries again.
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

  /** Starts a reach, or starts it over, from now; held at once if `status` holds the wait. */
  start(computer: ComputerId, status?: PhoneStatus): void {
    this.stop(computer);
    const timer = this.#timer(computer, FIRST_REACH_LIMIT_MS);
    this.#reaches.set(computer, { since: this.#clock(), gaveUp: false, timer });
    if (status !== undefined && holdsTheWait(status)) this.#hold(computer);
  }

  /**
   * A failed try gives the reach up; an answer or a standing ends it; an offline phone, a paused
   * app or a closed tunnel holds the wait; a retry carries a held wait on.
   */
  follow(computer: ComputerId, status: PhoneStatus): void {
    if (!this.#reaches.has(computer)) return;
    const state = phoneStatusLabelState(status);
    if (state === "unreachable") this.#giveUp(computer);
    else if (state === "reconnecting") this.#carryOn(computer);
    else if (holdsTheWait(status)) this.#hold(computer);
    else this.stop(computer);
  }

  stop(computer: ComputerId): void {
    clearTimeout(this.#reaches.get(computer)?.timer);
    this.#reaches.delete(computer);
  }

  stopAll(): void {
    for (const computer of [...this.#reaches.keys()]) this.stop(computer);
  }

  #timer(computer: ComputerId, ms: number): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.#giveUp(computer);
      this.#onGaveUp();
    }, ms);
  }

  #giveUp(computer: ComputerId): void {
    const reach = this.#reaches.get(computer);
    if (reach === undefined || reach.gaveUp) return;
    clearTimeout(reach.timer);
    this.#reaches.set(computer, { since: reach.since, gaveUp: true });
  }

  /** Stops the wait's count; a reach that gave up stays given up. */
  #hold(computer: ComputerId): void {
    const reach = this.#reaches.get(computer);
    if (reach === undefined || reach.gaveUp || reach.heldAt !== undefined) return;
    clearTimeout(reach.timer);
    this.#reaches.set(computer, { since: reach.since, gaveUp: false, heldAt: this.#clock() });
  }

  /**
   * Counts a held wait on from where it stopped: `since` moves forward by the time held, so the
   * waiting line's seconds and the time left both leave out the seconds no answer could come.
   */
  #carryOn(computer: ComputerId): void {
    const reach = this.#reaches.get(computer);
    if (reach === undefined || reach.heldAt === undefined) return;
    const waitedMs = reach.heldAt.getTime() - reach.since.getTime();
    const heldMs = this.#clock().getTime() - reach.heldAt.getTime();
    const since = new Date(reach.since.getTime() + heldMs);
    const timer = this.#timer(computer, Math.max(0, FIRST_REACH_LIMIT_MS - waitedMs));
    this.#reaches.set(computer, { since, gaveUp: false, timer });
  }
}

/** The phone is offline, the app is away or the tunnel is closed: no answer can come now. */
function holdsTheWait(status: PhoneStatus): boolean {
  const state = phoneStatusLabelState(status);
  return state === "phoneOffline" || state === "keep" || state === "none";
}
