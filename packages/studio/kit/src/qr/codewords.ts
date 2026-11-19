/*
 * QR Code generator library (TypeScript)
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 * - The above copyright notice and this permission notice shall be included in
 *   all copies or substantial portions of the Software.
 * - The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability,
 *   fitness for a particular purpose and noninfringement. In no event shall the
 *   authors or copyright holders be liable for any claim, damages or other
 *   liability, whether in an action of contract, tort or otherwise, arising from,
 *   out of or in connection with the Software or the use or other dealings in the
 *   Software.
 *
 * SPDX-License-Identifier: MIT
 *
 * Vendored from https://github.com/nayuki/QR-Code-generator, file
 * typescript-javascript/qrcodegen.ts at commit bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d,
 * trimmed to byte mode (HAL-12239, decision 15 of HAL-12232). This file holds the error
 * correction levels, the capacity tables and Reed-Solomon; qr-code.ts holds the symbol and
 * lists every change from upstream.
 */

/*---- Public helper enumeration ----*/

/*
 * The error correction level in a QR Code symbol. Immutable.
 */
export class Ecc {
  /*-- Constants --*/

  public static readonly LOW = new Ecc(0, 1); // The QR Code can tolerate about  7% erroneous codewords
  public static readonly MEDIUM = new Ecc(1, 0); // The QR Code can tolerate about 15% erroneous codewords
  public static readonly QUARTILE = new Ecc(2, 3); // The QR Code can tolerate about 25% erroneous codewords
  public static readonly HIGH = new Ecc(3, 2); // The QR Code can tolerate about 30% erroneous codewords

  /*-- Constructor and fields --*/

  // In the range 0 to 3 (unsigned 2-bit integer).
  public readonly ordinal: number;
  // (Package-private) In the range 0 to 3 (unsigned 2-bit integer).
  public readonly formatBits: number;

  private constructor(ordinal: number, formatBits: number) {
    this.ordinal = ordinal;
    this.formatBits = formatBits;
  }
}

/*-- Constants and tables --*/

// The minimum version number supported in the QR Code Model 2 standard.
export const MIN_VERSION = 1;
// The maximum version number supported in the QR Code Model 2 standard.
export const MAX_VERSION = 40;

// biome-ignore format: the upstream table layout, one row per error correction level.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  //0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],  // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // High
];

// biome-ignore format: the upstream table layout, one row per error correction level.
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  //0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],  // Low
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],  // Medium
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],  // Quartile
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],  // High
];

// One cell of the tables above. (Halonic: replaces the direct [ecl.ordinal][ver] lookups.)
function tableValue(table: readonly (readonly number[])[], ecl: Ecc, ver: number): number {
  const value = table[ecl.ordinal]?.[ver];
  if (value === undefined || value < 0) throw new RangeError("Version number out of range");
  return value;
}

/*-- Capacity --*/

// Returns the number of data bits that can be stored in a QR Code of the given version number, after
// all function modules are excluded. This includes remainder bits, so it might not be a multiple of 8.
// The result is in the range [208, 29648]. This could be implemented as a 40-entry lookup table.
export function getNumRawDataModules(ver: number): number {
  if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError("Version number out of range");
  let result: number = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign: number = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  assert(208 <= result && result <= 29648);
  return result;
}

// Returns the number of 8-bit data (i.e. not error correction) codewords contained in any
// QR Code of the given version number and error correction level, with remainder bits discarded.
// This stateless pure function could be implemented as a (40*4)-cell lookup table.
export function getNumDataCodewords(ver: number, ecl: Ecc): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    tableValue(ECC_CODEWORDS_PER_BLOCK, ecl, ver) *
      tableValue(NUM_ERROR_CORRECTION_BLOCKS, ecl, ver)
  );
}

/*-- Error correction --*/

// Returns a new byte string representing the given data with the appropriate error correction
// codewords appended to it, based on the given version and error correction level.
export function addEccAndInterleave(data: readonly number[], ver: number, ecl: Ecc): number[] {
  if (data.length !== getNumDataCodewords(ver, ecl)) throw new RangeError("Invalid argument");

  // Calculate parameter numbers
  const numBlocks: number = tableValue(NUM_ERROR_CORRECTION_BLOCKS, ecl, ver);
  const blockEccLen: number = tableValue(ECC_CODEWORDS_PER_BLOCK, ecl, ver);
  const rawCodewords: number = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks: number = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen: number = Math.floor(rawCodewords / numBlocks);

  // Split data into blocks and append ECC to each block
  const blocks: number[][] = [];
  const rsDiv: number[] = reedSolomonComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat: number[] = data.slice(
      k,
      k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1),
    );
    k += dat.length;
    const ecc: number[] = reedSolomonComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  // Interleave (not concatenate) the bytes from every block into a single sequence
  const result: number[] = [];
  const blockLen = blocks[0]?.length ?? 0;
  for (let i = 0; i < blockLen; i++) {
    blocks.forEach((block, j) => {
      // Skip the padding byte in short blocks
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i] ?? 0);
    });
  }
  assert(result.length === rawCodewords);
  return result;
}

// Returns a Reed-Solomon ECC generator polynomial for the given degree. This could be
// implemented as a lookup table over all possible parameter values, instead of as an algorithm.
function reedSolomonComputeDivisor(degree: number): number[] {
  if (degree < 1 || degree > 255) throw new RangeError("Degree out of range");
  // Polynomial coefficients are stored from highest to lowest power, excluding the leading term which is always 1.
  // For example the polynomial x^3 + 255x^2 + 8x + 93 is stored as the uint8 array [255, 8, 93].
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1); // Start off with the monomial x^0

  // Compute the product polynomial (x - r^0) * (x - r^1) * (x - r^2) * ... * (x - r^{degree-1}),
  // and drop the highest monomial term which is always 1x^degree.
  // Note that r = 0x02, which is a generator element of this field GF(2^8/0x11D).
  let root = 1;
  for (let i = 0; i < degree; i++) {
    // Multiply the current product by (x - r^i)
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j] ?? 0, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

// Returns the Reed-Solomon error correction codeword for the given data and divisor polynomials.
function reedSolomonComputeRemainder(
  data: readonly number[],
  divisor: readonly number[],
): number[] {
  const result: number[] = divisor.map((_) => 0);
  for (const b of data) {
    // Polynomial division
    const factor: number = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

// Returns the product of the two given field elements modulo GF(2^8/0x11D). The arguments and result
// are unsigned 8-bit integers. This could be implemented as a lookup table of 256*256 entries of uint8.
function reedSolomonMultiply(x: number, y: number): number {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError("Byte out of range");
  // Russian peasant multiplication
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  assert(z >>> 8 === 0);
  return z;
}

/*-- Helper functions --*/

// Appends the given number of low-order bits of the given value
// to the given buffer. Requires 0 <= len <= 31 and 0 <= val < 2^len.
export function appendBits(val: number, len: number, bb: number[]): void {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError("Value out of range");
  // Append bit by bit
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

// Returns true iff the i'th bit of x is set to 1.
export function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

// Throws an exception if the given condition is false.
export function assert(cond: boolean): void {
  if (!cond) throw new Error("Assertion error");
}
