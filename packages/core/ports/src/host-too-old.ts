/**
 * What a remote {@link RunExecutor.send} throws, sending nothing, when the answer names a wait
 * step and the host is too old to check it (requirement `ports.host-too-old`). A caller that
 * answers a person, such as an Inbox card, can then ask to update the host instead of offering
 * a **Try again** that can't work.
 *
 * It is a `RangeError`, as the refusal threw before, so a caller that caught that still does.
 * Check for it with {@link isHostTooOld}, not `instanceof`: an executor may be built against its
 * own copy of this package.
 *
 * @example
 * throw new HostTooOld("This host is too old to check which wait step an answer is for.");
 */
export class HostTooOld extends RangeError {
  override readonly name = "HostTooOld";

  /** @param message - safe to log; Studio shows its own words for it */
  constructor(message: string) {
    super(message);
  }
}

/**
 * Whether `value` is a {@link HostTooOld}: an `Error` named "HostTooOld". It works across copies
 * of this package, where `instanceof` doesn't.
 */
export function isHostTooOld(value: unknown): value is HostTooOld {
  return value instanceof Error && value.name === "HostTooOld";
}
