import { assertNever, type ErrorKind } from "@halonicjs/std";
import { type ExitCode, exitCode } from "./exit-code.ts";

/**
 * The exit code for an error of `kind`: the CLI's one mapping from error
 * kinds to exit codes. A new kind fails the typecheck here until it has a code.
 *
 * @example
 * exitCodeFor(errorKindOf(error)); // 4 for a `not_found` error
 */
export function exitCodeFor(kind: ErrorKind): ExitCode {
  switch (kind) {
    case "internal":
      return exitCode.failed;
    case "invalid_input":
      return exitCode.usage;
    case "not_found":
      return exitCode.notFound;
    case "conflict":
      return exitCode.conflict;
    case "unauthenticated":
      return exitCode.unauthenticated;
    case "denied":
      return exitCode.denied;
    case "limit_reached":
      return exitCode.limitReached;
    case "unavailable":
      return exitCode.unavailable;
    default:
      return assertNever(kind, "error kind");
  }
}
