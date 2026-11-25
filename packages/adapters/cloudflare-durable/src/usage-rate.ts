import type { UsageRefusal, UsageStorage } from "./usage-types.ts";

/** How many calls a scope, and one actor in an organisation, may make in each window. */
export interface UsageRateLimits {
  readonly windowMs: number;
  /** Calls per window for the whole scope. */
  readonly perScope: number;
  /** Calls per window for one actor in an `o/` scope; a personal scope has only its own limit. */
  readonly perActor: number;
}

/**
 * One minute, at most 600 calls a scope and 120 an organisation member. A run calls once per step
 * and model call, so a busy scope stays well inside it, while a loop's runs and model calls are
 * stopped within a minute. This caps the usage object's load and limit pulls; it doesn't guard the
 * deployment's daily request ceiling, which `host/server` counts before the route runs (HAL-18039).
 */
export const defaultUsageRateLimits: UsageRateLimits = {
  windowMs: 60_000,
  perScope: 600,
  perActor: 120,
};

/** The calls counted in the window that started at `windowStart`. */
interface RateWindow {
  windowStart: number;
  scope: number;
  actors: Record<string, number>;
}

const rateKey = "rate";

/**
 * Counts one call of `actor` in `scope`, or refuses it with `usage.rate` when the actor's or the
 * scope's count for the window is used up. A refused call isn't counted, so one member's loop
 * uses up only that member's count, never the rest of the organisation's.
 */
export function takeRateSlot(
  storage: UsageStorage,
  principal: { readonly actor: string; readonly scope: string },
  nowMs: number,
  limits: UsageRateLimits = defaultUsageRateLimits,
): UsageRefusal | null {
  return storage.transactionSync(() => {
    const windowStart = nowMs - (nowMs % limits.windowMs);
    const stored = storage.get<RateWindow>(rateKey);
    // A new window starts empty, so the actors of the last one aren't kept.
    const window =
      stored?.windowStart === windowStart ? stored : { windowStart, scope: 0, actors: {} };
    const resetsAt = windowStart + limits.windowMs;
    const actorCalls = window.actors[principal.actor] ?? 0;
    if (principal.scope.startsWith("o/") && actorCalls >= limits.perActor) {
      return { code: "usage.member.rate", limit: limits.perActor, resetsAt };
    }
    if (window.scope >= limits.perScope) {
      return { code: "usage.rate", limit: limits.perScope, resetsAt };
    }
    window.scope += 1;
    window.actors[principal.actor] = actorCalls + 1;
    storage.put(rateKey, window);
    return null;
  });
}
