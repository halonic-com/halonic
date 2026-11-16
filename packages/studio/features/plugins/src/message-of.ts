import { errorReasonFor } from "@halonicjs/studio-shell";

/** A thrown value's reason, for the person: an `internal` error gives the generic sentence. */
export function messageOf(error: unknown): string {
  return errorReasonFor(error);
}
