import type { SignalSource, StopSignal } from "../output/stop.ts";

/** A stand-in for `process` that sends a signal when the test says so. */
export function fakeSignals(): SignalSource & { send(signal: StopSignal): void; count(): number } {
  const listeners = new Map<StopSignal, Set<() => void>>();
  const of = (signal: StopSignal) => listeners.get(signal) ?? new Set();
  return {
    on(signal, listener) {
      listeners.set(signal, of(signal).add(listener));
    },
    off(signal, listener) {
      of(signal).delete(listener);
    },
    send(signal) {
      for (const listener of of(signal)) {
        listener();
      }
    },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}
