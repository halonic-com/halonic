/**
 * The time the remote host's rules run on: the current time, and a wait. It
 * is passed in, so tests drive it with `FakeTunnelTime` and never sleep.
 */
export interface RemoteTime {
  /** The current time. */
  now(): Date;
  /** Resolves `ms` milliseconds from now; at once for 0 or less. */
  wait(ms: number): Promise<void>;
}

/**
 * The real time. A wait's timer doesn't keep the host running: the host
 * stops when Studio closes its standard input, whatever pairing is open.
 */
export const systemTime: RemoteTime = {
  now: () => new Date(),
  wait: (ms) =>
    new Promise((resolve) => {
      if (ms <= 0) {
        resolve();
        return;
      }
      setTimeout(resolve, ms).unref();
    }),
};
