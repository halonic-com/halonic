import {
  DeploymentCallRefused,
  type DeploymentCalls,
  type DeploymentStreamMessage,
} from "./deployment-calls.ts";

/** One event of the run: its `seq`, the stream's event id, and its data as JSON. */
export interface FollowedEvent {
  readonly seq: number;
  readonly data: unknown;
}

/**
 * How following a run ended: `ended` when the server said the run has ended and every event was
 * sent; `refused` with the status when the server refused the stream (gone, or signed out);
 * `failed` when the shell refused, or the stream kept breaking and the last try gave up.
 */
export type FollowEnd =
  | { readonly kind: "ended" }
  | { readonly kind: "refused"; readonly status: number }
  | { readonly kind: "failed"; readonly error: unknown };

/** What {@link followDeploymentRun} needs. */
export interface FollowRunOptions {
  readonly calls: DeploymentCalls;
  readonly runId: string;
  /** The last event the page already has; the stream starts after it. */
  readonly after?: number;
  readonly onEvent: (event: FollowedEvent) => void;
  readonly onEnd: (end: FollowEnd) => void;
  /** Waits `ms` before a new try. Defaults to `setTimeout`. */
  readonly wait?: (ms: number) => Promise<void>;
  /** The time in ms. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * The waits before each new try after a stream broke, one per try. After the last, following
 * fails. An event that comes, or a stream that stayed open for {@link healthyStreamMs}, starts
 * the count again, so a run that goes quiet for hours is followed for hours.
 */
export const reconnectDelays: readonly number[] = [1_000, 2_000, 4_000, 8_000, 16_000];

/**
 * How long a stream must have stayed open to count as working. The shell ends a stream that sends
 * nothing for 2 minutes; such a stream worked, and its run is only quiet.
 */
export const healthyStreamMs = 60_000;

/** The shell's codes worth another try: the server didn't answer, or its answer broke off. */
const retriedCodes = new Set(["notAnswering", "unreadable"]);

/** How one stream ended: for good, or broken and worth another try. */
type StreamOutcome = FollowEnd | { readonly kind: "broken"; readonly error: unknown };

/**
 * Follows a run's events on an owner server (requirement `studio.deployment-calls`): opens
 * `GET /api/runs/<id>/events` through the shell and, when the stream breaks before the server's
 * `end`, opens it again after the last event it delivered, which the shell sends as
 * `Last-Event-ID`. An event whose id isn't after the last one delivered is dropped, so a replay
 * that overlaps repeats nothing. Returns how to stop; stopping hangs up and calls no `onEnd`.
 */
export function followDeploymentRun(options: FollowRunOptions): { stop(): void } {
  const follower = new RunFollower(options);
  // `onEnd` is the caller's; if it throws, say so rather than leave the rejection unhandled.
  follower.run().catch((failure: unknown) => {
    console.error("Following a run's events failed.", failure);
  });
  return { stop: () => follower.stop() };
}

class RunFollower {
  readonly #options: FollowRunOptions;
  readonly #wait: (ms: number) => Promise<void>;
  readonly #now: () => number;
  #lastSeq: number | undefined;
  #tries = 0;
  #stopped = false;
  #hangUp: (() => void) | undefined;

  constructor(options: FollowRunOptions) {
    this.#options = options;
    this.#lastSeq = options.after;
    this.#wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#now = options.now ?? Date.now;
  }

  stop(): void {
    this.#stopped = true;
    this.#hangUp?.();
    this.#hangUp = undefined;
  }

  async run(): Promise<void> {
    while (!this.#stopped) {
      const outcome = await this.#follow();
      if (this.#stopped) return;
      if (outcome.kind !== "broken") return this.#options.onEnd(outcome);
      const delay = reconnectDelays[this.#tries];
      if (delay === undefined) return this.#options.onEnd({ kind: "failed", error: outcome.error });
      this.#tries += 1;
      await this.#wait(delay);
    }
  }

  /** Opens the stream once and reads it until it ends, one way or the other. */
  #follow(): Promise<StreamOutcome> {
    return new Promise((resolve) => {
      const openedAt = this.#now();
      let settled = false;
      const settle = (outcome: StreamOutcome) => {
        if (settled) return;
        settled = true;
        this.#hangUp?.();
        this.#hangUp = undefined;
        resolve(outcome);
      };
      const onMessage = (message: DeploymentStreamMessage) => {
        if (settled || this.#stopped) return;
        const outcome =
          message.type === "event" ? this.#receive(message) : this.#closed(message, openedAt);
        if (outcome !== undefined) settle(outcome);
      };
      this.#options.calls.openEvents(this.#options.runId, this.#lastSeq, onMessage).then(
        (opening) => {
          if (opening.kind === "refused") return settle(refusedOutcome(opening.answer.status));
          if (settled || this.#stopped) return opening.end();
          this.#hangUp = opening.end;
        },
        (error: unknown) => settle(errorOutcome(error)),
      );
    });
  }

  /**
   * The shell's stream closed, before the server's `end`: broken, worth another try. A stream that
   * had stayed open long enough worked, so the count of tries starts again.
   */
  #closed(message: DeploymentStreamMessage, openedAt: number): StreamOutcome {
    if (this.#now() - openedAt >= healthyStreamMs) this.#tries = 0;
    const why = message.type === "failed" ? message.message : "it closed before the run ended";
    return { kind: "broken", error: new Error(`The run's event stream broke off: ${why}.`) };
  }

  /** Takes one event in: delivers a new `run` event, and answers how the stream ended, if it did. */
  #receive(message: DeploymentStreamMessage & { type: "event" }): StreamOutcome | undefined {
    if (message.event === "end") return { kind: "ended" };
    if (message.event !== "run") return undefined;
    const seq = Number(message.id);
    if (!Number.isSafeInteger(seq) || seq < 1) {
      return {
        kind: "broken",
        error: new Error("The run's event stream sent an event without its number."),
      };
    }
    // Already delivered: a resumed stream may send it again.
    if (this.#lastSeq !== undefined && seq <= this.#lastSeq) return undefined;
    let data: unknown;
    try {
      data = JSON.parse(message.data);
    } catch (error) {
      return { kind: "broken", error };
    }
    this.#lastSeq = seq;
    this.#tries = 0;
    this.#options.onEvent({ seq, data });
    return undefined;
  }
}

/** A server that refused the stream: busy or failing is worth another try, anything else isn't. */
function refusedOutcome(status: number): StreamOutcome {
  if (status === 429 || status >= 500) {
    return {
      kind: "broken",
      error: new Error(`The server answered the run's events with ${status}.`),
    };
  }
  return { kind: "refused", status };
}

function errorOutcome(error: unknown): StreamOutcome {
  const retried = error instanceof DeploymentCallRefused && retriedCodes.has(error.code);
  return retried ? { kind: "broken", error } : { kind: "failed", error };
}
