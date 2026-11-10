/** Mode of an index entry that records a nested repository (a gitlink), not a file. */
const gitlinkMode = 0o160000;
const modeMask = 0o170000;
/** Set in an entry's flags when two more flag bytes follow (index version 3 and up). */
const extendedFlag = 0x4000;

/**
 * The paths of the gitlinks in a git index file: the nested repositories that
 * `git status` looks into. Reads the file's bytes only, so no git runs on the
 * host. Understands index versions 2, 3 and 4 and SHA-1 or SHA-256 ids.
 *
 * @throws when the file is not an index this reader understands.
 */
export function gitlinkPaths(index: Uint8Array, hashLength: 20 | 32): string[] {
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength);
  if (index.byteLength < 12 || new TextDecoder().decode(index.subarray(0, 4)) !== "DIRC") {
    throw new Error("not a git index");
  }
  const version = view.getUint32(4);
  if (version < 2 || version > 4) throw new Error(`git index version ${version} is not supported`);
  const count = view.getUint32(8);
  const found: string[] = [];
  let offset = 12;
  let previous: Uint8Array = new Uint8Array(0);
  for (let entry = 0; entry < count; entry++) {
    const start = offset;
    const mode = view.getUint32(start + 24);
    offset = start + 40 + hashLength;
    const flags = view.getUint16(offset);
    offset += 2;
    if (version >= 3 && (flags & extendedFlag) !== 0) offset += 2;
    let name: Uint8Array;
    if (version === 4) {
      const strip = readVarint(index, offset);
      offset = strip.next;
      const end = nul(index, offset);
      const kept = previous.subarray(0, Math.max(0, previous.byteLength - strip.value));
      name = concat(kept, index.subarray(offset, end));
      offset = end + 1;
    } else {
      const end = nul(index, offset);
      name = index.subarray(offset, end);
      // Padded with 1 to 8 NULs to a multiple of 8 bytes from the entry's start.
      offset = start + Math.ceil((end + 1 - start) / 8) * 8;
    }
    previous = name;
    if ((mode & modeMask) === gitlinkMode) found.push(new TextDecoder().decode(name));
  }
  return found;
}

function nul(bytes: Uint8Array, from: number): number {
  const end = bytes.indexOf(0, from);
  if (end === -1) throw new Error("git index entry has no end");
  return end;
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
