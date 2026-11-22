import { checkEndOfEntries, checkOffsetTable } from "./git-index-offsets.ts";

/** Mode of an index entry that records a nested repository (a gitlink), not a file. */
const gitlinkMode = 0o160000;
const modeMask = 0o170000;
/** Set in an entry's flags when two more flag bytes follow; git honours it in every index version. */
const extendedFlag = 0x4000;

/** The low 12 bits of an entry's flags: its name's length, or 0xFFF for a name that long or longer. */
const nameLengthMask = 0xfff;

/** A git index file as far as finding its gitlinks needs it. */
export interface GitIndex {
  readonly entries: readonly { readonly name: Uint8Array; readonly mode: number }[];
  /**
   * The file name in the git folder of the shared index (`sharedindex.<hex>`)
   * this index's `link` extension points to, or null when it is not split.
   */
  readonly sharedIndex: string | null;
  /** Shared index positions the first entries here replace, in order (split index only). */
  readonly replaced: readonly number[];
}

/** An entry as read, with where it starts and how much of its name came from the one before. */
export interface Entry {
  readonly name: Uint8Array;
  readonly mode: number;
  readonly start: number;
  /** Bytes taken from the start of the previous entry's name (index version 4 only). */
  readonly copied: number;
}

/**
 * Reads a git index file's bytes, so no git runs on the host. Understands
 * index versions 2, 3 and 4, SHA-1 or SHA-256 ids and the `link` extension of
 * a split index. It reads the entries in the order and at the offsets git
 * does, and refuses an index where git could find other entries than it does.
 *
 * @throws when the file is not an index this reader understands.
 */
export function parseIndex(index: Uint8Array, hashLength: 20 | 32): GitIndex {
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength);
  if (index.byteLength < 12 || new TextDecoder().decode(index.subarray(0, 4)) !== "DIRC") {
    throw new Error("not a git index");
  }
  const version = view.getUint32(4);
  if (version < 2 || version > 4) throw new Error(`git index version ${version} is not supported`);
  const { entries, end } = readEntries(index, view, version, hashLength);
  checkEndOfEntries(index, view, end, hashLength);
  return { entries, ...readExtensions(index, view, end, hashLength, entries) };
}

/** The entries after the header, and the offset where the extensions start. */
function readEntries(
  index: Uint8Array,
  view: DataView,
  version: number,
  hashLength: number,
): { entries: Entry[]; end: number } {
  const count = view.getUint32(8);
  // The entries and extensions end where the file's own hash starts.
  const limit = index.byteLength - hashLength;
  const entries: Entry[] = [];
  let offset = 12;
  let previous: Uint8Array = new Uint8Array(0);
  for (let entry = 0; entry < count; entry++) {
    const start = offset;
    if (start + 42 + hashLength > limit) throw new Error("git index entries are cut off");
    const mode = view.getUint32(start + 24);
    offset = start + 40 + hashLength;
    const flags = view.getUint16(offset);
    offset += 2;
    if ((flags & extendedFlag) !== 0) offset += 2;
    let copied = 0;
    if (version === 4) {
      const prefix = readPrefix(index, offset, entry === 0 ? null : previous);
      copied = prefix.copied;
      offset = prefix.next;
    }
    const end = nameEnd(index, offset, flags & nameLengthMask, copied, limit);
    const name = concat(previous.subarray(0, copied), index.subarray(offset, end));
    // Version 4 has no padding; the others pad with NULs to a multiple of 8 bytes from the entry's start.
    offset = version === 4 ? end + 1 : start + Math.ceil((end + 1 - start) / 8) * 8;
    if (offset > limit) throw new Error("git index entries are cut off");
    previous = name;
    entries.push({ name, mode, start, copied });
  }
  return { entries, end: offset };
}

/**
 * How many bytes of the previous name a version 4 entry at `from` keeps: its
 * varint says how many to strip from the end. Like git, the first entry
 * (`previous` null) keeps none, and stripping more than there is is refused.
 */
function readPrefix(
  index: Uint8Array,
  from: number,
  previous: Uint8Array | null,
): { copied: number; next: number } {
  const strip = readVarint(index, from);
  if (previous === null) return { copied: 0, next: strip.next };
  if (strip.value > previous.byteLength) throw new Error("git index entry strips too much");
  return { copied: previous.byteLength - strip.value, next: strip.next };
}

/**
 * Where the name stored at `from` ends (its NUL), the way git's read-cache.c
 * finds it. The flags' length counts the whole name, `copied` bytes taken
 * from the previous name included, and git moves on to the next entry by that
 * length without looking for the NUL. Only a name of 0xFFF bytes or longer
 * ends at its first NUL. So a name whose first NUL isn't where its length
 * says is refused: git would read other names, and other entries after it.
 */
function nameEnd(
  index: Uint8Array,
  from: number,
  flagLength: number,
  copied: number,
  limit: number,
): number {
  if (flagLength === nameLengthMask) {
    const end = index.indexOf(0, from);
    if (end === -1 || end >= limit) throw new Error("git index entry has no end");
    return end;
  }
  const end = from + flagLength - copied;
  if (end < from || end >= limit || index.subarray(from, end + 1).indexOf(0) !== end - from) {
    throw new Error("git index entry name doesn't match its length");
  }
  return end;
}

/**
 * The `link` extension, when there is one; the others don't hold gitlinks.
 * An `IEOT` extension is checked against the entries.
 */
function readExtensions(
  index: Uint8Array,
  view: DataView,
  from: number,
  hashLength: number,
  entries: readonly Entry[],
): { sharedIndex: string | null; replaced: number[] } {
  let offset = from;
  let sharedIndex: string | null = null;
  let replaced: number[] = [];
  // Extensions follow the entries: a 4-byte name, a 4-byte size, the data; the file's hash ends it.
  const extensionsEnd = index.byteLength - hashLength;
  while (offset + 8 <= extensionsEnd) {
    const name = new TextDecoder().decode(index.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4);
    const data = offset + 8;
    if (data + size > extensionsEnd) throw new Error(`git index extension ${name} is cut off`);
    if (name === "link") {
      const link = readLink(index.subarray(data, data + size), hashLength, entries.length);
      sharedIndex = link.sharedIndex;
      replaced = link.replaced;
    }
    if (name === "IEOT") checkOffsetTable(index.subarray(data, data + size), entries);
    offset = data + size;
  }
  return { sharedIndex, replaced };
}

/**
 * The paths of the gitlinks in a git index: the nested repositories that
 * `git status` looks into. For a split index, pass the shared index too: the
 * result is then every gitlink in either, so it may name one the split index
 * deleted, never miss one.
 *
 * @throws when the index is split and `shared` is missing or doesn't match it.
 */
export function gitlinkPaths(index: GitIndex, shared: GitIndex | null): string[] {
  if (index.sharedIndex !== null && shared === null) {
    throw new Error(`the shared index ${index.sharedIndex} is needed`);
  }
  const found = new Set<string>();
  const gitlink = (mode: number) => (mode & modeMask) === gitlinkMode;
  index.entries.forEach((entry, at) => {
    const replacing = at < index.replaced.length;
    // A replacing entry has no name of its own: it is that of the shared entry it replaces.
    if (replacing !== (entry.name.byteLength === 0)) throw new Error("git index link is corrupt");
    const name = replacing ? shared?.entries[index.replaced[at] ?? -1]?.name : entry.name;
    if (name === undefined) throw new Error("git index link is corrupt");
    if (gitlink(entry.mode)) found.add(new TextDecoder().decode(name));
  });
  if (index.sharedIndex !== null) {
    for (const entry of shared?.entries ?? []) {
      if (gitlink(entry.mode)) found.add(new TextDecoder().decode(entry.name));
    }
  }
  return [...found];
}

/** The `link` extension: the shared index's id, then the delete and replace bitmaps. */
function readLink(
  data: Uint8Array,
  hashLength: number,
  entries: number,
): { sharedIndex: string | null; replaced: number[] } {
  if (data.byteLength < hashLength) throw new Error("git index link is cut off");
  const id = data.subarray(0, hashLength);
  // An id of zeros means no shared index, the way git reads it.
  const sharedIndex = id.every((byte) => byte === 0)
    ? null
    : `sharedindex.${Array.from(id, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (data.byteLength === hashLength) return { sharedIndex, replaced: [] };
  const deleted = ewahBits(data, hashLength, null);
  // Each replaced shared entry takes one entry here, so there can't be more of them.
  const replaced = ewahBits(data, deleted.next, entries).bits;
  return { sharedIndex, replaced };
}

/**
 * The set bit positions of the EWAH bitmap at `from` (git's ewah/ewah_io.c),
 * collecting at most `limit` of them, or none when `limit` is null.
 */
function ewahBits(
  data: Uint8Array,
  from: number,
  limit: number | null,
): { bits: number[]; next: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (from + 8 > data.byteLength) throw new Error("git index bitmap is cut off");
  const words = view.getUint32(from + 4);
  const next = from + 8 + words * 8 + 4;
  if (next > data.byteLength) throw new Error("git index bitmap is cut off");
  const bits: number[] = [];
  if (limit === null) return { bits, next };
  const add = (bit: number) => {
    if (bits.length === limit) throw new Error("git index bitmap has too many bits");
    bits.push(bit);
  };
  let position = 0;
  for (let at = 0; at < words; ) {
    // A marker word: a running bit, how many words of it, how many literal words follow.
    const marker = view.getBigUint64(from + 8 + at++ * 8);
    const running = Number((marker >> 1n) & 0xffffffffn) * 64;
    if ((marker & 1n) === 1n) for (let bit = 0; bit < running; bit++) add(position + bit);
    position += running;
    const literals = Number(marker >> 33n);
    for (let literal = 0; literal < literals && at < words; literal++) {
      setBits(view.getBigUint64(from + 8 + at++ * 8), position, add);
      position += 64;
    }
  }
  return { bits, next };
}

/** Calls `add` with the position of each bit set in a 64-bit literal word, lowest first. */
function setBits(word: bigint, position: number, add: (bit: number) => void): void {
  for (let bit = 0; bit < 64; bit++) if ((word >> BigInt(bit)) & 1n) add(position + bit);
}

/** Git's offset varint (index version 4): each continuation adds one before shifting. */
function readVarint(bytes: Uint8Array, from: number): { value: number; next: number } {
  let at = from;
  let byte = bytes[at++] ?? 0;
  let value = byte & 0x7f;
  while ((byte & 0x80) !== 0) {
    byte = bytes[at++] ?? 0;
    value = ((value + 1) << 7) | (byte & 0x7f);
  }
  return { value, next: at };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.byteLength + b.byteLength);
  joined.set(a);
  joined.set(b, a.byteLength);
  return joined;
}
