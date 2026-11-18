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
 * trimmed to byte mode (HAL-12239, decision 15 of HAL-12232). This file holds the mask penalty
 * score (getPenaltyScore and its helpers, private methods of QrCode upstream); qr-code.ts holds
 * the symbol and lists every change from upstream.
 */

// For use in getPenaltyScore(), when evaluating which mask is best.
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// Throws an exception if the given condition is false.
function assert(cond: boolean): void {
  if (!cond) throw new Error("Assertion error");
}

// Calculates and returns the penalty score based on state of the given modules (0 = light,
// 1 = dark, row by row, size*size). This is used by the automatic mask choice algorithm to find
// the mask pattern that yields the lowest score.
export function getPenaltyScore(modules: Uint8Array, size: number): number {
  const get = (x: number, y: number): boolean => modules[y * size + x] === 1;
  let result = 0;
  for (let i = 0; i < size; i++) {
    // Adjacent modules in row having same color, and finder-like patterns
    result += linePenalty(size, (k) => get(k, i));
    // Adjacent modules in column having same color, and finder-like patterns
    result += linePenalty(size, (k) => get(i, k));
  }
  result += blockPenalty(size, get) + balancePenalty(modules, size);
  assert(0 <= result && result <= 2568888); // Non-tight upper bound based on default values of PENALTY_N1, ..., N4
  return result;
}

// The run and finder-like penalties of one row or column, read through `at`.
// (Halonic: upstream writes this loop out twice, once for rows and once for columns.)
function linePenalty(size: number, at: (k: number) => boolean): number {
  let result = 0;
  let runColor = false;
  let run = 0;
  const runHistory = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < size; k++) {
    if (at(k) === runColor) {
      run++;
      if (run === 5) result += PENALTY_N1;
      else if (run > 5) result++;
    } else {
      finderPenaltyAddHistory(size, run, runHistory);
      if (!runColor) result += finderPenaltyCountPatterns(size, runHistory) * PENALTY_N3;
      runColor = at(k);
      run = 1;
    }
  }
  return result + finderPenaltyTerminateAndCount(size, runColor, run, runHistory) * PENALTY_N3;
}

// 2*2 blocks of modules having same color
function blockPenalty(size: number, get: (x: number, y: number) => boolean): number {
  let result = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color: boolean = get(x, y);
      if (color === get(x + 1, y) && color === get(x, y + 1) && color === get(x + 1, y + 1))
        result += PENALTY_N2;
    }
  }
  return result;
}

// Balance of dark and light modules
function balancePenalty(modules: Uint8Array, size: number): number {
  const dark: number = modules.reduce((sum, color) => sum + color, 0);
  const total: number = size * size; // Note that size is odd, so dark/total != 1/2
  // Compute the smallest integer k >= 0 such that (45-5k)% <= dark/total <= (55+5k)%
  const k: number = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  assert(0 <= k && k <= 9);
  return k * PENALTY_N4;
}

// Can only be called immediately after a light run is added, and
// returns either 0, 1, or 2. A helper function for getPenaltyScore().
function finderPenaltyCountPatterns(size: number, runHistory: readonly number[]): number {
  const [h0 = 0, n = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0] = runHistory;
  assert(n <= size * 3);
  const core: boolean = n > 0 && h2 === n && h3 === n * 3 && h4 === n && h5 === n;
  return (core && h0 >= n * 4 && h6 >= n ? 1 : 0) + (core && h6 >= n * 4 && h0 >= n ? 1 : 0);
}

// Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
function finderPenaltyTerminateAndCount(
  size: number,
  currentRunColor: boolean,
  currentRunLength: number,
  runHistory: number[],
): number {
  if (currentRunColor) {
    // Terminate dark run
    finderPenaltyAddHistory(size, currentRunLength, runHistory);
    currentRunLength = 0;
  }
  currentRunLength += size; // Add light border to final run
  finderPenaltyAddHistory(size, currentRunLength, runHistory);
  return finderPenaltyCountPatterns(size, runHistory);
}

// Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
function finderPenaltyAddHistory(
  size: number,
  currentRunLength: number,
  runHistory: number[],
): void {
  if (runHistory[0] === 0) currentRunLength += size; // Add light border to initial run
  runHistory.pop();
  runHistory.unshift(currentRunLength);
}
