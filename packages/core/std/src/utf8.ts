// The core has no TextEncoder or TextDecoder (they come from the DOM and Node
// type libraries, which the core doesn't load), so UTF-8 is written here. Both
// directions follow the WHATWG Encoding Standard, so they give exactly the same
// bytes and text as TextEncoder and TextDecoder.

/** U+FFFD, written in place of anything that isn't valid. */
const replacementCharacter = 0xfffd;

/**
 * Encodes text as UTF-8. A lone surrogate, which has no UTF-8 form, becomes
 * U+FFFD, as `TextEncoder` does.
 *
 * @param text - the text to encode
 * @returns the UTF-8 bytes
 *
 * @example
 * encodeUtf8("é"); // Uint8Array [0xc3, 0xa9]
 */
export function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of text) {
    // for…of walks code points, so a valid surrogate pair arrives as one.
    let codePoint = character.codePointAt(0) ?? replacementCharacter;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      codePoint = replacementCharacter;
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Decodes UTF-8 bytes as text. Each invalid sequence becomes one U+FFFD, the
 * same way `TextDecoder` does it. A byte order mark at the start is dropped,
 * as `TextDecoder` drops it by default.
 *
 * @param bytes - the bytes to decode
 * @returns the text
 *
 * @example
 * decodeUtf8(new Uint8Array([0xc3, 0xa9])); // "é"
 */
export function decodeUtf8(bytes: Uint8Array): string {
  const codePoints: number[] = [];
  let index = startsWithByteOrderMark(bytes) ? 3 : 0;
  while (index < bytes.length) {
    const sequence = readSequence(bytes, index);
    codePoints.push(sequence.codePoint);
    index += sequence.length;
  }
  let text = "";
  // In chunks, because String.fromCodePoint takes its arguments on the stack.
  const chunkSize = 8192;
  for (let start = 0; start < codePoints.length; start += chunkSize) {
    text += String.fromCodePoint(...codePoints.slice(start, start + chunkSize));
  }
  return text;
}

function startsWithByteOrderMark(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

interface Sequence {
  readonly codePoint: number;
  /** How many bytes were used: the whole sequence, or the invalid part of it. */
  readonly length: number;
}

/** Reads the sequence that starts at `start`, following the WHATWG UTF-8 decoder. */
function readSequence(bytes: Uint8Array, start: number): Sequence {
  const lead = bytes[start] ?? 0;
  if (lead < 0x80) {
    return { codePoint: lead, length: 1 };
  }
  const shape = sequenceShape(lead);
  if (shape === undefined) {
    return { codePoint: replacementCharacter, length: 1 };
  }
  let codePoint = lead & shape.leadMask;
  let lower = shape.secondLower;
  let upper = shape.secondUpper;
  for (let offset = 1; offset < shape.length; offset++) {
    const next = bytes[start + offset];
    if (next === undefined || next < lower || next > upper) {
      // The bytes read so far are one invalid sequence; `next` starts a new one.
      return { codePoint: replacementCharacter, length: offset };
    }
    codePoint = (codePoint << 6) | (next & 0x3f);
    lower = 0x80;
    upper = 0xbf;
  }
  return { codePoint, length: shape.length };
}

interface SequenceShape {
  readonly length: number;
  readonly leadMask: number;
  /** The allowed range of the second byte; the ranges rule out overlong forms and surrogates. */
  readonly secondLower: number;
  readonly secondUpper: number;
}

function sequenceShape(lead: number): SequenceShape | undefined {
  if (lead >= 0xc2 && lead <= 0xdf) {
    return { length: 2, leadMask: 0x1f, secondLower: 0x80, secondUpper: 0xbf };
  }
  if (lead >= 0xe0 && lead <= 0xef) {
    const secondLower = lead === 0xe0 ? 0xa0 : 0x80;
    const secondUpper = lead === 0xed ? 0x9f : 0xbf;
    return { length: 3, leadMask: 0x0f, secondLower, secondUpper };
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    const secondLower = lead === 0xf0 ? 0x90 : 0x80;
    const secondUpper = lead === 0xf4 ? 0x8f : 0xbf;
    return { length: 4, leadMask: 0x07, secondLower, secondUpper };
  }
  return undefined;
}
