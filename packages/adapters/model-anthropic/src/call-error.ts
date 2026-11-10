import { ModelCallError, VendorErrorText } from "@halonicjs/ports";
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

/** How much of the vendor's own error text the error keeps. */
const maxVendorText = 300;

/**
 * How Anthropic words a lack of credit without saying `billing_error`: the
 * older "credit balance is too low", and the 400 for a spend limit the user
 * set ("You have reached your specified API usage limits").
 */
const outOfCreditWording = /credit balance is too low|reached your specified API usage limits/i;

/** The `error.details.error_code` of the 429 for the spend cap of the account's tier. */
const spendCapCode = "enforced_spend_limit_reached";

/** How a 403 says it isn't about the key: a country or region, moderation, or the model. */
const notTheKeyWording = /countr|region|territor|moderat|flagged|guardrail|model/i;

/**
 * The HTTP status Anthropic sends with each of its error types
 * (https://docs.anthropic.com/en/api/errors). An `error` event in a stream
 * has a type but no status, and gets the reason the matching status gets.
 */
const statusOfErrorType: Readonly<Record<string, number>> = {
  invalid_request_error: 400,
  authentication_error: 401,
  billing_error: 402,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  timeout_error: 504,
  overloaded_error: 529,
};

/** A masked key, such as OpenAI's `sk-proj-****abcd`: `sk-`, then a star before any space. */
const maskedKey = /sk-[\w-]*\*/;

/**
 * The {@link ModelCallError} for an HTTP error reply with `status` and body
 * `text`. The message ends in the status, such as "(HTTP 400)". The reason is,
 * in this order: `out-of-credit` when the body or the status says so (see
 * {@link isOutOfCredit}), `key-refused` for 401 and for a 403 that doesn't
 * name a country, region, moderation or the model, `model-missing` for 404,
 * `provider-busy` for any other 429, a 5xx and the 529 of an overload, and
 * `refused` for anything else.
 *
 * The vendor's own text goes on the error's `cause`, shortened, except when
 * the key is refused, when a 401 or 403 repeats a masked key, whenever it
 * holds something shaped like a key, and whenever it holds `key`, the key the
 * call was sent with. A proxy may use keys that look like nothing in
 * particular.
 */
export function errorForStatus(
  status: number,
  text: string,
  call: FailedCall,
  key: string,
): ModelCallError {
  return errorForVendorError(status, vendorErrorIn(text), `HTTP ${status}`, call, key);
}

/**
 * The {@link ModelCallError} for an `error` event in a stream the API had
 * accepted, such as `overloaded_error`. It has the reason
 * {@link errorForStatus} gives the status of its type, so an overload is
 * `provider-busy` whether it comes as a 529 or mid-stream; a type we don't
 * know is `refused`. The message ends in the type, such as
 * "(overloaded_error)", and the API's text goes on the `cause` under the same
 * rules as for a status.
 */
export function errorForStreamedError(
  vendorType: string,
  text: string,
  call: FailedCall,
  key: string,
): ModelCallError {
  const status = Object.hasOwn(statusOfErrorType, vendorType)
    ? statusOfErrorType[vendorType]
    : undefined;
  // Only a type from the list above reaches the message: no outside text there.
  const label = status === undefined ? "error event" : vendorType;
  const vendor: VendorError = { message: text, type: vendorType, detailCode: undefined };
  return errorForVendorError(status, vendor, label, call, key);
}

/**
 * The {@link ModelCallError} for `vendor`, an error the API sent with
 * `status` (undefined when it gave none we know), as {@link errorForStatus}
 * describes. `label` closes the message, such as "HTTP 400".
 */
function errorForVendorError(
  status: number | undefined,
  vendor: VendorError,
  label: string,
  call: FailedCall,
  key: string,
): ModelCallError {
  const keyRefused = isKeyRefused(status, vendor);
  const dropText = keyRefused || namesMaskedKey(status, vendor.message);
  const vendorText = dropText ? "" : shortened(vendor.message, key);
  const options = vendorText === "" ? {} : { cause: new VendorErrorText(status, vendorText) };
  if (isOutOfCredit(status, vendor)) {
    return new ModelCallError(
      "out-of-credit",
      `${call.providerId} refused the call to the model "${call.model}" because the account has no credit left or reached its limit (${label})`,
      options,
    );
  }
  if (keyRefused) {
    return new ModelCallError("key-refused", `${call.providerId} didn't accept the key (${label})`);
  }
  if (status === 404) {
    return new ModelCallError(
      "model-missing",
      `${call.providerId} doesn't have the model "${call.model}" (${label})`,
      options,
    );
  }
  if (status !== undefined && (status === 429 || status >= 500)) {
    return new ModelCallError(
      "provider-busy",
      `${call.providerId} was busy and couldn't take the call to the model "${call.model}" (${label})`,
      options,
    );
  }
  return new ModelCallError(
    "refused",
    `${call.providerId} refused the call to the model "${call.model}" (${label})`,
    options,
  );
}

/**
 * Whether the account has no credit left: a 402 or a `billing_error`, a 429
 * for the tier's spend cap, or text that says so, whatever the status.
 */
function isOutOfCredit(status: number | undefined, vendor: VendorError): boolean {
  return (
    status === 402 ||
    vendor.type === "billing_error" ||
    vendor.detailCode === spendCapCode ||
    outOfCreditWording.test(vendor.message)
  );
}

/**
 * Whether a 401 or 403 repeats a masked key, such as OpenAI's
 * `sk-proj-****abcd`. `findSecretShape` doesn't spot one, and a 403 that isn't
 * about the key keeps its text otherwise.
 */
function namesMaskedKey(status: number | undefined, message: string): boolean {
  return (status === 401 || status === 403) && maskedKey.test(message);
}

/** Whether the API turned the key away: a 401, or a 403 about nothing else. */
function isKeyRefused(status: number | undefined, vendor: VendorError): boolean {
  if (status === 401) return true;
  return status === 403 && !notTheKeyWording.test(vendor.message);
}

/** The {@link ModelCallError} when the provider couldn't be reached. */
export function errorForNetwork(cause: unknown, call: FailedCall): ModelCallError {
  const where = call.host === undefined ? "" : ` at ${call.host}`;
  return new ModelCallError("offline", `Halonic couldn't reach ${call.providerId}${where}`, {
    cause,
    ...(call.host === undefined ? {} : { host: call.host }),
  });
}

/** The {@link ModelCallError} for a reply that isn't in the Messages format. */
export function errorForReply(cause: unknown, call: FailedCall): ModelCallError {
  return new ModelCallError(
    "refused",
    `${call.providerId} answered for the model "${call.model}" in a form Halonic can't read`,
    { cause },
  );
}

/** The {@link ModelCallError} for a reply larger than the provider reads. */
export function errorForSize(cause: BodyTooLargeError, call: FailedCall): ModelCallError {
  return new ModelCallError(
    "refused",
    `${call.providerId}'s answer for the model "${call.model}" was over ${megabytes(cause.maxBytes)}, more than Halonic reads`,
    { cause },
  );
}

/** `bytes` in whole megabytes, as a user reads a limit: 10 MiB is "10 MB". */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** What an error body says: its text, its type, and the code in its details. */
interface VendorError {
  /** The error text, or the whole body when it isn't in a format we know. */
  message: string;
  type: string | undefined;
  /** `error.details.error_code`, which Anthropic sends with some 429s. */
  detailCode: string | undefined;
}

/** `{ type: "error", error: { type, message, details } }` from Anthropic, or the body itself. */
function vendorErrorIn(text: string): VendorError {
  const unknown: VendorError = { message: text, type: undefined, detailCode: undefined };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return unknown;
  }
  const error = isPlainObject(body) ? body["error"] : undefined;
  if (!isPlainObject(error)) return unknown;
  const details = error["details"];
  return {
    message: typeof error["message"] === "string" ? error["message"] : text,
    type: stringOrUndefined(error["type"]),
    detailCode: isPlainObject(details) ? stringOrUndefined(details["error_code"]) : undefined,
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `message` with its spaces folded and cut to {@link maxVendorText}; "" when it may hold a key. */
function shortened(message: string, key: string): string {
  const folded = message.replace(/\s+/g, " ").trim();
  if (mayHoldKey(folded, key)) return "";
  return folded.length > maxVendorText ? `${folded.slice(0, maxVendorText)}…` : folded;
}

/** Whether `text` holds the call's own `key` or something shaped like a key. */
function mayHoldKey(text: string, key: string): boolean {
  return (key !== "" && text.includes(key)) || findSecretShape(text) !== undefined;
}
