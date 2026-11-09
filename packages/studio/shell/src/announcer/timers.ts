/**
 * The timers the announcer uses. The shell stays headless, so the frame, or a
 * test, passes them in.
 */
export interface AnnouncerTimers {
  /** The current time in milliseconds. */
  now(): number;
  /** Runs `callback` after `ms` milliseconds and returns a handle. */
  setTimeout(callback: () => void, ms: number): unknown;
  /** Cancels a timer by its handle; an unknown or `undefined` handle is ignored. */
  clearTimeout(handle: unknown): void;
}

/** The system's timers. */
export const systemTimers: AnnouncerTimers = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout> | undefined);
  },
};
