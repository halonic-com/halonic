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

/** How much of the vendor's own error text the error keeps. */
const maxVendorText = 300;

/** Vendors word "this model can't call tools" differently; these are the wordings we know. */
const noToolsWording =
  /does not support tools|doesn't support tools|tools? (?:are|is) not supported/i;

/**
 * The vendor's own error text, shortened, as the `cause` of a
 * {@link ModelCallError}. It stays out of the message, which Studio and the
 * command line show: microcopy 1.4 allows no quoted outside text there. The
 * cause is for `--debug` and Copy details.
 */
export class VendorErrorText extends Error {
  override readonly name = "VendorErrorText";
  /** The HTTP status the text came with. */
  readonly status: number;

  /**
   * @param status - the HTTP status the text came with
   * @param text - the vendor's text, already shortened and checked for keys
   */
  constructor(status: number, text: string) {
    super(text);
    this.status = status;
  }
}

/**
 * The {@link ModelCallError} for an HTTP error reply with `status` and body
 * `text`. The message ends in the status, such as "(HTTP 400)".
 *
 * The vendor's own text goes on the error's `cause`, shortened, except after
 * 401 or 403 (OpenAI repeats part of a wrong key there), whenever it holds
 * something shaped like a key, and whenever it holds `key`, the key the call
 * was sent with. Local servers and proxies may use keys that look like
 * nothing in particular.
 */
export function errorForStatus(
  status: number,
  text: string,
  call: FailedCall,
  key: string | undefined,
): ModelCallError {
  const http = `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ModelCallError("refused", `${call.providerId} didn't accept the key (${http})`);
  }
  const vendorText = vendorMessage(text, key);
  const options = vendorText === "" ? {} : { cause: new VendorErrorText(status, vendorText) };
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
  return new ModelCallError(
    "refused",
    `${call.providerId} refused the call to the model "${call.model}" (${http})`,
    options,
  );
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
