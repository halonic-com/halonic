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
  return [what, describe(error)].join("\n");
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
