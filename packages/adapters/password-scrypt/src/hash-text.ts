import { decodeBase64url, encodeBase64url } from "@halonicjs/std";

// The stored text, `$scrypt$ln=<log2 N>,r=<r>,p=<p>$<salt>$<key>`
// (`ports.password-hash-format`). Reading it is strict: every hash has exactly
// one text, and anything else is a RangeError before any scrypt work starts.

/** The settings new hashes use. */
export const currentSettings = { logN: 14, r: 8, p: 5 } as const;
/** What `verify` accepts. The upper bounds keep one check within 32 MiB of memory. */
const minimumLogN = 14;
const maximumLogN = 15;
const requiredR = 8;
const minimumP = 5;
const maximumP = 16;
/** Salt and key lengths in bytes. */
export const saltLength = 16;
export const keyLength = 32;

const prefix = "$scrypt$";
// Settings without leading zeros and in a fixed order, so no second text
// means the same hash. Nine digits at most keeps Number() exact.
const pattern =
  /^\$scrypt\$ln=([1-9]\d{0,8}),r=([1-9]\d{0,8}),p=([1-9]\d{0,8})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** The scrypt cost settings of a hash. */
export interface ScryptSettings {
  readonly logN: number;
  readonly r: number;
  readonly p: number;
}

/** A stored hash, read and checked. */
export interface ScryptHash extends ScryptSettings {
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly key: Uint8Array<ArrayBuffer>;
}

/**
 * Reads a stored hash.
 *
 * @throws RangeError when the text is in another format, malformed, or uses
 *   settings outside ln 14 to 15, r 8 and p 5 to 16. The message never holds the text.
 */
export function readHash(text: string): ScryptHash {
  if (!text.startsWith(prefix)) {
    throw new RangeError(
      "The password hash isn't a scrypt hash ($scrypt$…). Set the password again for this target.",
    );
  }
  const [, logNText, rText, pText, saltText, keyText] = pattern.exec(text) ?? [];
  const salt = decodeBase64(saltText);
  const key = decodeBase64(keyText);
  if (salt?.length !== saltLength || key?.length !== keyLength) {
    throw new RangeError(
      `The password hash is malformed: it needs ln, r and p in that order, a ${saltLength}-byte salt and a ${keyLength}-byte key in base64 without padding.`,
    );
  }
  const settings = { logN: Number(logNText), r: Number(rText), p: Number(pText) };
  if (!inRange(settings)) {
    throw new RangeError(
      `The password hash's settings are out of range: ln must be ${minimumLogN} to ${maximumLogN}, r ${requiredR} and p ${minimumP} to ${maximumP}.`,
    );
  }
  return { ...settings, salt, key };
}

/** Writes a hash as its stored text. */
export function writeHash({ logN, r, p, salt, key }: ScryptHash): string {
  return `${prefix}ln=${logN},r=${r},p=${p}$${encodeBase64(salt)}$${encodeBase64(key)}`;
}

/** Whether a hash was made with other settings than new hashes use. */
export function isCurrent({ logN, r, p }: ScryptSettings): boolean {
  return logN === currentSettings.logN && r === currentSettings.r && p === currentSettings.p;
}

function inRange({ logN, r, p }: ScryptSettings): boolean {
  return (
    logN >= minimumLogN && logN <= maximumLogN && r === requiredR && p >= minimumP && p <= maximumP
  );
}

// The format uses standard base64 without padding, as PHC strings do. It
// differs from base64url only in two characters, so the strict base64url
// helpers in core/std do the work. The pattern above already refuses `-`,
// `_` and `=`, so only `+` and `/` need swapping.

function encodeBase64(bytes: Uint8Array): string {
  return encodeBase64url(bytes).replaceAll("-", "+").replaceAll("_", "/");
}

function decodeBase64(text: string | undefined): Uint8Array<ArrayBuffer> | undefined {
  return text === undefined
    ? undefined
    : decodeBase64url(text.replaceAll("+", "-").replaceAll("/", "_"));
}
