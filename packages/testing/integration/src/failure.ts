/** A conformance check failed. The message says what to fix. */
export class ConformanceFailure extends Error {
  override readonly name = "ConformanceFailure";
}

/** Fails the current check with a message that says what to fix. */
export function fail(message: string): never {
  throw new ConformanceFailure(message);
}
