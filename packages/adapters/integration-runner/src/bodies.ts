// Request bodies and body pieces as they cross the bridge. The runner encodes
// a body the way the kit accepts it in-process (text, a form or bytes), and
// Halonic turns it back into the same kind, so the kit checks it the same way.

import { maxRequestBodyBytes } from "@halonicjs/integration-kit";
import { IntegrationRefusedError } from "@halonicjs/integration-kit/integration";
import type { FrameBody } from "./frames.ts";

const utf8 = new TextEncoder();

/**
 * The body as it crosses, or `null` for none. It refuses what the kit
 * refuses in-process, before anything crosses: a body that isn't text, a
 * form or bytes (such as a `Blob`, `FormData` or a stream), and one over
 * {@link maxRequestBodyBytes} measured on the bytes sent (A27).
 *
 * @throws {IntegrationRefusedError} for a body the kit would refuse, with its code
 */
export function encodeRequestBody(body: RequestInit["body"]): FrameBody | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") {
    checkSize(utf8.encode(body).byteLength);
    return { kind: "text", text: body };
  }
  if (body instanceof URLSearchParams) {
    const text = body.toString();
    checkSize(text.length);
    return { kind: "form", text };
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    checkSize(body.byteLength);
    return { kind: "bytes", base64: toBase64(asBytes(body)) };
  }
  throw new IntegrationRefusedError(
    "body-not-supported",
    "this kind of request body is not supported; send text, bytes or a form",
  );
}

/** The body as the kit takes it, the same kind the integration gave. */
export function decodeRequestBody(
  body: FrameBody | null,
): string | URLSearchParams | Uint8Array | null {
  if (body === null) return null;
  switch (body.kind) {
    case "text":
      return body.text;
    case "form":
      return new URLSearchParams(body.text);
    case "bytes":
      return fromBase64(body.base64);
  }
}

function checkSize(bytes: number): void {
  if (bytes > maxRequestBodyBytes) {
    throw new IntegrationRefusedError(
      "request-too-large",
      `the request body is larger than ${maxRequestBodyBytes} bytes`,
    );
  }
}

function asBytes(body: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

/** Bytes per `String.fromCharCode` call, well under the engines' argument limits. */
const base64Slice = 0x8000;

/** The bytes as base64, with the Web's `btoa`. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.byteLength; start += base64Slice) {
    binary += String.fromCharCode(...bytes.subarray(start, start + base64Slice));
  }
  return btoa(binary);
}

/**
 * The bytes of a base64 text, with the Web's `atob`.
 *
 * @throws {DOMException} when the text is not base64
 */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
