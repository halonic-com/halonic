/**
 * Event-driven merge control passes (HAL-18729): an approval or a green
 * `ci-ok` that reaches the chief line's `pr-event` route starts a pass, so a
 * ready pull request doesn't wait for the next scheduled one. The scheduled
 * job stays as the fallback. A burst of events within `debounceMs` of the
 * first one starts one pass; the pass itself runs through the job's own
 * company-scoped event (`scheduled.ts`), which never runs two at once.
 */

/** Starts one merge control pass for a company, as the scheduled job does. */
export type StartPass = (companyId: string) => Promise<void>;

/** What the `pr-event` route calls for an event that should start a pass. */
export type PassNudge = (companyId: string) => void;

/** Timers, so tests can fake them. */
export interface TriggerTimers {
  readonly setTimeout: (run: () => void, ms: number) => unknown;
}

/** How long after the first event of a burst its one pass starts. */
export const debounceMs = 1000;

/**
 * A nudge that starts one pass per company `wait` ms after the first event;
 * the events until then join it. A failed start is only logged: the
 * scheduled pass still comes.
 */
export function passTrigger(
  start: StartPass,
  onError: (companyId: string, error: Error) => void,
  timers: TriggerTimers = globalThis,
  wait: number = debounceMs,
): PassNudge {
  const pending = new Set<string>();
  return (companyId) => {
    if (pending.has(companyId)) {
      return;
    }
    pending.add(companyId);
    timers.setTimeout(() => {
      pending.delete(companyId);
      start(companyId).catch((error: unknown) => onError(companyId, error as Error));
    }, wait);
  };
}
