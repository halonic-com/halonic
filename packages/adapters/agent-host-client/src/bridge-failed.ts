import { type Infer, s } from "@halonicjs/schema-kit";
import { type ErrorKind, isErrorKind } from "@halonicjs/std";
import { AgentHostError } from "./transport.ts";

/** The most `detail` entries a `failed` line's cause carries. */
const maxDetailEntries = 8;

/**
 * The host's `failed` line: why the bridge couldn't open, and, when the
 * error it got has them, the error's kind and its `failureCause` (HAL-13891).
 * The caps are the ones the engine keeps, so a longer value would only be
 * dropped there; a line outside them is not of the expected shape.
 */
export const failedLineSchema = s
  .object({
    type: s.literal("failed"),
    message: s.string(),
    kind: s.string().min(1).max(32).optional(),
    failureCause: s
      .object({
        code: s.string().min(1).max(64).optional(),
        detail: s
          .record(s.string().min(1).max(40), s.string().max(300))
          .refine((detail) => Object.keys(detail).length <= maxDetailEntries, {
            message: "too many detail entries",
          })
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** A `failed` line, checked. */
export type FailedLine = Infer<typeof failedLineSchema>;

/**
 * A bridge the host couldn't open. Its kind is the kind of the error the host
 * got when that is one of the error kinds, so the engine records the run's
 * typed cause (`failureCauseOf`) with the `failureCause` the host sent, as it
 * does for a bridge opened in Studio's own process. Otherwise it is
 * `bridge_failed`, and the engine records no cause.
 */
export class BridgeFailedError extends AgentHostError {
  declare readonly failureCause?: NonNullable<FailedLine["failureCause"]>;

  constructor(line: FailedLine) {
    super(200, bridgeFailedKindOf(line.kind), line.message);
    if (line.failureCause !== undefined) this.failureCause = line.failureCause;
  }
}

function bridgeFailedKindOf(kind: string | undefined): ErrorKind | "bridge_failed" {
  return isErrorKind(kind) ? kind : "bridge_failed";
}
