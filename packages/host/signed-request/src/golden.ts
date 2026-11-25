// One request signed with a fixed key, at a fixed time, with a fixed nonce. Ed25519 signatures
// are deterministic, so the signature never changes: the signer and the verifier on each side
// (the deployment here, Halonic Cloud from its pinned commit) test against this one copy.
//
// The key is a test key made from the seed bytes 0, 1, 2, …, 31 here in code. It signs nothing
// real and no product trusts it. This file is for tests only: production code never imports it.

import { encodeBase64url } from "@halonicjs/std";
import { importSigningKey, type SigningKey } from "./keys.ts";
import type { RequestToSign } from "./sign.ts";

/** The key id the golden request is signed under. */
export const goldenKeyId = "golden-test-key";

/** 2026-11-22T12:00:00Z, in milliseconds. */
export const goldenTimeMs = Date.UTC(2026, 10, 22, 12);

// The fixed PKCS #8 header of an Ed25519 private key; the 32-byte seed follows it.
const pkcs8Header = [
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
];

const seed = Array.from({ length: 32 }, (_, index) => index);

/** The golden key's public half: 32 raw bytes in base64url. */
export const goldenPublicKey = "A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg";

/** Reads the golden key, ready to sign. */
export async function goldenSigningKey(): Promise<SigningKey> {
  const key = await importSigningKey(
    goldenKeyId,
    encodeBase64url(Uint8Array.from([...pkcs8Header, ...seed])),
  );
  if (!key.ok) {
    throw new Error(`the golden test key didn't read: ${key.error}`);
  }
  return key.value;
}

/** Random bytes that are the same on every call: 0, 1, 2, … */
export function goldenRandomBytes(count: number): Uint8Array {
  return Uint8Array.from({ length: count }, (_, index) => index);
}

/** The golden request: a usage batch from the deployment to Cloud. */
export const goldenRequest: RequestToSign = {
  direction: "deployment-to-cloud",
  method: "POST",
  url: "https://cloud.example.com/v1/usage",
  body: new TextEncoder().encode('{"records":[{"id":"rec_1"}]}'),
  product: "prd_acme",
};

/** The headers {@link goldenRequest} is sent with, signed with the golden key, time and nonce. */
export const goldenHeaders: Readonly<Record<string, string>> = {
  "halonic-signature-key": goldenKeyId,
  "halonic-signature-timestamp": String(goldenTimeMs / 1000),
  "halonic-signature-nonce": "AAECAwQFBgcICQoLDA0ODw",
  "halonic-signature":
    "4lismQPR3AOsAY8sh8Dhlny7SQisiORb-KHtkA6VWqXKMR80uGQt0VJo68TOUQ3GVketmHv5NnmJ2Ill4_zMDA",
};
