/** What a run was asked to start does not exist: a hub, a workflow in a hub, or an agent in a hub. */
export type RunTargetKind = "hub" | "workflow" | "agent";

/**
 * What {@link RunExecutor.start} and `startAgent` throw when the hub, the
 * workflow or the agent the request names doesn't exist (requirement
 * `ports.run-target-not-found`). A caller that answers a person, such as the
 * host's run routes, can then tell a wrong name from a real failure.
 *
 * It is a `RangeError`, as the lookups threw before. Check for it with
 * {@link isRunTargetNotFound}, not `instanceof`: an executor may be built
 * against its own copy of this package.
 *
 * @example
 * throw new RunTargetNotFound("workflow", "tidy", 'The hub "billing" has no workflow "tidy".');
 */
export class RunTargetNotFound extends RangeError {
  override readonly name = "RunTargetNotFound";
  /** Which kind of thing is missing. */
  readonly kind: RunTargetKind;
  /** The id the request named. */
  readonly id: string;

  /**
   * @param kind - which kind of thing is missing
   * @param id - the id the request named
   * @param message - safe to log; the host doesn't send it to a client
   */
  constructor(kind: RunTargetKind, id: string, message: string) {
    super(message);
    this.kind = kind;
    this.id = id;
  }
}

/**
 * Whether `value` is a {@link RunTargetNotFound}: an `Error` named
 * "RunTargetNotFound" with a known `kind` and an `id`. It works across
 * copies of this package, where `instanceof` doesn't.
 */
export function isRunTargetNotFound(value: unknown): value is RunTargetNotFound {
  if (!(value instanceof Error) || value.name !== "RunTargetNotFound") return false;
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  return (kind === "hub" || kind === "workflow" || kind === "agent") && typeof id === "string";
}
