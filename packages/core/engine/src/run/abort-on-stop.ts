// A model provider takes an `AbortSignal`, and the engine's live calls give
// a `StopSignal`. Core code sees the Web types but not their values, so it
// can't make an `AbortSignal`: the host joins the two, with this function.

import type { StopSignal } from "@halonicjs/std";

/**
 * Runs `work` with an `AbortSignal` that aborts, with the stop's reason,
 * when `stop` is told to stop, and stops listening to `stop` once `work`
 * has settled, so a long run doesn't collect one listener per call
 * (requirement `engine.model-call-stop`).
 *
 * @throws what `work` throws
 *
 * @example
 * // In a host, where AbortController exists:
 * const abortOnStop: AbortOnStop = async (stop, work) => {
 *   const controller = new AbortController();
 *   const remove = stop.onStop(() => controller.abort(stop.reason));
 *   try {
 *     return await work(controller.signal);
 *   } finally {
 *     remove();
 *   }
 * };
 */
export type AbortOnStop = <T>(
  stop: StopSignal,
  work: (signal: AbortSignal) => Promise<T>,
) => Promise<T>;
