import { assertNever, type ErrorKind, errorKindOf, KindedError } from "@halonicjs/std";
import type { ServerErrorBody } from "./api.ts";

/** What a caller reads when the server fails for a reason it doesn't name. */
const internalMessage = "The server couldn't answer this request.";

/** The HTTP status the server answers for each error kind. */
function statusOf(kind: ErrorKind): number {
  switch (kind) {
    case "invalid_input":
      return 400;
    case "unauthenticated":
      return 401;
    case "denied":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "limit_reached":
      return 429;
    case "unavailable":
      return 503;
    case "internal":
      return 500;
    default:
      return assertNever(kind, "error kind");
  }
}

/**
 * Turns a thrown error into an HTTP reply: the one place this package reads
 * an error's kind (failure-path rule 4). The body is a {@link ServerErrorBody}:
 * its `code` is the error kind, so a caller can decode it with `isErrorKind`, and
 * `fix` is there when the error has one.
 *
 * Only a {@link KindedError} keeps its message, because those are written to be
 * safe to show, and never an `internal` one. Any other thrown value gets a
 * generic message and status 500, since its text could hold a path, a key or a
 * provider's reply. The caller records the error itself in the log.
 */
export function kindedErrorResponse(error: unknown): Response {
  const kind = errorKindOf(error);
  if (kind === "internal" || !(error instanceof KindedError)) {
    const body: ServerErrorBody = { code: "internal", message: internalMessage };
    return Response.json(body, { status: 500 });
  }
  const body: ServerErrorBody =
    error.fix === undefined
      ? { code: kind, message: error.message }
      : { code: kind, message: error.message, fix: error.fix };
  return Response.json(body, { status: statusOf(kind) });
}
