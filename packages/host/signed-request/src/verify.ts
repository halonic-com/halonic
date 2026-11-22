import { type Clock, decodeBase64url, err, ok, type Result } from "@halonicjs/std";
import {
  bodyHash,
  type Direction,
  headerPatterns,
  requestTarget,
  signedMessage,
  signedRequestHeaders,
  timeWindowSeconds,
} from "./format.ts";
import { algorithm } from "./keys.ts";

/** A key the receiver accepts, with the product it belongs to. */
export interface TrustedKey {
  readonly publicKey: CryptoKey;
  /** The product the key signs for. The signature must cover this product. */
  readonly product: string;
}

/**
 * Finds a key the receiver accepts right now. A revoked key, a key past its
 * retiring time, or a key of another direction is not found.
 */
export type FindTrustedKey = (keyId: string) => Promise<TrustedKey | undefined>;

/** Remembers nonces for the time window, to refuse a request sent twice. */
export interface NonceStore {
  /**
   * Records a nonce for a key until the given time, in one atomic step.
   *
   * @returns `"new"` the first time, `"seen"` when the key already used it before that time
   */
  remember(keyId: string, nonce: string, keepUntil: Date): Promise<"new" | "seen">;
}

/** The request as the receiver got it. */
export interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  /** The body's exact bytes; empty for a request without a body. */
  readonly body: Uint8Array;
}

/** What the receiver brings: the direction it accepts, its keys, its nonces and its clock. */
export interface VerifyingContext {
  readonly direction: Direction;
  readonly findKey: FindTrustedKey;
  readonly nonces: NonceStore;
  readonly clock: Clock;
}

/** A request whose signature holds, and what it was signed for. */
export interface VerifiedRequest {
  readonly keyId: string;
  /** The product of the key that verified the request. */
  readonly product: string;
  readonly endUser: string | undefined;
  readonly commandId: string | undefined;
  readonly signedAt: Date;
}

/**
 * Why a request was refused. The receiver answers every one the same way, so
 * a caller learns nothing about which check failed.
 */
export type SignedRequestRefusal =
  | "missing_header"
  | "malformed_header"
  | "outside_time_window"
  | "unknown_key"
  | "bad_signature"
  | "replayed";

/**
 * Checks a signed request: the headers, the time, the key, the signature and
 * then the nonce. The nonce is recorded only once the signature holds, so
 * unsigned requests can't fill the store.
 *
 * @param request - the request as received
 * @param context - the direction, the keys, the nonce store and the clock
 * @returns what the request was signed for, or why it was refused
 */
export async function verifyRequest(
  request: ReceivedRequest,
  context: VerifyingContext,
): Promise<Result<VerifiedRequest, SignedRequestRefusal>> {
  const headers = readHeaders(request.headers);
  if (!headers.ok) {
    return headers;
  }
  const { keyId, timestamp, nonce, signature, endUser, commandId } = headers.value;

  const signedAtSeconds = Number(timestamp);
  const nowSeconds = context.clock.now().getTime() / 1000;
  if (Math.abs(nowSeconds - signedAtSeconds) > timeWindowSeconds) {
    return err("outside_time_window");
  }

  const key = await context.findKey(keyId);
  if (key === undefined) {
    return err("unknown_key");
  }

  const message = signedMessage({
    direction: context.direction,
    keyId,
    method: request.method.toUpperCase(),
    ...requestTarget(new URL(request.url)),
    product: key.product,
    endUser,
    commandId,
    timestamp,
    nonce,
    bodyHash: await bodyHash(request.body),
  });
  if (!(await crypto.subtle.verify(algorithm, key.publicKey, signature, message))) {
    return err("bad_signature");
  }

  // Kept until the timestamp leaves the window, so a repeat inside it is caught.
  const keepUntil = new Date((signedAtSeconds + timeWindowSeconds) * 1000);
  if ((await context.nonces.remember(keyId, nonce, keepUntil)) === "seen") {
    return err("replayed");
  }

  return ok({
    keyId,
    product: key.product,
    endUser,
    commandId,
    signedAt: new Date(signedAtSeconds * 1000),
  });
}

interface SignatureHeaders {
  readonly keyId: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly signature: Uint8Array<ArrayBuffer>;
  readonly endUser: string | undefined;
  readonly commandId: string | undefined;
}

function readHeaders(headers: Headers): Result<SignatureHeaders, SignedRequestRefusal> {
  const keyId = headers.get(signedRequestHeaders.keyId);
  const timestamp = headers.get(signedRequestHeaders.timestamp);
  const nonce = headers.get(signedRequestHeaders.nonce);
  const signatureText = headers.get(signedRequestHeaders.signature);
  if (keyId === null || timestamp === null || nonce === null || signatureText === null) {
    return err("missing_header");
  }
  const endUser = headers.get(signedRequestHeaders.endUser) ?? undefined;
  const commandId = headers.get(signedRequestHeaders.commandId) ?? undefined;
  const signature = decodeBase64url(signatureText);
  const wellFormed =
    headerPatterns.keyId.test(keyId) &&
    headerPatterns.timestamp.test(timestamp) &&
    headerPatterns.nonce.test(nonce) &&
    headerPatterns.signature.test(signatureText) &&
    signature !== undefined &&
    (endUser === undefined || headerPatterns.endUser.test(endUser)) &&
    (commandId === undefined || headerPatterns.commandId.test(commandId));
  if (!wellFormed) {
    return err("malformed_header");
  }
  return ok({ keyId, timestamp, nonce, signature, endUser, commandId });
}
