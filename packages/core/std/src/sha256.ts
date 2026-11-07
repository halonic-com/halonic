// SHA-256 as specified in FIPS 180-4, section 6.2. The core can't reach
// crypto.subtle, and it would make hashing async, so it is written here.
import { bytesToHex } from "./hex.ts";
import { encodeUtf8 } from "./utf8.ts";
import { wordAt } from "./words.ts";

/** The block size of SHA-256 in bytes. HMAC needs it too. */
export const sha256BlockBytes = 64;

/** The length of a SHA-256 digest in bytes. */
export const sha256DigestBytes = 32;

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const roundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The first 32 bits of the fractional parts of the square roots of the first 8 primes. */
const initialState = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/**
 * Hashes bytes with SHA-256.
 *
 * @param data - the bytes to hash, or text, which is hashed as UTF-8
 * @returns the 32-byte digest
 *
 * @example
 * bytesToHex(sha256("abc")); // "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
 */
export function sha256(data: Uint8Array | string): Uint8Array {
  const message = typeof data === "string" ? encodeUtf8(data) : data;
  const state = Uint32Array.from(initialState);
  const schedule = new Uint32Array(64);
  const padded = pad(message);
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += sha256BlockBytes) {
    compressBlock(state, schedule, view, offset);
  }
  const digest = new Uint8Array(sha256DigestBytes);
  const digestView = new DataView(digest.buffer);
  for (let word = 0; word < 8; word++) {
    digestView.setUint32(word * 4, wordAt(state, word));
  }
  return digest;
}

/**
 * Hashes bytes with SHA-256 and writes the digest as lowercase hex.
 *
 * @param data - the bytes to hash, or text, which is hashed as UTF-8
 * @returns 64 hex characters
 *
 * @example
 * sha256Hex(""); // "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
 */
export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256(data));
}

/**
 * The message, a 1 bit, zeros, and the message length in bits as a 64-bit
 * big-endian number, so the total is a whole number of blocks (FIPS 180-4, 5.1.1).
 */
function pad(message: Uint8Array): Uint8Array {
  const lengthFieldBytes = 8;
  const blockCount = Math.ceil((message.length + 1 + lengthFieldBytes) / sha256BlockBytes);
  const padded = new Uint8Array(blockCount * sha256BlockBytes);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = message.length * 8;
  // Two 32-bit halves, because bitwise operators work on 32 bits only.
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  return padded;
}

/** Mixes one 64-byte block into `state` (FIPS 180-4, 6.2.2). */
function compressBlock(
  state: Uint32Array,
  schedule: Uint32Array,
  block: DataView,
  offset: number,
): void {
  for (let round = 0; round < 16; round++) {
    schedule[round] = block.getUint32(offset + round * 4);
  }
  for (let round = 16; round < 64; round++) {
    const before15 = wordAt(schedule, round - 15);
    const before2 = wordAt(schedule, round - 2);
    const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
    const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
    schedule[round] = wordAt(schedule, round - 16) + sigma0 + wordAt(schedule, round - 7) + sigma1;
  }

  let a = wordAt(state, 0);
  let b = wordAt(state, 1);
  let c = wordAt(state, 2);
  let d = wordAt(state, 3);
  let e = wordAt(state, 4);
  let f = wordAt(state, 5);
  let g = wordAt(state, 6);
  let h = wordAt(state, 7);
  for (let round = 0; round < 64; round++) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choose = (e & f) ^ (~e & g);
    const temp1 =
      (h + sum1 + choose + wordAt(roundConstants, round) + wordAt(schedule, round)) >>> 0;
    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (sum0 + majority) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }

  // Uint32Array stores each sum modulo 2^32, as the standard asks.
  state[0] = wordAt(state, 0) + a;
  state[1] = wordAt(state, 1) + b;
  state[2] = wordAt(state, 2) + c;
  state[3] = wordAt(state, 3) + d;
  state[4] = wordAt(state, 4) + e;
  state[5] = wordAt(state, 5) + f;
  state[6] = wordAt(state, 6) + g;
  state[7] = wordAt(state, 7) + h;
}

function rotateRight(word: number, bits: number): number {
  return (word >>> bits) | (word << (32 - bits));
}
