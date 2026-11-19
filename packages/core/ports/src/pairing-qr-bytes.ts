/**
 * The byte helpers of the pairing QR record (see `pairing-codes.ts`): UTF-8,
 * a strict record reader and base64url without padding, none of which the
 * core has built in.
 */

/** The text cut to at most `most` bytes of UTF-8, at a whole code point. */
export function cutUtf8(text: string, most: number): number[] {
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
export function encodeUtf8(text: string): number[] {
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
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return decodeURIComponent(
      [...bytes].map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""),
    );
  } catch {
    return undefined;
  }
}

export class RecordReader {
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

  /** Where the next byte is read from. */
  get offset(): number {
    return this.at;
  }

  /** The bytes read since `start`. */
  since(start: number): Uint8Array {
    return this.record.slice(start, this.at);
  }

  done(): boolean {
    return !this.broken && this.at === this.record.length;
  }
}

const base64urlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeBase64url(bytes: Uint8Array): string {
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
export function decodeBase64url(text: string): Uint8Array | undefined {
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
