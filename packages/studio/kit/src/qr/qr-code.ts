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
 * trimmed to byte mode (HAL-12239, decision 15 of HAL-12232). Julian reviews it against
 * upstream on HAL-12263. Changes from upstream, none of which changes a module of the output:
 * - Byte mode only. QrSegment, encodeText, encodeSegments and the numeric, alphanumeric, kanji
 *   and ECI modes are gone; encodeBinary takes encodeSegments' optional parameters and builds
 *   the one byte segment itself (mode 0x4, character count bits 8/16/16).
 * - An ES module instead of a namespace, in three files: codewords.ts holds Ecc, the tables,
 *   the capacity functions, addEccAndInterleave and Reed-Solomon, and penalty.ts the mask
 *   penalty score (all private statics and methods of QrCode before).
 * - The grids are flat Uint8Arrays (y * size + x) instead of nested boolean arrays, and the
 *   tables are read through a checked lookup, for the repo's strict index checks.
 * - Long functions are split for the repo's complexity limit: the mask choice (chooseMask), the
 *   column pairs of the zigzag scan (drawColumnPair), the mask formulas (maskInverts) and the
 *   penalty parts (linePenalty, used for rows and columns alike, blockPenalty, balancePenalty).
 *   The penalty sums row i and column i together; the total is the same.
 * - `==` became `===`, `let` became `const` where nothing reassigns, and the formatting is ours.
 */

import {
  addEccAndInterleave,
  appendBits,
  assert,
  Ecc,
  getBit,
  getNumDataCodewords,
  getNumRawDataModules,
  MAX_VERSION,
  MIN_VERSION,
} from "./codewords.ts";
import { getPenaltyScore } from "./penalty.ts";

export { Ecc };

// Byte mode: the mode indicator, and the character count bits for versions 1-9, 10-26 and 27-40.
const BYTE_MODE_BITS = 0x4;
const BYTE_CHAR_COUNT_BITS: readonly [number, number, number] = [8, 16, 16];

// Returns the bit width of the character count field for a byte mode segment
// at the given version number. The result is 8 or 16.
function numCharCountBits(ver: number): number {
  return BYTE_CHAR_COUNT_BITS[Math.floor((ver + 7) / 17)] ?? 16;
}

// The number of bits needed to encode a byte segment of the given length at the given version.
// The result is infinity if the segment has too many bytes to fit its length field.
function getTotalBits(numBytes: number, version: number): number {
  const ccbits: number = numCharCountBits(version);
  if (numBytes >= 1 << ccbits) return Number.POSITIVE_INFINITY; // The segment's length doesn't fit the field's bit width
  return 4 + ccbits + numBytes * 8;
}

/*---- QR Code symbol class ----*/

/*
 * A QR Code symbol, which is a type of two-dimension barcode.
 * Invented by Denso Wave and described in the ISO/IEC 18004 standard.
 * Instances of this class represent an immutable square grid of dark and light cells.
 * This trimmed copy creates a QR Code from binary data in byte mode only, covering all
 * versions (sizes) from 1 to 40 and all 4 error correction levels.
 */
export class QrCode {
  /*-- Static factory function --*/

  // Returns a QR Code representing the given binary data at the given error correction level.
  // This function always encodes using the binary segment mode. The maximum number of bytes allowed
  // is 2953. The smallest possible QR Code version within the given range is automatically chosen
  // for the output. Iff boostEcl is true, then the ECC level of the result may be higher than the
  // ecl argument if it can be done without increasing the version. The mask number is either
  // between 0 to 7 (inclusive) to force that mask, or -1 to automatically choose an appropriate mask.
  public static encodeBinary(
    data: Readonly<ArrayLike<number>>,
    ecl: Ecc,
    minVersion = 1,
    maxVersion = 40,
    mask = -1,
    boostEcl = true,
  ): QrCode {
    if (
      !(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) ||
      mask < -1 ||
      mask > 7
    )
      throw new RangeError("Invalid value");

    // Find the minimal version number to use
    let version: number;
    let dataUsedBits: number;
    for (version = minVersion; ; version++) {
      const dataCapacityBits: number = getNumDataCodewords(version, ecl) * 8; // Number of data bits available
      const usedBits: number = getTotalBits(data.length, version);
      if (usedBits <= dataCapacityBits) {
        dataUsedBits = usedBits;
        break; // This version number is found to be suitable
      }
      if (version >= maxVersion)
        // All versions in the range could not fit the given data
        throw new RangeError("Data too long");
    }

    // Increase the error correction level while the data still fits in the current version number
    for (const newEcl of [Ecc.MEDIUM, Ecc.QUARTILE, Ecc.HIGH]) {
      // From low to high
      if (boostEcl && dataUsedBits <= getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
    }

    // Create the QR Code object
    return new QrCode(version, ecl, makeDataCodewords(data, version, ecl, dataUsedBits), mask);
  }

  /*-- Fields --*/

  // The version number of this QR Code, which is between 1 and 40 (inclusive).
  // This determines the size of this barcode.
  public readonly version: number;

  // The error correction level used in this QR Code.
  public readonly errorCorrectionLevel: Ecc;

  // The width and height of this QR Code, measured in modules, between
  // 21 and 177 (inclusive). This is equal to version * 4 + 17.
  public readonly size: number;

  // The index of the mask pattern used in this QR Code, which is between 0 and 7 (inclusive).
  // Even if a QR Code is created with automatic masking requested (mask = -1),
  // the resulting object still has a mask value between 0 and 7.
  public readonly mask: number;

  // The modules of this QR Code (0 = light, 1 = dark), row by row.
  // Immutable after constructor finishes. Accessed through getModule().
  private readonly modules: Uint8Array;

  // Indicates function modules that are not subjected to masking. Discarded when constructor finishes.
  private isFunction: Uint8Array;

  /*-- Constructor (low level) --*/

  // Creates a new QR Code with the given version number,
  // error correction level, data codeword bytes, and mask number.
  // This is a low-level API that most users should not use directly.
  // The high-level API is the encodeBinary() function.
  public constructor(
    version: number,
    errorCorrectionLevel: Ecc,
    dataCodewords: readonly number[],
    msk: number,
  ) {
    // Check scalar arguments
    if (version < MIN_VERSION || version > MAX_VERSION)
      throw new RangeError("Version value out of range");
    if (msk < -1 || msk > 7) throw new RangeError("Mask value out of range");
    this.version = version;
    this.errorCorrectionLevel = errorCorrectionLevel;
    this.size = version * 4 + 17;

    // Initialize both grids to be size*size arrays of light
    this.modules = new Uint8Array(this.size * this.size);
    this.isFunction = new Uint8Array(this.size * this.size);

    // Compute ECC, draw modules
    this.drawFunctionPatterns();
    const allCodewords: number[] = addEccAndInterleave(
      dataCodewords,
      version,
      errorCorrectionLevel,
    );
    this.drawCodewords(allCodewords);

    // Do masking
    if (msk === -1) msk = this.chooseMask(); // Automatically choose best mask
    assert(0 <= msk && msk <= 7);
    this.mask = msk;
    this.applyMask(msk); // Apply the final choice of mask
    this.drawFormatBits(msk); // Overwrite old format bits

    this.isFunction = new Uint8Array(0);
  }

  /*-- Accessor methods --*/

  // Returns the color of the module (pixel) at the given coordinates, which is false
  // for light or true for dark. The top left corner has the coordinates (x=0, y=0).
  // If the given coordinates are out of bounds, then false (light) is returned.
  public getModule(x: number, y: number): boolean {
    return 0 <= x && x < this.size && 0 <= y && y < this.size && this.get(x, y);
  }

  // The module at in-bounds coordinates. (Halonic: replaces this.modules[y][x].)
  private get(x: number, y: number): boolean {
    return this.modules[y * this.size + x] === 1;
  }

  /*-- Private helper methods for constructor: Drawing function modules --*/

  // Reads this object's version field, and draws and marks all function modules.
  private drawFunctionPatterns(): void {
    // Draw horizontal and vertical timing patterns
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }

    // Draw 3 finder patterns (all corners except bottom right; overwrites some timing modules)
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    // Draw numerous alignment patterns
    const alignPatPos: number[] = this.getAlignmentPatternPositions();
    const numAlign: number = alignPatPos.length;
    alignPatPos.forEach((x, i) => {
      alignPatPos.forEach((y, j) => {
        // Don't draw on the three finder corners
        if (
          !(
            (i === 0 && j === 0) ||
            (i === 0 && j === numAlign - 1) ||
            (i === numAlign - 1 && j === 0)
          )
        )
          this.drawAlignmentPattern(x, y);
      });
    });

    // Draw configuration data
    this.drawFormatBits(0); // Dummy mask value; overwritten later in the constructor
    this.drawVersion();
  }

  // Draws two copies of the format bits (with its own error correction code)
  // based on the given mask and this object's error correction level field.
  private drawFormatBits(mask: number): void {
    // Calculate error correction code and pack bits
    const data: number = (this.errorCorrectionLevel.formatBits << 3) | mask; // errCorrLvl is uint2, mask is uint3
    let rem: number = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; // uint15
    assert(bits >>> 15 === 0);

    // Draw first copy
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));

    // Draw second copy
    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true); // Always dark
  }

  // Draws two copies of the version bits (with its own error correction code),
  // based on this object's version field, iff 7 <= version <= 40.
  private drawVersion(): void {
    if (this.version < 7) return;

    // Calculate error correction code and pack bits
    let rem: number = this.version; // version is uint6, in the range [7, 40]
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits: number = (this.version << 12) | rem; // uint18
    assert(bits >>> 18 === 0);

    // Draw two copies
    for (let i = 0; i < 18; i++) {
      const color: boolean = getBit(bits, i);
      const a: number = this.size - 11 + (i % 3);
      const b: number = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  // Draws a 9*9 finder pattern including the border separator,
  // with the center module at (x, y). Modules can be out of bounds.
  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist: number = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev/infinity norm
        const xx: number = x + dx;
        const yy: number = y + dy;
        if (0 <= xx && xx < this.size && 0 <= yy && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  // Draws a 5*5 alignment pattern, with the center module
  // at (x, y). All modules must be in bounds.
  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  // Sets the color of a module and marks it as a function module.
  // Only used by the constructor. Coordinates must be in bounds.
  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y * this.size + x] = isDark ? 1 : 0;
    this.isFunction[y * this.size + x] = 1;
  }

  /*-- Private helper methods for constructor: Codewords and masking --*/

  // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
  // data area of this QR Code. Function modules need to be marked off before this is called.
  private drawCodewords(data: readonly number[]): void {
    if (data.length !== Math.floor(getNumRawDataModules(this.version) / 8))
      throw new RangeError("Invalid argument");
    let i = 0; // Bit index into the data
    // Do the funny zigzag scan
    for (let right = this.size - 1; right >= 1; right -= 2) {
      // Index of right column in each column pair
      if (right === 6) right = 5;
      i = this.drawColumnPair(data, right, i);
    }
    assert(i === data.length * 8);
  }

  // Draws the bits from index i on in one column pair of the zigzag scan, and returns the
  // next bit index. (Halonic: the inner loops of upstream's drawCodewords.)
  private drawColumnPair(data: readonly number[], right: number, i: number): number {
    const upward: boolean = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < this.size; vert++) {
      // Vertical counter
      for (let j = 0; j < 2; j++) {
        const x: number = right - j; // Actual x coordinate
        const y: number = upward ? this.size - 1 - vert : vert; // Actual y coordinate
        if (this.isFunction[y * this.size + x] !== 1 && i < data.length * 8) {
          this.modules[y * this.size + x] = getBit(data[i >>> 3] ?? 0, 7 - (i & 7)) ? 1 : 0;
          i++;
        }
        // If this QR Code has any remainder bits (0 to 7), they were assigned as
        // 0/false/light by the constructor and are left unchanged by this method
      }
    }
    return i;
  }

  // Tries all 8 masks and returns the one with the lowest penalty score, the first on a tie.
  // (Halonic: the automatic branch of upstream's constructor.)
  private chooseMask(): number {
    let msk = 0;
    let minPenalty = 1000000000;
    for (let i = 0; i < 8; i++) {
      this.applyMask(i);
      this.drawFormatBits(i);
      const penalty: number = getPenaltyScore(this.modules, this.size);
      if (penalty < minPenalty) {
        msk = i;
        minPenalty = penalty;
      }
      this.applyMask(i); // Undoes the mask due to XOR
    }
    return msk;
  }

  // XORs the codeword modules in this QR Code with the given mask pattern.
  // The function modules must be marked and the codeword bits must be drawn
  // before masking. Due to the arithmetic of XOR, calling applyMask() with
  // the same mask value a second time will undo the mask. A final well-formed
  // QR Code needs exactly one (not zero, two, etc.) mask applied.
  private applyMask(mask: number): void {
    if (mask < 0 || mask > 7) throw new RangeError("Mask value out of range");
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const index = y * this.size + x;
        if (this.isFunction[index] !== 1 && maskInverts(mask, x, y))
          this.modules[index] = this.get(x, y) ? 0 : 1;
      }
    }
  }

  /*-- Private helper functions --*/

  // Returns an ascending list of positions of alignment patterns for this version number.
  // Each position is in the range [0,177), and are used on both the x and y axes.
  // This could be implemented as lookup table of 40 variable-length lists of integers.
  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign: number = Math.floor(this.version / 7) + 2;
    const step: number = Math.floor((this.version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
    const result: number[] = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }
}

// Whether the given mask pattern inverts the module at (x, y).
// (Halonic: the switch of upstream's applyMask.)
function maskInverts(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new Error("Unreachable");
  }
}

// The data codewords of one byte segment at the given version and error correction level: the
// segment header and data, the terminator, the bit padding and the pad bytes, packed into bytes.
// (Halonic: the second half of upstream's encodeSegments, for the one byte segment.)
function makeDataCodewords(
  data: Readonly<ArrayLike<number>>,
  version: number,
  ecl: Ecc,
  dataUsedBits: number,
): number[] {
  // Concatenate the segment to create the data bit string
  const bb: number[] = [];
  appendBits(BYTE_MODE_BITS, 4, bb);
  appendBits(data.length, numCharCountBits(version), bb);
  for (let i = 0; i < data.length; i++) appendBits(data[i] ?? 0, 8, bb);
  assert(bb.length === dataUsedBits);

  // Add terminator and pad up to a byte if applicable
  const dataCapacityBits: number = getNumDataCodewords(version, ecl) * 8;
  assert(bb.length <= dataCapacityBits);
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  assert(bb.length % 8 === 0);

  // Pad with alternating bytes until data capacity is reached
  for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11)
    appendBits(padByte, 8, bb);

  // Pack bits into bytes in big endian
  const dataCodewords: number[] = new Array<number>(bb.length / 8).fill(0);
  bb.forEach((b: number, i: number) => {
    dataCodewords[i >>> 3] = (dataCodewords[i >>> 3] ?? 0) | (b << (7 - (i & 7)));
  });
  return dataCodewords;
}
