import {
  gatewayMaxNameBytes,
  type PairCommitPayload,
  type PairHostPayload,
  type PairPhonePayload,
  pairCommitNonceBytes,
} from "@halonicjs/ports";

/**
 * The JSON payloads of the pairing handshake (`remote-gateway-session.ts` in
 * `@halonicjs/ports`). Each reader takes exactly the fields the ADR lists, of
 * the right type and length, and nothing else.
 */

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
/** SHA-256 in base64url without padding. */
const commitPattern = /^[A-Za-z0-9_-]{43}$/;

/** Reads pairing message 1's payload, the phone's commitment. */
export function readCommitPayload(bytes: Uint8Array): PairCommitPayload | undefined {
  const value = jsonObject(bytes, ["commit"]);
  const commit = value?.["commit"];
  return typeof commit === "string" && commitPattern.test(commit) ? { commit } : undefined;
}

/** Writes pairing message 2's payload, the host's name. */
export function encodeHostPayload(payload: PairHostPayload): Uint8Array {
  return encoder.encode(JSON.stringify({ hostName: payload.hostName }));
}

/** Reads pairing message 3's payload: the phone's name, platform and nonce. */
export function readPhonePayload(bytes: Uint8Array): PairPhonePayload | undefined {
  const value = jsonObject(bytes, ["name", "platform", "nonce"]);
  if (value === undefined) return undefined;
  const { name, platform, nonce } = value;
  const valid = isName(name) && (platform === "android" || platform === "ios") && isNonce(nonce);
  return valid ? { name, platform, nonce } : undefined;
}

/** The bytes as one JSON object with exactly these fields, or `undefined`. */
function jsonObject(
  bytes: Uint8Array,
  fields: readonly string[],
): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8.decode(bytes));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const names = Object.keys(parsed);
  const exact = names.length === fields.length && fields.every((field) => names.includes(field));
  return exact ? (parsed as Record<string, unknown>) : undefined;
}

function isName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  return encoder.encode(value).length <= gatewayMaxNameBytes && value.isWellFormed();
}

/** A nonce of 16 bytes in base64url without padding, written the one way it can be. */
function isNonce(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === pairCommitNonceBytes && bytes.toString("base64url") === value;
}
