/** Cancels a wake-up that hasn't fired yet. Cancelling one that fired does nothing. */
export type CancelTimer = () => void;

/**
 * Calls `callback` once, about `delayMs` milliseconds from now. Passed in, so
 * tests run on fake time; the real one is `systemSetTimer`.
 */
export type SetTimer = (callback: () => void, delayMs: number) => CancelTimer;
