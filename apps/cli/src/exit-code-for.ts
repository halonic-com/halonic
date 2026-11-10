import { assertNever, type ErrorKind, errorKindOf } from "@halonicjs/std";
import { type ExitCode, exitCode } from "./exit-code.ts";
import { NotTrustedError } from "./not-trusted.ts";

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

/**
 * The exit code a thrown error ends the command with: 3 for a
 * {@link NotTrustedError}, which is the CLI's own and has no `std` kind,
 * else {@link exitCodeFor} its kind.
 */
export function exitCodeOfError(error: unknown): ExitCode {
  if (error instanceof NotTrustedError) {
    return exitCode.notTrusted;
  }
  return exitCodeFor(errorKindOf(error));
}
