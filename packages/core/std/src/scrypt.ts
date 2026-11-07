// scrypt as specified in RFC 7914: PBKDF2 spreads the password over p blocks,
// ROMix makes each block memory-hard, and PBKDF2 condenses the result. One
// in-house implementation runs on every target, Workers too (multi-cloud ADR
// section 8).
import { pbkdf2Sha256 } from "./pbkdf2.ts";
import { allocateMixBuffers, roMix } from "./scrypt-mix.ts";
import { encodeUtf8 } from "./utf8.ts";
import { wordAt } from "./words.ts";

/** The settings of one scrypt hash. */
export interface ScryptSettings {
  /** N, the CPU and memory cost: a power of two greater than 1. */
  readonly cost: number;
  /** r, the block size: 1 or more. Each block is 128 x r bytes. */
  readonly blockSize: number;
  /** p, how many blocks are mixed independently: 1 or more. */
  readonly parallelization: number;
  /** How many bytes to derive: 1 or more. */
  readonly keyLength: number;
  /**
   * The most memory the mixing may use, in bytes (default 32 MiB, as in
   * Node). Settings that need more are refused, so a stored hash with huge
   * settings can't exhaust a Worker.
   */
  readonly maxMemoryBytes?: number;
}

/** The default memory limit: 32 MiB, the same as `node:crypto`. */
const defaultMaxMemoryBytes = 32 * 1024 * 1024;

/**
 * Derives a key from a password with scrypt. With the settings from the
 * multi-cloud ADR (`cost` 2^14, `blockSize` 8, `parallelization` 5) it uses
 * 16 MiB and is meant for password hashes.
 *
 * @param password - the password, as bytes or as text (UTF-8)
 * @param salt - the salt, as bytes or as text (UTF-8)
 * @param settings - N, r, p, the key length and the memory limit
 * @returns the derived key, `keyLength` bytes long
 * @throws RangeError when a setting is out of range or the memory limit is too low
 *
 * @example
 * const key = scrypt("correct horse battery staple", salt, {
 *   cost: 2 ** 14,
 *   blockSize: 8,
 *   parallelization: 5,
 *   keyLength: 32,
 * });
 */
export function scrypt(
  password: Uint8Array | string,
  salt: Uint8Array | string,
  settings: ScryptSettings,
): Uint8Array {
  checkSettings(settings);
  const { cost, blockSize, parallelization, keyLength } = settings;
  const passwordBytes = typeof password === "string" ? encodeUtf8(password) : password;
  const saltBytes = typeof salt === "string" ? encodeUtf8(salt) : salt;

  const blockBytes = 128 * blockSize;
  const blocks = pbkdf2Sha256(passwordBytes, saltBytes, 1, parallelization * blockBytes);
  const words = new Uint32Array(blockBytes / 4);
  const buffers = allocateMixBuffers(cost, blockSize);
  for (let index = 0; index < parallelization; index++) {
    const block = blocks.subarray(index * blockBytes, (index + 1) * blockBytes);
    readLittleEndian(block, words);
    roMix(words, buffers, cost, blockSize);
    writeLittleEndian(words, block);
  }
  return pbkdf2Sha256(passwordBytes, blocks, 1, keyLength);
}

function checkSettings(settings: ScryptSettings): void {
  const { cost, blockSize, parallelization, keyLength } = settings;
  const maxMemoryBytes = settings.maxMemoryBytes ?? defaultMaxMemoryBytes;
  if (!Number.isInteger(cost) || cost < 2 || (cost & (cost - 1)) !== 0 || cost > 2 ** 30) {
    throw new RangeError(`scrypt cost (N) must be a power of two from 2 to 2^30, got ${cost}.`);
  }
  if (!Number.isInteger(blockSize) || blockSize < 1) {
    throw new RangeError(
      `scrypt blockSize (r) must be a whole number of 1 or more, got ${blockSize}.`,
    );
  }
  if (!Number.isInteger(parallelization) || parallelization < 1) {
    throw new RangeError(
      `scrypt parallelization (p) must be a whole number of 1 or more, got ${parallelization}.`,
    );
  }
  if (blockSize * parallelization >= 2 ** 30) {
    throw new RangeError(
      `scrypt blockSize x parallelization must be below 2^30 (RFC 7914), got ${blockSize * parallelization}.`,
    );
  }
  if (Math.log2(cost) >= 16 * blockSize) {
    throw new RangeError(
      `scrypt cost (N) must be below 2^(16 x blockSize) (RFC 7914), got N = ${cost} with r = ${blockSize}.`,
    );
  }
  if (!Number.isInteger(keyLength) || keyLength < 1) {
    throw new RangeError(`scrypt keyLength must be a whole number of 1 or more, got ${keyLength}.`);
  }
  const neededBytes = 128 * blockSize * cost;
  if (neededBytes > maxMemoryBytes) {
    throw new RangeError(
      `scrypt needs ${neededBytes} bytes for N = ${cost} and r = ${blockSize}, more than the limit of ${maxMemoryBytes} (maxMemoryBytes).`,
    );
  }
}

/** scrypt reads its blocks as little-endian words, whatever the machine's byte order. */
function readLittleEndian(bytes: Uint8Array, words: Uint32Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < words.length; index++) {
    words[index] = view.getUint32(index * 4, true);
  }
}

function writeLittleEndian(words: Uint32Array, bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < words.length; index++) {
    view.setUint32(index * 4, wordAt(words, index), true);
  }
}
