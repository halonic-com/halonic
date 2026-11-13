/**
 * Request headers a webhook routine may never copy into a run: the sender's
 * credentials, and the headers the host's server reads to verify a request.
 * Node gives header names in lowercase, so the names are too. The host
 * imports this list, so the file check and the server agree.
 */
export const WEBHOOK_REFUSED_HEADERS: readonly string[] = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-halonic-signature",
  "x-halonic-timestamp",
  "x-halonic-delivery",
  "x-hub-signature",
  "x-hub-signature-256",
  "x-signature",
  "x-webhook-signature",
  "x-webhook-timestamp",
  "x-webhook-id",
  "webhook-signature",
  "webhook-timestamp",
  "webhook-id",
];

/** A lowercase HTTP header name that also works in `{{trigger.headers.<name>}}`. */
export const WEBHOOK_HEADER_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
