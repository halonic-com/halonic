import { type ErrorKind, KindedError } from "@halonicjs/std";

/** Copy details and its toasts (microcopy 22 F13 and F13b, and 19.8 for a copy that fails). */
export const copyDetailsWords = {
  label: "Copy details",
  copied: "Copied. Paste it into a bug report.",
  couldNotCopy: "Couldn't copy.",
} as const;

/**
 * The text Copy details puts on the clipboard for a failure: what stopped, then the error's own
 * name, message and stack. This is the one place an `internal` error's message goes (microcopy
 * 22 F13); it never shows on screen.
 *
 * @example
 * detailsOf("This page stopped working: Support reply", new TypeError("steps is undefined"));
 * // "This page stopped working: Support reply\nTypeError: steps is undefined\n    at …"
 */
export function detailsOf(what: string, error: unknown): string {
  const raw = rawDetailsOf(error);
  return [what, describe(error), ...(raw === undefined ? [] : [raw])].join("\n");
}

/**
 * A kinded error whose message is Halonic's own words for raw text it replaces, such as "Halonic
 * can't write to its data folder." for "Permission denied (os error 13)". The raw text goes only
 * to Copy details, which a screen then offers next to the reason (microcopy 22 F1).
 *
 * @example
 * throw new ErrorWithDetails("unavailable", "Halonic can't write to its data folder.", osMessage);
 */
export class ErrorWithDetails extends KindedError {
  /** The raw text the message replaces, for the clipboard only. */
  readonly details: string;
  constructor(
    kind: ErrorKind,
    message: string,
    details: string,
    options: ConstructorParameters<typeof KindedError>[2] = {},
  ) {
    super(kind, message, options);
    this.details = details;
  }
}

/** The raw text an error keeps for Copy details ({@link ErrorWithDetails}); `undefined` when it has none. */
export function rawDetailsOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("details" in error)) return undefined;
  return typeof error.details === "string" && error.details !== "" ? error.details : undefined;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    // A stack usually starts with the name and message already; when it doesn't, add them.
    const headline = `${error.name}: ${error.message}`;
    const stack = error.stack ?? "";
    return stack.startsWith(headline) ? stack : [headline, stack].filter(Boolean).join("\n");
  }
  return `Thrown: ${String(error)}`;
}
