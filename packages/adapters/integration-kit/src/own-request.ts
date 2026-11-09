import type { IntegrationRequestInit, SecretPlacement } from "@halonicjs/ports";
import type { IntegrationPolicy } from "./policy.ts";
import type { Body } from "./request-body.ts";
import { copyPlacements } from "./secret-placement.ts";

/**
 * The request as the integration's code gave it, copied once. The kit
 * checks and sends only this copy.
 */
export interface OwnRequest {
  /** The method as given, for the secret check. */
  readonly givenMethod: string | undefined;
  /** The method the kit sends. */
  readonly method: string;
  /**
   * The URL, only when given as plain text. Anything else could give one URL
   * each time it's turned into text, so it's never read, and `allowedUrl`
   * refuses the request.
   */
  readonly url: string | undefined;
  readonly headers: Headers;
  /** The body, with its bytes or form copied. A kind the kit doesn't support stays as given. */
  readonly body: Body;
  readonly placements: readonly SecretPlacement[];
  readonly signal: AbortSignal | undefined;
}

/**
 * Copies the request before the kit's first `await`, reading each option
 * once. The code keeps its own objects and could change them, or give a
 * getter, after the secret check and before the request is sent: a
 * `Headers` object or a byte array it changes once `fetch` is called, or a
 * getter that gives the check one value and the transport another. A URL
 * object could likewise give the check one text and the request log another.
 */
export function copyRequest(
  policy: IntegrationPolicy,
  url: unknown,
  init: IntegrationRequestInit,
): OwnRequest {
  const { method, headers, body, auth, signal } = init;
  const givenMethod = method === undefined ? undefined : String(method);
  return {
    givenMethod,
    method: (givenMethod ?? "GET").toUpperCase(),
    url: typeof url === "string" ? url : undefined,
    headers: new Headers(headers),
    body: copyBody(body ?? null),
    placements: copyPlacements(policy, auth === undefined ? [] : [auth].flat()),
    signal: signal ?? undefined,
  };
}

/**
 * A copy of a body the kit supports: text as it is, a new form, and bytes
 * copied out of their buffer. Any other kind is left for `checkBody` to refuse.
 */
function copyBody(body: Body): Body {
  if (body instanceof URLSearchParams) return new URLSearchParams(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body).slice();
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice();
  }
  return body;
}
