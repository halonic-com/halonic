/**
 * Reads one 32-bit word. The hash code only reads indexes it knows are in
 * range; the fallback is there because `noUncheckedIndexedAccess` types every
 * read as maybe missing.
 */
export function wordAt(words: Uint32Array, index: number): number {
  return words[index] ?? 0;
}
