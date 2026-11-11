import type { AbortOnStop } from "@halonicjs/engine";

/**
 * The engine's {@link AbortOnStop} on this computer: one `AbortController`
 * per model call, aborted with the stop's reason, and the listener removed
 * once the call has settled.
 *
 * @example
 * new LocalExecutor({ ...options, abortOnStop });
 */
export const abortOnStop: AbortOnStop = async (stop, work) => {
  const controller = new AbortController();
  const removeListener = stop.onStop(() => controller.abort(stop.reason));
  try {
    return await work(controller.signal);
  } finally {
    removeListener();
  }
};
