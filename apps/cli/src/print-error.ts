import { errorKindOf } from "@halonicjs/std";
import { UsageError } from "./command.ts";

/**
 * What a bug says instead of its own text, which may hold paths, codes or
 * secrets: the approved F16 sentence and step (cli-output 1.3, rule 5).
 */
const internalLines = [
  "✕ Halonic ran into a problem it can't explain yet.",
  "  Run it again with --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues",
];

/** How deep `--debug` follows `cause`, so a cause that points back at itself still ends. */
const maxCauses = 10;

/** What {@link printError} knows besides the error itself. */
export interface PrintErrorContext {
  /** The command's usage line, shown as the fix of a {@link UsageError}. */
  readonly usage?: string;
  /** `--debug` was given: print the error's own text, causes and stack after its lines. */
  readonly debug?: boolean;
}

/**
 * Writes an error in the one shape the CLI uses for errors: a line with ✕
 * and the error's message, then its fix on its own indented line. This is
 * the only code that writes that shape; commands throw or return errors and
 * never print them.
 *
 * The fix comes from the error's own `fix` (or the usage line for a wrong
 * command line). An error without one gets no fix line: nothing here makes
 * one up. An error without a kind is a bug, so its text is never shown,
 * unless `--debug` asks for it.
 *
 * With `--debug`, every error, of any kind, is followed by its own message,
 * its `cause` chain and its stack, for a bug report.
 *
 * @param error - anything a command threw
 * @param print - writes one line, to stderr
 */
export function printError(
  error: unknown,
  print: (line: string) => void,
  context: PrintErrorContext = {},
): void {
  for (const line of errorLines(error, context)) {
    print(line);
  }
  if (context.debug === true) {
    for (const line of debugLines(error)) {
      print(line);
    }
  }
}

/** The ✕ line and, when there is one, the fix line. */
function errorLines(error: unknown, context: PrintErrorContext): readonly string[] {
  if (errorKindOf(error) === "internal") {
    return internalLines;
  }
  const fix = error instanceof UsageError ? context.usage : fixOf(error);
  return fix === undefined ? [`✕ ${messageOf(error)}`] : [`✕ ${messageOf(error)}`, `  ${fix}`];
}

/**
 * The error's own text for `--debug`: its stack (or its message when it has
 * none), then each error in its `cause` chain, starting with "Caused by:".
 */
function debugLines(error: unknown): string[] {
  return causeChain(error).flatMap((value, index) => {
    const [first = "", ...rest] = ownText(value).split(/\r?\n/);
    return [index === 0 ? first : `Caused by: ${first}`, ...rest];
  });
}

/** The error, then the error it wraps, and so on: at most {@link maxCauses} causes, each once. */
function causeChain(error: unknown): unknown[] {
  const chain = [error];
  let cause = causeOf(error);
  while (cause !== undefined && !chain.includes(cause) && chain.length <= maxCauses) {
    chain.push(cause);
    cause = causeOf(cause);
  }
  return chain;
}

/** A thrown value's stack, which starts with its name and message, or else its message. */
function ownText(value: unknown): string {
  if (typeof value === "object" && value !== null && "stack" in value) {
    const stack = value.stack;
    if (typeof stack === "string" && stack !== "") {
      return stack;
    }
  }
  return messageOf(value);
}

/** The error a thrown value wraps, if any. */
function causeOf(value: unknown): unknown {
  return typeof value === "object" && value !== null && "cause" in value ? value.cause : undefined;
}

/** A thrown value's message, or the value itself as text when it has none. */
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
