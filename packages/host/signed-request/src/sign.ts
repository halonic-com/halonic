import { assert, type Clock, encodeBase64url, type RandomBytes } from "@halonicjs/std";
import {
  bodyHash,
  type Direction,
  headerPatterns,
  nonceByteCount,
  requestTarget,
  signedMessage,
  signedRequestHeaders,
} from "./format.ts";
import { algorithm, type SigningKey } from "./keys.ts";

/** What to sign: the request, which way it goes, and whom it is about. */
export interface RequestToSign {
  readonly direction: Direction;
  readonly method: string;
  /** The full URL the request is sent to. */
  readonly url: string;
  /** The body's exact bytes; empty for a request without a body. */
  readonly body: Uint8Array;
  /** The product the signing key belongs to. */
  readonly product: string;
  readonly endUser?: string | undefined;
  readonly commandId?: string | undefined;
}

/** What signing needs from outside: the key, the time and randomness for the nonce. */
export interface SigningContext {
  readonly key: SigningKey;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
}

/**
 * Signs a request and returns the headers to send with it. The body must be
 * sent exactly as given here, byte for byte.
 *
 * @param request - the request and what it is about
 * @param context - the key, the clock and the random source
 * @returns the signature headers, by lower-case name
 * @throws AssertionError for a customer or command id the format can't carry,
 *   or a random source that gives the wrong number of bytes
 */
export async function signRequest(
  request: RequestToSign,
  context: SigningContext,
): Promise<Record<string, string>> {
  assertCarried(request.endUser, headerPatterns.endUser, "customer id");
  assertCarried(request.commandId, headerPatterns.commandId, "command id");
  const nonceBytes = context.randomBytes(nonceByteCount);
  assert(nonceBytes.length === nonceByteCount, `a nonce needs ${nonceByteCount} random bytes`);

  const nonce = encodeBase64url(nonceBytes);
  const timestamp = String(Math.floor(context.clock.now().getTime() / 1000));
  const message = signedMessage({
    direction: request.direction,
    keyId: context.key.id,
    method: request.method.toUpperCase(),
    ...requestTarget(new URL(request.url)),
    product: request.product,
    endUser: request.endUser,
    commandId: request.commandId,
    timestamp,
    nonce,
    bodyHash: await bodyHash(request.body),
  });
  const signature = await crypto.subtle.sign(algorithm, context.key.privateKey, message);

  const headers: Record<string, string> = {
    [signedRequestHeaders.keyId]: context.key.id,
    [signedRequestHeaders.timestamp]: timestamp,
    [signedRequestHeaders.nonce]: nonce,
    [signedRequestHeaders.signature]: encodeBase64url(new Uint8Array(signature)),
  };
  if (request.endUser !== undefined) {
    headers[signedRequestHeaders.endUser] = request.endUser;
  }
  if (request.commandId !== undefined) {
    headers[signedRequestHeaders.commandId] = request.commandId;
  }
  return headers;
}

function assertCarried(value: string | undefined, pattern: RegExp, what: string): void {
  assert(
    value === undefined || pattern.test(value),
    `the ${what} has characters the format can't carry`,
  );
}
