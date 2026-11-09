import { errorKindOf } from "@halonicjs/std";
import { UsageError } from "./command.ts";

/** What a bug says instead of its own text, which may hold paths, codes or secrets. */
const internalLines = [
  "✕ Halonic ran into a problem it can't explain yet.",
  "  Report it: https://github.com/halonic-com/halonic/issues",
];

/** What {@link printError} knows besides the error itself. */
export interface PrintErrorContext {
  /** The command's usage line, shown as the fix of a {@link UsageError}. */
  readonly usage?: string;
}

/**
 * Writes an error in the one shape the CLI uses for errors: a line with ✕
 * and the error's message, then its fix on its own indented line. This is
 * the only code that writes that shape; commands throw or return errors and
 * never print them.
 *
 * The fix comes from the error's own `fix` (or the usage line for a wrong
 * command line). An error without one gets no fix line: nothing here makes
 * one up. An error without a kind is a bug, so its text is never shown.
 *
 * @param error - anything a command threw
 * @param print - writes one line, to stderr
 */
export function printError(
  error: unknown,
  print: (line: string) => void,
  context: PrintErrorContext = {},
): void {
  if (errorKindOf(error) === "internal") {
    for (const line of internalLines) {
      print(line);
    }
    return;
  }
  print(`✕ ${messageOf(error)}`);
  const fix = error instanceof UsageError ? context.usage : fixOf(error);
  if (fix !== undefined) {
    print(`  ${fix}`);
  }
}

/** The message of an error with a kind; `errorKindOf` only gives a kind to values that have one. */
function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

/** The error's own fix, when it has one that isn't empty. */
function fixOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("fix" in error)) {
    return undefined;
  }
  const fix = error.fix;
  return typeof fix === "string" && fix.trim() !== "" ? fix : undefined;
}
