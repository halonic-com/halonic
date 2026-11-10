import { ModelCallError, VendorErrorText } from "@halonicjs/ports";
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

/** How much of the vendor's own error text the error keeps. */
const maxVendorText = 300;

/** Vendors word "this model can't call tools" differently; these are the wordings we know. */
const noToolsWording =
  /does not support tools|doesn't support tools|tools? (?:are|is) not supported/i;

/**
 * Error codes and types that say the account has no credit left. OpenAI sends
 * them with 429 and the type `insufficient_quota`, sometimes with one of these
 * codes; other servers send them with other statuses, so the body decides.
 */
const outOfCreditCodes = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

/**
 * How a 403 says it isn't about the key: OpenAI blocks some countries and
 * regions, OpenRouter's moderation and guardrails turn calls down, and
 * Together refuses models a plan doesn't include.
 */
const notTheKeyWording = /countr|region|territor|moderat|flagged|guardrail|model/i;

/** A masked key, such as OpenAI's `sk-proj-****abcd`: `sk-`, then a star before any space. */
const maskedKey = /sk-[\w-]*\*/;

/** Groq's status when its flex tier is full. */
const flexTierFull = 498;

/**
 * The {@link ModelCallError} for an HTTP error reply with `status` and body
 * `text`. The message ends in the status, such as "(HTTP 400)". The reason is,
 * in this order: `out-of-credit` when the body or the status says so (see
 * {@link isOutOfCredit}), `key-refused` for 401 and for a 403 that doesn't
 * name a country, region, moderation or the model, `model-missing` for 404,
 * `model-no-tools` when the server says so about a call that offered tools,
 * `provider-busy` for any other 429, Groq's 498 and a 5xx, and `refused` for
 * anything else.
 *
 * The vendor's own text goes on the error's `cause`, shortened, except when
 * the key is refused (OpenAI repeats part of a wrong key there), when a 401
 * or 403 repeats a masked key, whenever it holds something shaped like a key,
 * and whenever it holds `key`, the key the call was sent with. Local servers
 * and proxies may use keys that look like nothing in particular.
 */
export function errorForStatus(
  status: number,
  text: string,
  call: FailedCall,
  key: string | undefined,
): ModelCallError {
  const http = `HTTP ${status}`;
  const vendor = vendorErrorIn(text);
  const refusedCall = `${call.providerId} refused the call to the model "${call.model}" (${http})`;
  const keyRefused = isKeyRefused(status, vendor);
  const dropText = keyRefused || namesMaskedKey(status, vendor.message);
  const vendorText = dropText ? "" : shortened(vendor.message, key);
  const options = vendorText === "" ? {} : { cause: new VendorErrorText(status, vendorText) };
  if (isOutOfCredit(status, vendor)) {
    return new ModelCallError(
      "out-of-credit",
      `${call.providerId} refused the call to the model "${call.model}" because the account has no credit left or reached its limit (${http})`,
      options,
    );
  }
  if (keyRefused) {
    return new ModelCallError("key-refused", `${call.providerId} didn't accept the key (${http})`);
  }
  if (status === 404) {
    return new ModelCallError(
      "model-missing",
      `${call.providerId} doesn't have the model "${call.model}" (${http})`,
      options,
    );
  }
  if (call.offeredTools && noToolsWording.test(vendorText)) {
    return new ModelCallError(
      "model-no-tools",
      `"${call.model}" on ${call.providerId} can't use tools, and this call offered tools (${http})`,
      options,
    );
  }
  if (status === 429 || status === flexTierFull || status >= 500) {
    return new ModelCallError(
      "provider-busy",
      `${call.providerId} was busy and couldn't take the call to the model "${call.model}" (${http})`,
      options,
    );
  }
  return new ModelCallError("refused", refusedCall, options);
}

/**
 * Whether the account has no credit left: a 402 (DeepSeek, Together,
 * OpenRouter, Mistral), or a body whose type or code says so, whatever the
 * status.
 */
function isOutOfCredit(status: number, vendor: VendorError): boolean {
  if (status === 402) return true;
  return [vendor.type, vendor.code].some(
    (value) => value !== undefined && outOfCreditCodes.has(value),
  );
}

/**
 * Whether a 401 or 403 repeats a masked key, such as OpenAI's
 * `sk-proj-****abcd`. `findSecretShape` doesn't spot one, and a 403 that isn't
 * about the key keeps its text otherwise.
 */
function namesMaskedKey(status: number, message: string): boolean {
  return (status === 401 || status === 403) && maskedKey.test(message);
}

/** Whether the server turned the key away: a 401, or a 403 about nothing else. */
function isKeyRefused(status: number, vendor: VendorError): boolean {
  if (status === 401) return true;
  return status === 403 && !notTheKeyWording.test(vendor.message);
}

/** The {@link ModelCallError} when the provider couldn't be reached at all. */
export function errorForNetwork(cause: unknown, call: FailedCall): ModelCallError {
  const where = call.host === undefined ? "" : ` at ${call.host}`;
  return new ModelCallError("offline", `Halonic couldn't reach ${call.providerId}${where}`, {
    cause,
    ...(call.host === undefined ? {} : { host: call.host }),
  });
}

/** The {@link ModelCallError} for a reply that isn't in the chat completions format. */
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

/**
 * The {@link ModelCallError} for an error the server sent as a streamed event
 * after it took the call: `out-of-credit` when the event says so, as for an
 * error reply, and `refused` otherwise. The vendor's text goes on the `cause`
 * as in {@link errorForStatus}, with the 200 the call was taken with.
 */
export function errorForStreamedError(
  event: string,
  call: FailedCall,
  key: string | undefined,
): ModelCallError {
  const vendor = vendorErrorIn(event);
  const vendorText = shortened(vendor.message, key);
  const options = vendorText === "" ? {} : { cause: new VendorErrorText(200, vendorText) };
  const stopped = `${call.providerId} stopped the answer from the model "${call.model}"`;
  if (isOutOfCredit(200, vendor)) {
    return new ModelCallError(
      "out-of-credit",
      `${stopped} because the account has no credit left or reached its limit`,
      options,
    );
  }
  return new ModelCallError("refused", `${stopped} with an error`, options);
}

/** What an error body says: its text, and the type and code when it has them. */
interface VendorError {
  /** The error text, or the whole body when it isn't in a format we know. */
  message: string;
  type: string | undefined;
  code: string | undefined;
}

/** `{ error: { message, type, code } }` from OpenAI, `{ error: "…" }` from Ollama, or the body itself. */
function vendorErrorIn(text: string): VendorError {
  const unknown: VendorError = { message: text, type: undefined, code: undefined };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return unknown;
  }
  const error = isPlainObject(body) ? body["error"] : undefined;
  if (typeof error === "string") return { ...unknown, message: error };
  if (!isPlainObject(error)) return unknown;
  return {
    message: typeof error["message"] === "string" ? error["message"] : text,
    type: stringOrUndefined(error["type"]),
    code: stringOrUndefined(error["code"]),
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `message` with its spaces folded and cut to {@link maxVendorText}; "" when it may hold a key. */
function shortened(message: string, key: string | undefined): string {
  const folded = message.replace(/\s+/g, " ").trim();
  if (mayHoldKey(folded, key)) return "";
  return folded.length > maxVendorText ? `${folded.slice(0, maxVendorText)}…` : folded;
}

/** Whether `text` holds the call's own `key` or something shaped like a key. */
function mayHoldKey(text: string, key: string | undefined): boolean {
  if (key !== undefined && key !== "" && text.includes(key)) return true;
  return findSecretShape(text) !== undefined;
}
