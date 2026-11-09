import type { ServerResponse } from "node:http";
import { assertNever, type ErrorKind, errorKindOf, KindedError } from "@halonicjs/std";

/** What the program reads when the bridge fails for a reason it doesn't name. */
const internalMessage = "Something went wrong in the Halonic bridge. The run log has the details.";

/** The HTTP status the bridge answers for each error kind. */
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
 * Answers a request with one of the bridge's own errors: the one place the
 * bridge turns an error into HTTP (failure-path rule 4). Only a
 * {@link KindedError} the bridge threw keeps its message, because those are
 * written to be safe to show. Any other error gets a generic message, since
 * its text could hold a key or the run token.
 *
 * The body has the shape both Anthropic and OpenAI use for errors
 * (`error.type` and `error.message`), so Claude Code and Codex show the
 * message instead of failing to read the reply.
 */
export function sendBridgeError(response: ServerResponse, error: unknown): void {
  const kind = errorKindOf(error);
  const message =
    error instanceof KindedError && kind !== "internal" ? error.message : internalMessage;
  const body = JSON.stringify({ type: "error", error: { type: kind, message } });
  response.writeHead(statusOf(kind), { "content-type": "application/json" });
  response.end(body);
}
