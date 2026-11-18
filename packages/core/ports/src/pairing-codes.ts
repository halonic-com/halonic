/**
 * The codes of phone pairing: the 12-character pairing code, the 6-character
 * check code and the QR payload (requirement `ports.pairing-codes`, ADR
 * "Pairing and the end-to-end session"). These are pure codecs. The HKDF
 * steps are done by the Noise adapter, which has the platform's crypto; the
 * test vectors in `golden/pairing-vectors.json` pin both, so the phone's Rust
 * side can check itself against the same values.
 */

/**
 * The 31 symbols of both codes: digits and capitals without 0, O, 1, I and L,
 * which are easy to mistake for each other.
 */
export const pairingAlphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A pairing code is this many symbols, about 59 bits, shown in three groups of four. */
export const pairingCodeLength = 12;

/** A check code is this many symbols, shown in two groups of three. */
export const checkCodeLength = 6;

/**
 * The HKDF-SHA256 info that turns a pairing code into the Noise psk: the
 * input is {@link pairingPskInput}, the salt is empty and the output 32 bytes.
 */
export const pairingPskInfo = "halonic pair psk v1";

/**
 * The HKDF-SHA256 info that turns the pairing handshake's hash into the bytes
 * of the check code: the salt is empty and the output
 * {@link checkCodeInputBytes} bytes, for {@link checkCodeFromBytes}.
 */
export const checkCodeInfo = "halonic pair check v1";

/** How many HKDF bytes {@link checkCodeFromBytes} reads. */
export const checkCodeInputBytes = 8;

const alphabetSize = BigInt(pairingAlphabet.length);
const symbols = new Set(pairingAlphabet);

/**
 * A new pairing code from `randomBytes`, which gives that many bytes from a
 * cryptographic source, such as `crypto.getRandomValues`. A byte of 248 or more
 * is skipped, so each symbol is equally likely.
 */
export function newPairingCode(randomBytes: (length: number) => Uint8Array): string {
  let code = "";
  while (code.length < pairingCodeLength) {
    for (const byte of randomBytes(16)) {
      if (byte >= 248 || code.length === pairingCodeLength) continue;
      code += pairingAlphabet.charAt(byte % pairingAlphabet.length);
    }
  }
  return code;
}

/**
 * A pairing code as a person typed it: in any case, with spaces, dots or
 * dashes anywhere. Gives the code in its plain form, or `undefined` when it
 * isn't 12 symbols of the alphabet.
 */
export function readPairingCode(typed: string): string | undefined {
  return readCode(typed, pairingCodeLength);
}

/** A check code read the same way as {@link readPairingCode}, or `undefined`. */
export function readCheckCode(typed: string): string | undefined {
  return readCode(typed, checkCodeLength);
}

function readCode(typed: string, length: number): string | undefined {
  const code = typed.replace(/[\s.\-·]/g, "").toUpperCase();
  if (code.length !== length || ![...code].every((symbol) => symbols.has(symbol))) {
    return undefined;
  }
  return code;
}

/** A pairing code as shown: three groups of four, `7KQ2 M9XF 4HTA`. */
export function formatPairingCode(code: string): string {
  const plain = requireCode(code, pairingCodeLength, "pairing");
  return `${plain.slice(0, 4)} ${plain.slice(4, 8)} ${plain.slice(8)}`;
}

/** A check code as shown: two groups of three, `4F7 · 2KQ`. */
export function formatCheckCode(code: string): string {
  const plain = requireCode(code, checkCodeLength, "check");
  return `${plain.slice(0, 3)} · ${plain.slice(3)}`;
}

function requireCode(code: string, length: number, kind: string): string {
  const plain = readCode(code, length);
  if (plain === undefined) throw new RangeError(`not a ${kind} code: ${code}`);
  return plain;
}

/** The HKDF input for the psk: the ASCII bytes of the code in its plain form. */
export function pairingPskInput(code: string): Uint8Array {
  return Uint8Array.from(requireCode(code, pairingCodeLength, "pairing"), (symbol) =>
    symbol.charCodeAt(0),
  );
}

/**
 * The check code from the 8 HKDF bytes of the handshake hash: read as an
 * unsigned 64-bit big-endian number, reduced mod 31⁶, written in the alphabet
 * most significant symbol first. The bias of the reduction is under 2⁻³⁴.
 */
export function checkCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== checkCodeInputBytes) {
    throw new RangeError(`a check code needs ${checkCodeInputBytes} bytes, not ${bytes.length}`);
  }
  return writeNumber(readNumber(bytes) % alphabetSize ** BigInt(checkCodeLength), checkCodeLength);
}

function readNumber(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function writeNumber(value: bigint, length: number): string {
  let rest = value;
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code = pairingAlphabet.charAt(Number(rest % alphabetSize)) + code;
    rest /= alphabetSize;
  }
  return code;
}

/** What a pairing QR code says. */
export interface PairingQrPayload {
  /** The host's static X25519 public key, 32 bytes: the phone pins it. */
  readonly hostKey: Uint8Array;
  /** The pairing code, in its plain form. */
  readonly code: string;
  /** The host's name, at most {@link pairingQrMaxHostNameBytes} bytes of UTF-8. */
  readonly hostName: string;
  /** Where the phone reaches the gateway: 1 to 3 `https:`, `wss:` or `tcp:` URLs, the one to try first first. */
  readonly endpoints: readonly string[];
}

/** The text every pairing QR code starts with. */
export const pairingQrPrefix = "halonic-pair:";

/** The longest QR text, in bytes: it fits a version 8 QR code at level M, which holds 152. */
export const pairingQrMaxBytes = 150;

/** The longest host name in a QR code, in bytes of UTF-8; a longer one is cut. */
export const pairingQrMaxHostNameBytes = 32;

/** The most endpoints in a QR code. */
export const pairingQrMaxEndpoints = 3;

const recordVersion = 1;
const keyBytes = 32;
const codeBytes = 8;
const endpointSchemes = ["https:", "wss:", "tcp:"];

/**
 * Writes a pairing QR code's text: `halonic-pair:` and base64url, without
 * padding, of a record of the version (1), the host key, the code as one
 * base-31 number in 8 bytes, the host name (a length byte, then UTF-8, cut
 * at a whole character to 32 bytes) and the endpoints (a count, then a
 * length byte and the URL of each).
 *
 * The endpoints are kept in their order, and one that would take the text
 * past {@link pairingQrMaxBytes} is left out, so the host lists the LAN
 * endpoint first. `endpoints` in the result are the ones kept. Throws a
 * `RangeError` for a key that isn't 32 bytes, a code that isn't a pairing
 * code, an endpoint without an allowed scheme, or when no endpoint fits.
 */
export function encodePairingQr(payload: PairingQrPayload): {
  readonly text: string;
  readonly endpoints: readonly string[];
} {
  if (payload.hostKey.length !== keyBytes) throw new RangeError("the host key must be 32 bytes");
  const code = requireCode(payload.code, pairingCodeLength, "pairing");
  const name = cutUtf8(payload.hostName, pairingQrMaxHostNameBytes);
  const head = [recordVersion, ...payload.hostKey, ...codeAsBytes(code), name.length, ...name];
  const kept: string[] = [];
  const urls: number[] = [];
  for (const endpoint of payload.endpoints) {
    if (!endpointSchemes.some((scheme) => endpoint.startsWith(scheme))) {
      throw new RangeError(`an endpoint must use https:, wss: or tcp:: ${endpoint}`);
    }
    const url = encodeUtf8(endpoint);
    // The head, the count byte, the endpoints kept so far and this one.
    const length = head.length + 1 + urls.length + 1 + url.length;
    if (kept.length === pairingQrMaxEndpoints || url.length > 255) continue;
    if (qrTextBytes(length) > pairingQrMaxBytes) continue;
    kept.push(endpoint);
    urls.push(url.length, ...url);
  }
  if (kept.length === 0) throw new RangeError("no endpoint fits in the QR code");
  const record = Uint8Array.from([...head, kept.length, ...urls]);
  return { text: pairingQrPrefix + encodeBase64url(record), endpoints: kept };
}

/**
 * Reads a pairing QR code's text, exactly as {@link encodePairingQr} writes
 * it. Anything else is `undefined`: another prefix, padding or a character
 * outside base64url, another version, a code past 31¹², a name that isn't
 * UTF-8 or is too long, no endpoint or more than three, an endpoint without
 * an allowed scheme, a missing or an extra byte, or a text over 150 bytes.
 */
export function decodePairingQr(text: string): PairingQrPayload | undefined {
  if (!text.startsWith(pairingQrPrefix) || text.length > pairingQrMaxBytes) return undefined;
  const record = decodeBase64url(text.slice(pairingQrPrefix.length));
  if (record === undefined) return undefined;
  const reader = new RecordReader(record);
  if (reader.byte() !== recordVersion) return undefined;
  const hostKey = reader.bytes(keyBytes);
  const code = codeFromBytes(reader.bytes(codeBytes));
  const hostName = reader.text(pairingQrMaxHostNameBytes);
  const count = reader.byte();
  if (count === undefined || count < 1 || count > pairingQrMaxEndpoints) return undefined;
  const endpoints: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const endpoint = reader.text(255);
    if (!endpointSchemes.some((scheme) => endpoint?.startsWith(scheme))) return undefined;
    endpoints.push(endpoint as string);
  }
  if (hostKey === undefined || code === undefined || hostName === undefined || !reader.done()) {
    return undefined;
  }
  return { hostKey, code, hostName, endpoints };
}

function codeAsBytes(code: string): number[] {
  let value = 0n;
  for (const symbol of code) value = value * alphabetSize + BigInt(pairingAlphabet.indexOf(symbol));
  return Array.from({ length: codeBytes }, (_, index) =>
    Number((value >> BigInt(8 * (codeBytes - 1 - index))) & 0xffn),
  );
}

function codeFromBytes(bytes: Uint8Array | undefined): string | undefined {
  if (bytes === undefined) return undefined;
  const value = readNumber(bytes);
  if (value >= alphabetSize ** BigInt(pairingCodeLength)) return undefined;
  return writeNumber(value, pairingCodeLength);
}

/** The text cut to at most `most` bytes of UTF-8, at a whole code point. */
function cutUtf8(text: string, most: number): number[] {
  let points = [...text.toWellFormed()];
  let bytes = encodeUtf8(points.join(""));
  while (bytes.length > most) {
    points = points.slice(0, -1);
    bytes = encodeUtf8(points.join(""));
  }
  return bytes;
}

/**
 * UTF-8 without `TextEncoder`, which the core doesn't have: from
 * `encodeURIComponent`, which throws on a lone surrogate.
 */
function encodeUtf8(text: string): number[] {
  const escaped = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let index = 0; index < escaped.length; index += 1) {
    if (escaped[index] === "%") {
      bytes.push(Number.parseInt(escaped.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(escaped.charCodeAt(index));
    }
  }
  return bytes;
}

/** UTF-8 to text, or `undefined` for bytes that aren't UTF-8: `decodeURIComponent` refuses them. */
function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return decodeURIComponent(
      [...bytes].map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""),
    );
  } catch {
    return undefined;
  }
}

/** The length of the QR text for a record of `length` bytes. */
function qrTextBytes(length: number): number {
  return pairingQrPrefix.length + Math.ceil((length * 4) / 3);
}

class RecordReader {
  private readonly record: Uint8Array;
  private at = 0;
  private broken = false;

  constructor(record: Uint8Array) {
    this.record = record;
  }

  byte(): number | undefined {
    return this.bytes(1)?.[0];
  }

  bytes(length: number): Uint8Array | undefined {
    if (this.broken || this.at + length > this.record.length) {
      this.broken = true;
      return undefined;
    }
    this.at += length;
    return this.record.slice(this.at - length, this.at);
  }

  /** A length byte, then that many bytes of UTF-8, at most `most`. */
  text(most: number): string | undefined {
    const length = this.byte();
    if (length === undefined || length > most) {
      this.broken = true;
      return undefined;
    }
    const bytes = this.bytes(length);
    const text = bytes === undefined ? undefined : decodeUtf8(bytes);
    if (text === undefined) this.broken = true;
    return text;
  }

  done(): boolean {
    return !this.broken && this.at === this.record.length;
  }
}

const base64urlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeBase64url(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = [bytes[index], bytes[index + 1], bytes[index + 2]];
    const bits = ((chunk[0] ?? 0) << 16) | ((chunk[1] ?? 0) << 8) | (chunk[2] ?? 0);
    const count = chunk.filter((byte) => byte !== undefined).length + 1;
    for (let place = 0; place < count; place += 1) {
      text += base64urlAlphabet.charAt((bits >> (18 - 6 * place)) & 63);
    }
  }
  return text;
}

/** Strict: base64url characters only, no padding, and only the one text that writes these bytes. */
function decodeBase64url(text: string): Uint8Array | undefined {
  if (text.length % 4 === 1) return undefined;
  const values = [...text].map((character) => base64urlAlphabet.indexOf(character));
  if (values.some((value) => value < 0)) return undefined;
  const bytes: number[] = [];
  for (let index = 0; index < values.length; index += 4) {
    const group = values.slice(index, index + 4);
    const bits = group.reduce((sum, value, place) => sum | (value << (18 - 6 * place)), 0);
    for (let place = 0; place < group.length - 1; place += 1) {
      bytes.push((bits >> (16 - 8 * place)) & 255);
    }
  }
  const decoded = Uint8Array.from(bytes);
  return encodeBase64url(decoded) === text ? decoded : undefined;
}
