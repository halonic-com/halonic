import { decodeBase64url, encodeBase64url } from "@halonicjs/std";

// The stored text, `$pbkdf2-sha256-chain$i=<rounds>,n=<runs>$<salt>$<hash>`
// (`ports.password-hash-format-pbkdf2-chain`). Reading it is strict: every
// hash has exactly one text, and anything else is a RangeError before any
// PBKDF2 work starts.

/** The rounds per run: the most PBKDF2 rounds Cloudflare allows in one WebCrypto call. */
export const rounds = 100_000;
/** The runs new hashes use (HAL-136): the same work per guess as one run of 600,000 rounds. */
export const currentRuns = 6;
/** Fewer runs are weaker than the decision allows; more would stop fitting a Worker's CPU budget. */
const minimumRuns = 6;
const maximumRuns = 20;
/** Salt and hash lengths in bytes. */
export const saltLength = 16;
export const hashLength = 32;

const prefix = "$pbkdf2-sha256-chain$";
// Settings without leading zeros and in a fixed order, so no second text
// means the same hash. Nine digits at most keeps Number() exact.
const pattern =
  /^\$pbkdf2-sha256-chain\$i=([1-9]\d{0,8}),n=([1-9]\d{0,8})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** A stored hash, read and checked. */
export interface ChainHash {
  readonly runs: number;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly hash: Uint8Array<ArrayBuffer>;
}

/**
 * Reads a stored hash.
 *
 * @throws RangeError when the text is in another format, malformed, or uses
 *   settings outside i = 100000 and n 6 to 20. The message never holds the text.
 */
export function readHash(text: string): ChainHash {
  if (!text.startsWith(prefix)) {
    throw new RangeError(
      "The password hash isn't a chained PBKDF2 hash ($pbkdf2-sha256-chain$…). Set the password again for this target.",
    );
  }
  const [, roundsText, runsText, saltText, hashText] = pattern.exec(text) ?? [];
  const salt = decodeBase64(saltText);
  const hash = decodeBase64(hashText);
  if (salt?.length !== saltLength || hash?.length !== hashLength) {
    throw new RangeError(
      `The password hash is malformed: it needs i and n in that order, a ${saltLength}-byte salt and a ${hashLength}-byte hash in base64 without padding.`,
    );
  }
  const runs = Number(runsText);
  if (Number(roundsText) !== rounds || runs < minimumRuns || runs > maximumRuns) {
    throw new RangeError(
      `The password hash's settings are out of range: i must be ${rounds} and n ${minimumRuns} to ${maximumRuns}.`,
    );
  }
  return { runs, salt, hash };
}

/** Writes a hash as its stored text. */
export function writeHash({ runs, salt, hash }: ChainHash): string {
  return `${prefix}i=${rounds},n=${runs}$${encodeBase64(salt)}$${encodeBase64(hash)}`;
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
