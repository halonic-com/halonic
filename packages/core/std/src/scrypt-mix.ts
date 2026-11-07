// The memory-hard core of scrypt: ROMix, BlockMix and Salsa20/8 (RFC 7914,
// sections 3 to 5). This is the hot loop of every password check, so it works
// in place on buffers allocated once per hash and never allocates inside the
// loops: with the ADR settings it runs Salsa20/8 about 2.6 million times.
import { wordAt } from "./words.ts";

/** The buffers one scrypt hash reuses for every block it mixes. */
export interface MixBuffers {
  /** N copies of the block: the memory that makes scrypt memory-hard. */
  readonly table: Uint32Array;
  /** One block, where BlockMix collects its output. */
  readonly scratch: Uint32Array;
  /** 16 words, the running Salsa20/8 state inside BlockMix. */
  readonly mixer: Uint32Array;
}

/**
 * Allocates the buffers for blocks of 128 × `blockSize` bytes and `cost` table rows.
 *
 * @param cost - N
 * @param blockSize - r
 */
export function allocateMixBuffers(cost: number, blockSize: number): MixBuffers {
  const blockWords = 32 * blockSize;
  return {
    table: new Uint32Array(cost * blockWords),
    scratch: new Uint32Array(blockWords),
    mixer: new Uint32Array(16),
  };
}

/**
 * scryptROMix (RFC 7914, section 5) on one block of little-endian words, in place.
 *
 * @param block - 32 × `blockSize` words
 * @param buffers - from `allocateMixBuffers` with the same cost and block size
 * @param cost - N, a power of two
 * @param blockSize - r
 */
export function roMix(
  block: Uint32Array,
  buffers: MixBuffers,
  cost: number,
  blockSize: number,
): void {
  const { table } = buffers;
  const blockWords = block.length;
  // Fill the table with N successive mixes of the block.
  for (let row = 0; row < cost; row++) {
    table.set(block, row * blockWords);
    blockMix(block, buffers, blockSize);
  }
  // Read it back in an order that depends on the data, so all of it must stay in memory.
  const lastChunkStart = (2 * blockSize - 1) * 16;
  for (let step = 0; step < cost; step++) {
    // Integerify: the first word of the last chunk. N is at most 2^30, so 32 bits are enough.
    const rowStart = (wordAt(block, lastChunkStart) & (cost - 1)) * blockWords;
    for (let word = 0; word < blockWords; word++) {
      block[word] = wordAt(block, word) ^ wordAt(table, rowStart + word);
    }
    blockMix(block, buffers, blockSize);
  }
}

/** scryptBlockMix (RFC 7914, section 4) on one block, in place. */
function blockMix(block: Uint32Array, buffers: MixBuffers, blockSize: number): void {
  const { scratch, mixer } = buffers;
  const chunkCount = 2 * blockSize;
  const lastChunkStart = (chunkCount - 1) * 16;
  for (let word = 0; word < 16; word++) {
    mixer[word] = wordAt(block, lastChunkStart + word);
  }
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const chunkStart = chunk * 16;
    for (let word = 0; word < 16; word++) {
      mixer[word] = wordAt(mixer, word) ^ wordAt(block, chunkStart + word);
    }
    salsa20Core8(mixer);
    // Even chunks go to the first half of the output, odd chunks to the second.
    const outputChunk = chunk % 2 === 0 ? chunk / 2 : blockSize + (chunk - 1) / 2;
    scratch.set(mixer, outputChunk * 16);
  }
  block.set(scratch);
}

/**
 * The Salsa20/8 core (RFC 7914, section 3) on 16 words, in place. The state
 * lives in 16 local variables so the loop never touches memory; the lines
 * follow the RFC's reference code one for one.
 */
function salsa20Core8(words: Uint32Array): void {
  let x0 = wordAt(words, 0);
  let x1 = wordAt(words, 1);
  let x2 = wordAt(words, 2);
  let x3 = wordAt(words, 3);
  let x4 = wordAt(words, 4);
  let x5 = wordAt(words, 5);
  let x6 = wordAt(words, 6);
  let x7 = wordAt(words, 7);
  let x8 = wordAt(words, 8);
  let x9 = wordAt(words, 9);
  let x10 = wordAt(words, 10);
  let x11 = wordAt(words, 11);
  let x12 = wordAt(words, 12);
  let x13 = wordAt(words, 13);
  let x14 = wordAt(words, 14);
  let x15 = wordAt(words, 15);
  for (let doubleRound = 0; doubleRound < 4; doubleRound++) {
    // Columns.
    x4 ^= rotateLeft(x0 + x12, 7);
    x8 ^= rotateLeft(x4 + x0, 9);
    x12 ^= rotateLeft(x8 + x4, 13);
    x0 ^= rotateLeft(x12 + x8, 18);
    x9 ^= rotateLeft(x5 + x1, 7);
    x13 ^= rotateLeft(x9 + x5, 9);
    x1 ^= rotateLeft(x13 + x9, 13);
    x5 ^= rotateLeft(x1 + x13, 18);
    x14 ^= rotateLeft(x10 + x6, 7);
    x2 ^= rotateLeft(x14 + x10, 9);
    x6 ^= rotateLeft(x2 + x14, 13);
    x10 ^= rotateLeft(x6 + x2, 18);
    x3 ^= rotateLeft(x15 + x11, 7);
    x7 ^= rotateLeft(x3 + x15, 9);
    x11 ^= rotateLeft(x7 + x3, 13);
    x15 ^= rotateLeft(x11 + x7, 18);
    // Rows.
    x1 ^= rotateLeft(x0 + x3, 7);
    x2 ^= rotateLeft(x1 + x0, 9);
    x3 ^= rotateLeft(x2 + x1, 13);
    x0 ^= rotateLeft(x3 + x2, 18);
    x6 ^= rotateLeft(x5 + x4, 7);
    x7 ^= rotateLeft(x6 + x5, 9);
    x4 ^= rotateLeft(x7 + x6, 13);
    x5 ^= rotateLeft(x4 + x7, 18);
    x11 ^= rotateLeft(x10 + x9, 7);
    x8 ^= rotateLeft(x11 + x10, 9);
    x9 ^= rotateLeft(x8 + x11, 13);
    x10 ^= rotateLeft(x9 + x8, 18);
    x12 ^= rotateLeft(x15 + x14, 7);
    x13 ^= rotateLeft(x12 + x15, 9);
    x14 ^= rotateLeft(x13 + x12, 13);
    x15 ^= rotateLeft(x14 + x13, 18);
  }
  // Uint32Array stores each sum modulo 2^32, as the RFC asks.
  words[0] = wordAt(words, 0) + x0;
  words[1] = wordAt(words, 1) + x1;
  words[2] = wordAt(words, 2) + x2;
  words[3] = wordAt(words, 3) + x3;
  words[4] = wordAt(words, 4) + x4;
  words[5] = wordAt(words, 5) + x5;
  words[6] = wordAt(words, 6) + x6;
  words[7] = wordAt(words, 7) + x7;
  words[8] = wordAt(words, 8) + x8;
  words[9] = wordAt(words, 9) + x9;
  words[10] = wordAt(words, 10) + x10;
  words[11] = wordAt(words, 11) + x11;
  words[12] = wordAt(words, 12) + x12;
  words[13] = wordAt(words, 13) + x13;
  words[14] = wordAt(words, 14) + x14;
  words[15] = wordAt(words, 15) + x15;
}

function rotateLeft(word: number, bits: number): number {
  return (word << bits) | (word >>> (32 - bits));
}
