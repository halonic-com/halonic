// What the runner tells Halonic about why a call failed, besides the message:
// the error's kind and the `failureCause` an integration put on it. Halonic
// takes the frame's shape strictly and stops the runner on a frame outside it,
// so a note that is too big is trimmed here rather than sent.

import { errorKindOf } from "@halonicjs/std";
import { maxFailureDetailEntries } from "../frames.ts";

const maxCodeLength = 64;
const maxDetailKeyLength = 40;
const maxDetailValueLength = 300;

/** The fields of a `result` frame that say why the call failed. */
export interface FailureNote {
  kind?: string;
  failureCause?: { code?: string; detail?: Record<string, string> };
}

/**
 * The note for a failed call, from the error the integration threw. It holds
 * the error's kind unless it is `internal` (an error without a kind), and the
 * `failureCause` the error carries with only the parts that fit the frame: a
 * `code` of at most 64 characters, and up to 8 `detail` entries whose key has
 * at most 40 characters and whose value is a string of at most 300. What
 * doesn't fit is left out. Halonic checks all of it again.
 */
export function failureNoteOf(error: unknown): FailureNote {
  const kind = errorKindOf(error);
  const note: FailureNote = kind === "internal" ? {} : { kind };
  const cause = failureCauseOf(error);
  if (cause !== undefined) note.failureCause = cause;
  return note;
}

function failureCauseOf(error: unknown): FailureNote["failureCause"] {
  if (typeof error !== "object" || error === null || !("failureCause" in error)) return undefined;
  const named = error.failureCause;
  if (typeof named !== "object" || named === null) return undefined;
  const cause: NonNullable<FailureNote["failureCause"]> = {};
  if ("code" in named && typeof named.code === "string" && fits(named.code, maxCodeLength)) {
    cause.code = named.code;
  }
  const detail = detailOf("detail" in named ? named.detail : undefined);
  if (detail !== undefined) cause.detail = detail;
  return cause.code === undefined && cause.detail === undefined ? undefined : cause;
}

function detailOf(detail: unknown): Record<string, string> | undefined {
  if (typeof detail !== "object" || detail === null) return undefined;
  const kept = Object.entries(detail)
    .filter(
      (entry): entry is [string, string] =>
        fits(entry[0], maxDetailKeyLength) &&
        typeof entry[1] === "string" &&
        entry[1].length <= maxDetailValueLength,
    )
    .slice(0, maxFailureDetailEntries);
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

function fits(text: string, max: number): boolean {
  return text.length >= 1 && text.length <= max;
}
