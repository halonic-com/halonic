/**
 * When the health check takes an alias out (architecture note section 10, Q3):
 * after `failuresInARow` failed calls in a row, or when more than `errorShare`
 * of the calls in the last `windowMs` failed, the alias stays out for `outForMs`.
 */
export interface HealthLimits {
  readonly failuresInARow: number;
  readonly windowMs: number;
  readonly errorShare: number;
  /** The fewest calls in the window before the share counts, so one failed call out of one doesn't take an alias out. */
  readonly minCallsForShare: number;
  readonly outForMs: number;
}

const minuteMs = 60_000;

/** The limits decided in Q3: 5 failures in a row, or over 50% errors in 10 minutes, takes an alias out for 15 minutes. */
export const defaultHealthLimits: HealthLimits = {
  failuresInARow: 5,
  windowMs: 10 * minuteMs,
  errorShare: 0.5,
  minCallsForShare: 10,
  outForMs: 15 * minuteMs,
};

/**
 * How one model call on an alias ended. Only the provider's own failures count:
 * a refused key, an empty account or a budget cap is not a health problem and
 * gets no fallback (HAL-3178), so the caller reports those as neither.
 */
export type CallResult = "ok" | "provider-error";

interface CallRecord {
  readonly at: number;
  readonly failed: boolean;
}

interface AliasHealth {
  calls: CallRecord[];
  failuresInARow: number;
  outUntil: number | undefined;
}

/**
 * The health of every alias, from the results of its recent model calls.
 * The caller owns the instance and passes the time with every call, so it
 * needs no timer and works the same in a test.
 *
 * @example
 * const health = new ProviderHealth();
 * health.record("deepseek-flash", "provider-error", Date.now());
 * health.isHealthy("deepseek-flash", Date.now()); // true until the limits are reached
 */
export class ProviderHealth {
  readonly #limits: HealthLimits;
  readonly #aliases = new Map<string, AliasHealth>();

  constructor(limits: HealthLimits = defaultHealthLimits) {
    this.#limits = limits;
  }

  /** Records how one call on `alias` ended at `at` (milliseconds), and takes the alias out when it reaches a limit. */
  record(alias: string, result: CallResult, at: number): void {
    const health = this.#healthOf(alias);
    if (isOut(health, at)) {
      // Calls that were already on their way while it was out don't extend the 15 minutes.
      return;
    }
    const failed = result === "provider-error";
    health.calls = [...withinWindow(health.calls, at, this.#limits.windowMs), { at, failed }];
    health.failuresInARow = failed ? health.failuresInARow + 1 : 0;
    if (this.#reachedLimit(health)) {
      // A fresh start when it comes back, so the failures that took it out don't take it out again.
      health.outUntil = at + this.#limits.outForMs;
      health.calls = [];
      health.failuresInARow = 0;
    }
  }

  /** Whether `alias` may be routed to at `at`. An alias with no calls yet is healthy. */
  isHealthy(alias: string, at: number): boolean {
    const health = this.#aliases.get(alias);
    return health === undefined || !isOut(health, at);
  }

  /** The aliases out at `at`, sorted by name. */
  unhealthyAliases(at: number): string[] {
    return [...this.#aliases.keys()].filter((alias) => !this.isHealthy(alias, at)).sort();
  }

  #healthOf(alias: string): AliasHealth {
    const existing = this.#aliases.get(alias);
    if (existing !== undefined) {
      return existing;
    }
    const created: AliasHealth = { calls: [], failuresInARow: 0, outUntil: undefined };
    this.#aliases.set(alias, created);
    return created;
  }

  #reachedLimit(health: AliasHealth): boolean {
    if (health.failuresInARow >= this.#limits.failuresInARow) {
      return true;
    }
    if (health.calls.length < this.#limits.minCallsForShare) {
      return false;
    }
    const failures = health.calls.filter((call) => call.failed).length;
    return failures / health.calls.length > this.#limits.errorShare;
  }
}

function isOut(health: AliasHealth, at: number): boolean {
  return health.outUntil !== undefined && at < health.outUntil;
}

function withinWindow(calls: readonly CallRecord[], at: number, windowMs: number): CallRecord[] {
  return calls.filter((call) => call.at > at - windowMs);
}
