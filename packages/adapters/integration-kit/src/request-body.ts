import type { IntegrationPolicy } from "./policy.ts";
import { IntegrationRefusedError } from "./refused.ts";

/** A request body as `fetch` takes it, or `null` for none. */
export type Body = NonNullable<RequestInit["body"]> | null;

/**
 * The largest request body the kit sends: 720 KiB, measured on the bytes
 * sent. It holds in-process and in the fenced runner alike: base64 makes it
 * 983,040 bytes, which leaves room in the bridge's 1 MiB frame for the URL,
 * the headers and the JSON around them. The bridge reuses this constant.
 */
export const maxRequestBodyBytes = 720 * 1024;

/**
 * The limit for one request: the one asked for, held at
 * {@link maxRequestBodyBytes}, so it can be lowered but never raised.
 *
 * - A value that isn't a finite number, such as `NaN` or `-Infinity`, gets
 *   the ceiling.
 *   `bytes > NaN` is always false, so passing it through would turn the
 *   check off.
 * - A negative finite value is clamped to 0, which allows a request with no body
 *   and nothing else. Passed through, it would refuse even an empty body,
 *   with a message about a limit of minus some bytes.
 */
export function requestBodyLimit(requested = maxRequestBodyBytes): number {
  if (!Number.isFinite(requested)) return maxRequestBodyBytes;
  return Math.max(0, Math.min(requested, maxRequestBodyBytes));
}

const utf8 = new TextEncoder();

/**
 * The number of bytes the transport will send for this body: text as
 * UTF-8, a form after encoding, bytes as they are. {@link checkBody} has
 * already refused every other kind of body.
 */
export function bodyBytes(body: Body): number {
  if (body === null) return 0;
  if (typeof body === "string") return utf8.encode(body).byteLength;
  // A serialized form is plain ASCII: every other character is percent-encoded.
  if (body instanceof URLSearchParams) return body.toString().length;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
  throw new TypeError("bodyBytes: checkBody refuses this body before it is measured");
}

/**
 * Bodies the kit can measure and send again after a redirect: text, a form
 * or bytes. A stream can be read only once, and anything else, such as a
 * `Blob` or `FormData` from plain JavaScript, has no size the kit can trust.
 */
export function checkBody(policy: IntegrationPolicy, body: unknown): asserts body is Body {
  const supported =
    body === null ||
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body);
  if (!supported) {
    throw new IntegrationRefusedError(
      "body-not-supported",
      `${policy.name}: this kind of request body is not supported; send text, bytes or a form`,
    );
  }
}

export function requestTooLarge(policy: IntegrationPolicy, url: URL, maxBytes: number) {
  return new IntegrationRefusedError(
    "request-too-large",
    `${policy.name}: the request body to ${url.host}${url.pathname} is larger than ${maxBytes} bytes`,
  );
}

export function toForm(policy: IntegrationPolicy, body: Body): URLSearchParams {
  if (body instanceof URLSearchParams) return body;
  if (typeof body === "string") return new URLSearchParams(body);
  throw new IntegrationRefusedError(
    "secret-needs-form-body",
    `${policy.name}: a secret placed in a form field needs a URLSearchParams or text form body`,
  );
}
