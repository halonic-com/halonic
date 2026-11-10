import type { CantTryReason } from "@halonicjs/events";

/**
 * An error a Try it or Test adapter throws when a step it serves can't be
 * tried, because it needs a change left out of the run, such as a model
 * alias that is new in `models.yaml` (requirement `ports.cant-try-error`).
 * The engine then ends the step's branch as it does for a failed step, and
 * the run ends with `run.cant-try` instead of `run.failed`. The engine adds
 * the step's id; the adapter knows the item being tried and why.
 *
 * The message must be safe to show and to log. Check for it with
 * {@link isCantTryError}, not `instanceof`: an adapter may be built against
 * its own copy of this package.
 *
 * @example
 * const reason = { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" } as const;
 * throw new CantTryError("workflows/triage.yaml", reason, "Alias smart is new.");
 */
export class CantTryError extends Error {
  override readonly name = "CantTryError";
  /** The path of the item being tried. */
  readonly item: string;
  readonly reason: CantTryReason;

  /**
   * @param item - the path of the item being tried
   * @param reason - which left-out change the step needs
   * @param message - safe to show and to log
   */
  constructor(item: string, reason: CantTryReason, message: string) {
    super(message);
    this.item = item;
    this.reason = reason;
  }
}

/**
 * Whether `value` is a {@link CantTryError}: an `Error` named "CantTryError"
 * with an `item` and a `reason` of a known kind. It works across copies of
 * this package, where `instanceof` doesn't.
 */
export function isCantTryError(value: unknown): value is CantTryError {
  if (!(value instanceof Error) || value.name !== "CantTryError") return false;
  const { item, reason } = value as { item?: unknown; reason?: { kind?: unknown } | null };
  const knownKind =
    reason?.kind === "needs-left-out-change" || reason?.kind === "invalid-without-change";
  return typeof item === "string" && knownKind;
}
