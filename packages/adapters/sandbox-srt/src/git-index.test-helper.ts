/** Index entry mode of a plain file. */
export const fileMode = 0o100644;
/** Index entry mode of a gitlink. */
export const gitlinkMode = 0o160000;

/** What a split index's `link` extension says: its shared index's id and which entries it replaces. */
export interface Link {
  /** The shared index's id, as `sharedindex.<id>` in the git folder names it. */
  readonly id: string;
  /** The shared index positions the first entries replace, in order; those entries have no name. */
  readonly replace?: readonly number[];
}

/** A git index the way git writes one, with entries in the given order. */
export function index(
  entries: { path: string; mode: number; extended?: boolean }[],
  version: 2 | 3 | 4 = 2,
  hashLength = 20,
  link?: Link,
): Uint8Array {
  const parts: number[] = [
    ...new TextEncoder().encode("DIRC"),
    ...u32(version),
    ...u32(entries.length),
  ];
  let previous = "";
  for (const entry of entries) {
    const start = parts.length;
    parts.push(...new Array(24).fill(0), ...u32(entry.mode), ...new Array(12).fill(0));
    parts.push(...new Array(hashLength).fill(7));
    const name = new TextEncoder().encode(entry.path);
    const flags = Math.min(name.byteLength, 0xfff) | (entry.extended ? 0x4000 : 0);
    parts.push(flags >> 8, flags & 0xff);
    if (entry.extended) parts.push(0x20, 0);
    parts.push(...entryName(entry.path, previous, version, parts.length - start));
    previous = entry.path;
  }
  if (link !== undefined) parts.push(...linkExtension(link));
  // The file's own hash ends it; the reader doesn't check it.
  parts.push(...new Array(hashLength).fill(9));
  return new Uint8Array(parts);
}

/**
 * An entry's name: in version 4 what it strips from the previous name and the
 * rest, otherwise all of it, padded with NULs to a multiple of 8 bytes from the
 * entry's start (`written` bytes before it).
 */
function entryName(path: string, previous: string, version: number, written: number): number[] {
  if (version !== 4) {
    const name = [...new TextEncoder().encode(path), 0];
    while ((written + name.length) % 8 !== 0) name.push(0);
    return name;
  }
  let shared = 0;
  while (shared < previous.length && previous[shared] === path[shared]) shared++;
  return [previous.length - shared, ...new TextEncoder().encode(path.slice(shared)), 0];
}

/** The `link` extension: the shared index's id, an empty delete bitmap and the replace bitmap. */
function linkExtension(link: Link): number[] {
  const id = link.id.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  const data = [...id, ...ewah([]), ...ewah(link.replace ?? [])];
  return [...new TextEncoder().encode("link"), ...u32(data.length), ...data];
}

/** An EWAH bitmap with these bits set: one marker word, then literal words only. */
function ewah(bits: readonly number[]): number[] {
  const words = Math.ceil((Math.max(-1, ...bits) + 1) / 64);
  const literals = Array.from({ length: words }, () => 0n);
  for (const bit of bits)
    literals[bit >> 6] = (literals[bit >> 6] ?? 0n) | (1n << BigInt(bit & 63));
  const marker = BigInt(words) << 33n;
  return [...u32(words * 64), ...u32(words + 1), ...[marker, ...literals].flatMap(u64), ...u32(0)];
}

function u64(value: bigint): number[] {
  return [...u32(Number(value >> 32n)), ...u32(Number(value & 0xffffffffn))];
}

function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}
