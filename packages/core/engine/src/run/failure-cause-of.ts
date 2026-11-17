import type { RunFailureCause } from "@halonicjs/events";
import { errorKindOf, findSecretShape } from "@halonicjs/std";

/** The most entries of `detail` the run log keeps. */
const maxDetailEntries = 8;

/** The longest `detail` value the run log keeps. A cut value is dropped, not shortened. */
const maxDetailValue = 300;

/** A stable cause code is lower-case words joined by dots or dashes, such as `google.api-disabled`. */
const codeShape = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** A `detail` key is one camel-case word, such as `enableUrl`. */
const detailKeyShape = /^[a-z][A-Za-z0-9]{0,39}$/;

/**
 * The typed cause of a failed run, from the error that stopped it
 * (requirement `engine.run-failure-cause-of`), for a screen that must not
 * read the free-text `error`.
 *
 * - `kind` is the error's kind. An error without a kind, or an `internal`
 *   one, gives no cause: there is nothing a screen could tell apart.
 * - `code` and `detail` come from the error's `failureCause` property when it
 *   has one, which is how an integration names its own cause without the
 *   engine knowing the integration. Nothing else is read from the error.
 *
 * The engine doesn't trust what an integration put there. It keeps a `code`
 * only if it has the shape of one, and a `detail` entry only if its key has
 * the shape of one, its value is a string of at most 300 characters and the
 * value holds nothing shaped like a key (`findSecretShape`), and at most 8
 * entries. Like `errorKindOf`, it reads only the error itself, never its `cause`.
 *
 * @example
 * failureCauseOf(Object.assign(new Error("API off"), {
 *   kind: "denied",
 *   failureCause: { code: "google.api-disabled", detail: { api: "drive.googleapis.com" } },
 * }));
 * // { kind: "denied", code: "google.api-disabled", detail: { api: "drive.googleapis.com" } }
 */
export function failureCauseOf(error: unknown): RunFailureCause | undefined {
  const kind = errorKindOf(error);
  if (kind === "internal") return undefined;
  const named = namedCauseOf(error);
  const code =
    typeof named.code === "string" && codeShape.test(named.code) ? named.code : undefined;
  const detail = checkedDetail(named.detail);
  return {
    kind,
    ...(code === undefined ? {} : { code }),
    ...(detail === undefined ? {} : { detail }),
  };
}

/** The `failureCause` an error carries, or an empty one. Its fields are not yet checked. */
function namedCauseOf(error: unknown): { code?: unknown; detail?: unknown } {
  if (typeof error !== "object" || error === null || !("failureCause" in error)) return {};
  const named = error.failureCause;
  return typeof named === "object" && named !== null ? named : {};
}

/** The entries of `detail` that are safe to log, or `undefined` when none is. */
function checkedDetail(detail: unknown): Record<string, string> | undefined {
  if (typeof detail !== "object" || detail === null) return undefined;
  const kept = Object.entries(detail)
    .filter((entry): entry is [string, string] => isLoggable(entry[0], entry[1]))
    .slice(0, maxDetailEntries);
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

function isLoggable(key: string, value: unknown): value is string {
  return (
    detailKeyShape.test(key) &&
    typeof value === "string" &&
    value.length <= maxDetailValue &&
    findSecretShape(value) === undefined
  );
}
