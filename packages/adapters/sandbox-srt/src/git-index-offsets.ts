import type { Entry } from "./git-index.ts";

/**
 * Refuses an `EOIE` extension that doesn't point where the entries end. Git
 * finds it by its place, last before the file's hash, rather than by reading
 * through the entries, and when it reads entries in parallel it reads the
 * extensions from the offset it names, so the two must agree.
 */
export function checkEndOfEntries(
  index: Uint8Array,
  view: DataView,
  entriesEnd: number,
  hashLength: number,
): void {
  // Its 8-byte header, then a 4-byte offset and a hash.
  const at = index.byteLength - hashLength - (8 + 4 + hashLength);
  if (at < entriesEnd) return;
  if (new TextDecoder().decode(index.subarray(at, at + 4)) !== "EOIE") return;
  if (view.getUint32(at + 4) !== 4 + hashLength) return;
  if (view.getUint32(at + 8) !== entriesEnd) {
    throw new Error("git index EOIE extension doesn't match its entries");
  }
}

/**
 * Refuses an `IEOT` extension that doesn't match the entries as read. Git uses
 * it to read blocks of entries in parallel, each from the offset it names and
 * taking no name from before it, instead of one entry after the other.
 */
export function checkOffsetTable(data: Uint8Array, entries: readonly Entry[]): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // A 4-byte version, then an offset and an entry count for each block.
  if (data.byteLength < 4 || (data.byteLength - 4) % 8 !== 0) {
    throw new Error("git index IEOT extension is malformed");
  }
  let next = 0;
  for (let at = 4; at < data.byteLength; at += 8) {
    const first = entries[next];
    if (first === undefined || first.start !== view.getUint32(at) || first.copied !== 0) {
      throw new Error("git index IEOT extension doesn't match its entries");
    }
    next += view.getUint32(at + 4);
  }
  if (next !== entries.length)
    throw new Error("git index IEOT extension doesn't match its entries");
}
