import type { ServerErrorBody } from "./api.ts";

/** The error codes this package sends, each with its status. A client switches on the code. */
export const serverErrors = {
  hostNotAllowed: {
    status: 421,
    code: "host_not_allowed",
    message: "This server doesn't answer to that host name.",
  },
  originNotAllowed: {
    status: 403,
    code: "origin_not_allowed",
    message: "Requests from other origins are refused.",
  },
  bodyTooLarge: { status: 413, code: "body_too_large", message: "The request body is too large." },
  badRequest: {
    status: 400,
    code: "bad_request",
    message: "The request isn't what this address expects.",
  },
  notSignedIn: { status: 401, code: "not_signed_in", message: "Sign in first." },
  wrongPassword: { status: 401, code: "wrong_password", message: "The password is wrong." },
  tooManyAttempts: {
    status: 429,
    code: "too_many_attempts",
    message: "Too many sign-in attempts. Try again later.",
  },
  dailyLimitReached: {
    status: 429,
    code: "daily_limit_reached",
    message: "This server has reached its daily request limit. Try again after midnight UTC.",
  },
  workspaceNotTrusted: {
    status: 403,
    code: "workspace_not_trusted",
    message: "This workspace isn't trusted. Trust it on the computer that runs Halonic first.",
  },
  runTargetNotFound: {
    status: 404,
    code: "run_target_not_found",
    message: "There is no such hub, workflow or agent to run.",
  },
  unsupportedMediaType: {
    status: 415,
    code: "unsupported_media_type",
    message: "This address takes only a JSON body, sent as application/json.",
  },
  runNotFound: { status: 404, code: "run_not_found", message: "There is no such run." },
  eventNotAccepted: {
    status: 409,
    code: "event_not_accepted",
    message: "The run doesn't take this event now.",
  },
  cancelNotSupported: {
    status: 501,
    code: "cancel_not_supported",
    message: "This server can't cancel a run.",
  },
  webhookRejected: {
    status: 401,
    code: "webhook_rejected",
    message: "The request isn't a valid, signed webhook for this address.",
  },
  webhookReplayed: {
    status: 409,
    code: "webhook_replayed",
    message: "This delivery was already received.",
  },
  webhookRoutineBusy: {
    status: 429,
    code: "webhook_routine_busy",
    message: "The routine is still running. Send this delivery again later.",
  },
  notFound: { status: 404, code: "not_found", message: "There is nothing at this address." },
  internal: {
    status: 500,
    code: "internal_error",
    message: "The server couldn't answer this request.",
  },
} as const;

/** One entry of {@link serverErrors}. */
export type ServerError = (typeof serverErrors)[keyof typeof serverErrors];

/** Builds the JSON response of an error: a code and a short message, nothing else. */
export function errorResponse(error: ServerError, headers?: Record<string, string>): Response {
  const body: ServerErrorBody = { code: error.code, message: error.message };
  return Response.json(
    body,
    headers === undefined ? { status: error.status } : { status: error.status, headers },
  );
}
