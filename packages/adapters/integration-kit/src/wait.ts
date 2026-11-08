import { maxIntegrationWaitMs } from "@halonicjs/ports";

/**
 * The milliseconds the host really waits for `ms`: `NaN` and negative values
 * wait 0, anything above {@link maxIntegrationWaitMs} (`Infinity` too) waits
 * the maximum.
 */
export function clampWaitMs(ms: number): number {
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.min(ms, maxIntegrationWaitMs);
}

/**
 * `IntegrationHost.wait`: waits the clamped `ms`, and rejects with
 * `signal.reason` as soon as `signal` aborts, or straight away when it
 * already has. The timer and the abort listener are always cleared, so a
 * wait never outlives its call.
 *
 * @example
 * await integrationWait(retryMs, signal);
 */
export function integrationWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, clampWaitMs(ms));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
