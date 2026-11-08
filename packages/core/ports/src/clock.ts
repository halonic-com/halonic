/** Version of the {@link Clock} port. A breaking change bumps it and comes with an ADR. */
export const clockVersion = 1;

/** The current time. Passed in, so tests and replays can fix it. */
export interface Clock {
  /** The current time. Each call returns a new `Date`, so callers may change it. */
  now(): Date;
}
