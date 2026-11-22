// Keys, a clock and a nonce store for the tests. The keys are made fresh for
// every test run and never leave memory.

import { type Clock, encodeBase64url, type RandomBytes } from "@halonicjs/std";
import type { Direction } from "./format.ts";
import { importPublicKey, importSigningKey, type SigningKey } from "./keys.ts";
import { type RequestToSign, signRequest } from "./sign.ts";
import type { NonceStore, ReceivedRequest, TrustedKey, VerifyingContext } from "./verify.ts";

/** A fresh key pair in the forms the format stores, and the same keys read back. */
export interface TestKey {
  readonly signing: SigningKey;
  readonly publicKey: CryptoKey;
  readonly publicText: string;
  readonly privateText: string;
}

/** Makes an Ed25519 key pair under the given id. */
export async function makeTestKey(id: string): Promise<TestKey> {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  if (!("privateKey" in pair)) {
    throw new Error("Ed25519 gave one key instead of a pair");
  }
  const publicText = encodeBase64url(
    new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
  );
  const privateText = encodeBase64url(
    new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  );
  const signing = await importSigningKey(id, privateText);
  const publicKey = await importPublicKey(publicText);
  if (!signing.ok || !publicKey.ok) {
    throw new Error("a freshly made key pair didn't read back");
  }
  return { signing: signing.value, publicKey: publicKey.value, publicText, privateText };
}

/** 2026-11-22T12:00:00Z, the time the tests sign at. */
export const signingTime = Date.UTC(2026, 10, 22, 12);

/** A clock that always says the given time. */
export function clockAt(time: number): Clock {
  return { now: () => new Date(time) };
}

/** Random bytes that are the same on every run: 0, 1, 2, … */
export const countingBytes: RandomBytes = (count) =>
  Uint8Array.from({ length: count }, (_, index) => index);

/** A nonce store in memory, as one receiver instance would keep it. */
export function memoryNonceStore(): NonceStore & { size(): number } {
  const kept = new Map<string, number>();
  return {
    async remember(keyId, nonce, keepUntil) {
      const entry = `${keyId} ${nonce}`;
      if (kept.has(entry)) {
        return "seen";
      }
      kept.set(entry, keepUntil.getTime());
      return "new";
    },
    size: () => kept.size,
  };
}

/** A request to `https://app.example.com/v1/usage`, deployment to Cloud, for product `prd_a`. */
export function usageRequest(overrides: Partial<RequestToSign> = {}): RequestToSign {
  return {
    direction: "deployment-to-cloud",
    method: "POST",
    url: "https://app.example.com/v1/usage?batch=2",
    body: new TextEncoder().encode('{"records":[]}'),
    product: "prd_a",
    endUser: "usr_1",
    commandId: "cmd_1",
    ...overrides,
  };
}

/** Signs a request with the key at the given time and returns it as a receiver gets it. */
export async function signedAs(
  request: RequestToSign,
  key: TestKey,
  time: number = signingTime,
  randomBytes: RandomBytes = countingBytes,
): Promise<ReceivedRequest> {
  const headers = await signRequest(request, {
    key: key.signing,
    clock: clockAt(time),
    randomBytes,
  });
  return {
    method: request.method,
    url: request.url,
    headers: new Headers(headers),
    body: request.body,
  };
}

/** A receiver that accepts the given keys for their products, at the given time. */
export function receiver(
  keys: Record<string, TrustedKey>,
  options: { direction?: Direction; time?: number; nonces?: NonceStore } = {},
): VerifyingContext {
  return {
    direction: options.direction ?? "deployment-to-cloud",
    findKey: async (keyId) => keys[keyId],
    nonces: options.nonces ?? memoryNonceStore(),
    clock: clockAt(options.time ?? signingTime),
  };
}
