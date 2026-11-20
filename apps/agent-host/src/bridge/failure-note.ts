// What the host tells Studio about why a bridge failed to open, besides the
// message: the error's kind and the `failureCause` it carries, such as
// `harness-bridge.socket-path-too-long`. Studio puts them back on the error it
// throws, so the engine records the run's typed cause (`failureCauseOf`) as it
// does for a bridge opened in its own process (HAL-13891). Studio takes the
// line's shape strictly, so what doesn't fit is left out here rather than sent.
//
// The integration runner trims its `result` frames the same way
// (`failure-note.ts` there); the two may share one helper once a task names
// both packages.

import { errorKindOf } from "@halonicjs/std";

/** The longest `code` sent. */
const maxCodeLength = 64;

/** The most `detail` entries sent. */
const maxDetailEntries = 8;

/** The longest `detail` key sent. */
const maxDetailKeyLength = 40;

/** The longest `detail` value sent. A longer one is left out, not shortened. */
const maxDetailValueLength = 300;

/** The fields of a `failed` line that say why the bridge failed to open. */
export interface FailureNote {
  kind?: string;
  failureCause?: { code?: string; detail?: Record<string, string> };
}

/**
 * The note for a bridge that failed to open, from the error it threw. It
 * holds the error's kind unless it is `internal` (an error without a kind),
 * and the error's `failureCause` with only the parts that fit the line: a
 * `code` of at most 64 characters, and up to 8 `detail` entries whose key has
 * at most 40 characters and whose value is a string of at most 300.
 *
 * Nothing else is read from the error. An error's `failureCause` names no
 * path or key by its own rule; the engine checks every value once more before
 * it reaches the run record.
 *
 * @example
 * failureNoteOf(Object.assign(new KindedError("invalid_input", "Too long."), {
 *   failureCause: { code: "harness-bridge.socket-path-too-long", detail: { bytes: "120" } },
 * }));
 * // { kind: "invalid_input", failureCause: { code: "harness-bridge.socket-path-too-long", detail: { bytes: "120" } } }
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
    .slice(0, maxDetailEntries);
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

function fits(text: string, max: number): boolean {
  return text.length >= 1 && text.length <= max;
}
