import { ModelCallError } from "@halonicjs/ports";
import { findSecretShape, isPlainObject } from "@halonicjs/std";
import type { BodyTooLargeError } from "./read-body.ts";

// Adapted from model-openai's call-error.ts (#688). The shortening and the
// key check are candidates for the shared http-kit in the plan's adapters table.

/** The call that failed, for the error message. */
export interface FailedCall {
  /** The provider's id in the workspace. */
  providerId: string;
  model: string;
  /** The API's host and port, such as `api.anthropic.com`; undefined when the address doesn't parse. */
  host: string | undefined;
}

/** How much of the vendor's own error text goes into the message. */
const maxVendorText = 300;

/**
 * The {@link ModelCallError} for an HTTP error reply with `status` and body
 * `text`.
 *
 * The vendor's own text is kept, shortened, so the run log says what went
 * wrong, except after 401 or 403, whenever it holds something shaped like a
 * key, and whenever it holds `key`, the key the call was sent with. A proxy
 * may use keys that look like nothing in particular.
 */
export function errorForStatus(
  status: number,
  text: string,
  call: FailedCall,
  key: string,
): ModelCallError {
  if (status === 401 || status === 403) {
    return new ModelCallError("refused", `${call.providerId} turned the key away (HTTP ${status})`);
  }
  const detail = withVendorText(`HTTP ${status}`, errorTextIn(text), key);
  if (status === 404) {
    return new ModelCallError(
      "model-missing",
      `${call.providerId} has no model "${call.model}" (${detail})`,
    );
  }
  return new ModelCallError(
    "refused",
    `${call.providerId} refused the call to model "${call.model}" (${detail})`,
  );
}

/** The {@link ModelCallError} when the provider couldn't be reached. */
export function errorForNetwork(cause: unknown, call: FailedCall): ModelCallError {
  return new ModelCallError("offline", `${call.providerId} could not be reached`, {
    cause,
    ...(call.host === undefined ? {} : { host: call.host }),
  });
}

/** The {@link ModelCallError} for a reply that isn't in the Messages format. */
export function errorForReply(cause: unknown, call: FailedCall): ModelCallError {
  return new ModelCallError(
    "refused",
    `${call.providerId} answered model "${call.model}" in a format we can't read`,
    { cause },
  );
}

/** The {@link ModelCallError} for a reply larger than the provider reads. */
export function errorForSize(cause: BodyTooLargeError, call: FailedCall): ModelCallError {
  return new ModelCallError(
    "refused",
    `${call.providerId} answered model "${call.model}" with more than ${cause.maxBytes} bytes`,
    { cause },
  );
}

/** `label: text`, with the vendor's text shortened; only `label` when the text is empty or may hold a key. */
function withVendorText(label: string, text: string, key: string): string {
  const message = text.replace(/\s+/g, " ").trim();
  if (message === "" || mayHoldKey(message, key)) return label;
  const shortened =
    message.length > maxVendorText ? `${message.slice(0, maxVendorText)}…` : message;
  return `${label}: ${shortened}`;
}

/** `{ type: "error", error: { message } }` from Anthropic, or the body itself. */
function errorTextIn(text: string): string {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return text;
  }
  const error = isPlainObject(body) ? body["error"] : undefined;
  if (isPlainObject(error) && typeof error["message"] === "string") return error["message"];
  return text;
}

/** Whether `text` holds the call's own `key` or something shaped like a key. */
function mayHoldKey(text: string, key: string): boolean {
  return (key !== "" && text.includes(key)) || findSecretShape(text) !== undefined;
}
