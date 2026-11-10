/** Index entry mode of a plain file. */
export const fileMode = 0o100644;
/** Index entry mode of a gitlink. */
export const gitlinkMode = 0o160000;

/** A git index the way git writes one, with entries in the given order. */
export function index(
  entries: { path: string; mode: number; extended?: boolean }[],
  version: 2 | 3 | 4 = 2,
  hashLength = 20,
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
    if (version === 4) {
      let shared = 0;
      while (shared < previous.length && previous[shared] === entry.path[shared]) shared++;
      parts.push(
        previous.length - shared,
        ...new TextEncoder().encode(entry.path.slice(shared)),
        0,
      );
    } else {
      parts.push(...name, 0);
      while ((parts.length - start) % 8 !== 0) parts.push(0);
    }
    previous = entry.path;
  }
  return new Uint8Array(parts);
}

function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}
