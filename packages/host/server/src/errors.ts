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
  // One code per kind, so a client can rebuild `RunTargetNotFound` without the message naming anything.
  hubNotFound: {
    status: 404,
    code: "hub_not_found",
    message: "There is no such hub to run.",
  },
  workflowNotFound: {
    status: 404,
    code: "workflow_not_found",
    message: "There is no such workflow to run.",
  },
  agentNotFound: {
    status: 404,
    code: "agent_not_found",
    message: "There is no such agent to run.",
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
  secretNameNotAllowed: {
    status: 400,
    code: "secret_name_not_allowed",
    message: "That secret name isn't one a model setting may use.",
  },
  modelAddressNotAllowed: {
    status: 400,
    code: "model_address_not_allowed",
    message: "The workspace has no model provider with that address and secret.",
  },
  modelCallFailed: {
    status: 502,
    code: "model_call_failed",
    message: "The model didn't answer. See the host's error log for the cause.",
  },
  connectorToolNotFound: {
    status: 404,
    code: "connector_tool_not_found",
    message: "There is no such connector tool.",
  },
  connectorCallRefused: {
    status: 403,
    code: "connector_call_refused",
    message: "A call from outside a run can't use this tool.",
  },
  connectorCallFailed: {
    status: 502,
    code: "connector_call_failed",
    message: "The connector's tool failed. See the host's error log for the cause.",
  },
  requestAborted: {
    status: 499,
    code: "request_aborted",
    message: "The caller closed the request.",
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
  googleSetupNotFound: {
    status: 404,
    code: "google_setup_not_found",
    message: "There is no Google setup for this account.",
  },
  secretFromOtherSite: {
    status: 403,
    code: "secret_from_other_site",
    message: "The client secret is only accepted from this server's own pages.",
  },
  secretNeedsJson: {
    status: 415,
    code: "json_required",
    message: "Send the client secret as JSON.",
  },
  secretNeedsSecureConnection: {
    status: 403,
    code: "secure_connection_required",
    message:
      "Send the client secret over HTTPS or from this computer. Over plain http it needs your confirmation.",
  },
  secretNotAccepted: {
    status: 400,
    code: "secret_not_accepted",
    message: "That isn't a client secret this server can keep.",
  },
  secretNeedsStaging: {
    status: 409,
    code: "secret_needs_staging",
    message:
      "This client secret is in use. Check a new one with Google before it replaces the old one.",
  },
  secretNotSaved: {
    status: 409,
    code: "secret_not_saved",
    message: "Save a client secret first.",
  },
  secretNeedsNoStaging: {
    status: 409,
    code: "secret_needs_no_staging",
    message:
      "Nothing signed in with this client yet, so a new secret replaces the old one directly.",
  },
  googleSetupIncomplete: {
    status: 409,
    code: "google_setup_incomplete",
    message: "Save the client ID and the client secret first.",
  },
  // TODO(engine step 4): remove with the agent-runs mapping in `trust-routes.ts` when the agent loop lands.
  notImplemented: {
    status: 501,
    code: "not_implemented",
    message: "Agent runs are not available yet in this version of Halonic.",
  },
  signInNeedsThisComputer: {
    status: 409,
    code: "sign_in_needs_this_computer",
    message:
      "Google sends the sign-in back to the computer that runs Halonic. Finish it there, or run halonic google sign-in on it.",
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
