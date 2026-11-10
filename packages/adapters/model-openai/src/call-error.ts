import { ModelCallError } from "@halonicjs/ports";
import { findSecretShape, isPlainObject } from "@halonicjs/std";
import type { BodyTooLargeError } from "./read-body.ts";

/** The call that failed, for the error message. */
export interface FailedCall {
  /** The provider's id in the workspace. */
  providerId: string;
  model: string;
  /** Whether the request offered the model tools. */
  offeredTools: boolean;
  /** The server's host and port, such as `localhost:11434`; undefined when the address doesn't parse. */
  host: string | undefined;
}

/** How much of the vendor's own error text goes into the message. */
const maxVendorText = 300;

/** Vendors word "this model can't call tools" differently; these are the wordings we know. */
const noToolsWording =
  /does not support tools|doesn't support tools|tools? (?:are|is) not supported/i;

/**
 * The {@link ModelCallError} for an HTTP error reply with `status` and body
 * `text`.
 *
 * The vendor's own text is kept, shortened, so the run log says what went
 * wrong, except after 401 or 403 (OpenAI repeats part of a wrong key there)
 * whenever it holds something shaped like a key, and whenever it holds `key`,
 * the key the call was sent with. Local servers and proxies may use keys that
 * look like nothing in particular.
 */
export function errorForStatus(
  status: number,
  text: string,
  call: FailedCall,
  key: string | undefined,
): ModelCallError {
  const vendorText = status === 401 || status === 403 ? "" : vendorMessage(text, key);
  const detail = vendorText === "" ? `HTTP ${status}` : `HTTP ${status}: ${vendorText}`;
  if (status === 401 || status === 403) {
    return new ModelCallError("refused", `${call.providerId} turned the key away (${detail})`);
  }
  if (status === 404) {
    return new ModelCallError(
      "model-missing",
      `${call.providerId} has no model "${call.model}" (${detail})`,
    );
  }
  if (call.offeredTools && noToolsWording.test(vendorText)) {
    return new ModelCallError(
      "model-no-tools",
      `model "${call.model}" on ${call.providerId} can't call tools (${detail})`,
    );
  }
  return new ModelCallError(
    "refused",
    `${call.providerId} refused the call to model "${call.model}" (${detail})`,
  );
}

/** The {@link ModelCallError} when the provider couldn't be reached at all. */
export function errorForNetwork(cause: unknown, call: FailedCall): ModelCallError {
  return new ModelCallError("offline", `${call.providerId} could not be reached`, {
    cause,
    ...(call.host === undefined ? {} : { host: call.host }),
  });
}

/** The {@link ModelCallError} for a reply that isn't in the chat completions format. */
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

/** The error text in an OpenAI-style error body, shortened; "" when it may hold a key. */
function vendorMessage(text: string, key: string | undefined): string {
  const message = errorTextIn(text).replace(/\s+/g, " ").trim();
  if (mayHoldKey(message, key)) return "";
  return message.length > maxVendorText ? `${message.slice(0, maxVendorText)}…` : message;
}

/** `{ error: { message } }` from OpenAI, `{ error: "…" }` from Ollama, or the body itself. */
function errorTextIn(text: string): string {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return text;
  }
  const error = isPlainObject(body) ? body["error"] : undefined;
  if (typeof error === "string") return error;
  if (isPlainObject(error) && typeof error["message"] === "string") return error["message"];
  return text;
}

/** Whether `text` holds the call's own `key` or something shaped like a key. */
function mayHoldKey(text: string, key: string | undefined): boolean {
  if (key !== undefined && key !== "" && text.includes(key)) return true;
  return findSecretShape(text) !== undefined;
}
