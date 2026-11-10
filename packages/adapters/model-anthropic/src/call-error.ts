import { ModelCallError } from "@halonicjs/ports";
import { findSecretShape, isPlainObject } from "@halonicjs/std";

// Adapted from model-openai's call-error.ts (#688). The shortening and the
// key check are candidates for the shared http-kit in the plan's adapters table.

/** The call that failed, for the error message. */
export interface FailedCall {
  /** The provider's id in the workspace. */
  providerId: string;
  model: string;
}

/** How much of the vendor's own error text goes into the message. */
const maxVendorText = 300;

/**
 * The {@link ModelCallError} for an HTTP error reply with `status` and body
 * `text`.
 *
 * The vendor's own text is kept, shortened, so the run log says what went
 * wrong, except after 401 or 403 and whenever it holds something shaped like
 * a key.
 */
export function errorForStatus(status: number, text: string, call: FailedCall): ModelCallError {
  if (status === 401 || status === 403) {
    return new ModelCallError("refused", `${call.providerId} turned the key away (HTTP ${status})`);
  }
  const detail = withVendorText(`HTTP ${status}`, errorTextIn(text));
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
  return new ModelCallError("offline", `${call.providerId} could not be reached`, { cause });
}

/** The {@link ModelCallError} for a reply that isn't in the Messages format. */
export function errorForReply(cause: unknown, call: FailedCall): ModelCallError {
  return new ModelCallError(
    "refused",
    `${call.providerId} answered model "${call.model}" in a format we can't read`,
    { cause },
  );
}

/** `label: text`, with the vendor's text shortened; only `label` when the text is empty or may hold a key. */
function withVendorText(label: string, text: string): string {
  const message = text.replace(/\s+/g, " ").trim();
  if (message === "" || findSecretShape(message) !== undefined) return label;
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
