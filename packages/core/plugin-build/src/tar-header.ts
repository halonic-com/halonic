// The parts of a POSIX ustar header this package writes and reads. One
// header is one 512-byte block; the fields below are its byte offsets.
// Reference: POSIX.1-2017, "pax", section "ustar Interchange Format".

/** A tar block: every header and every padded file body is a multiple of it. */
export const blockSize = 512;

/** The longest name the header's name field holds; we never use the prefix field. */
export const maxNameBytes = 100;

/** The largest file the 11 octal digits of the size field can say (8 GiB less a byte). */
export const maxFileBytes = 0o77777777777;

/** Where each header field starts, and how many bytes it has. */
export const field = {
  name: { offset: 0, length: 100 },
  mode: { offset: 100, length: 8 },
  uid: { offset: 108, length: 8 },
  gid: { offset: 116, length: 8 },
  size: { offset: 124, length: 12 },
  mtime: { offset: 136, length: 12 },
  checksum: { offset: 148, length: 8 },
  typeflag: { offset: 156, length: 1 },
  magic: { offset: 257, length: 6 },
  version: { offset: 263, length: 2 },
  prefix: { offset: 345, length: 155 },
} as const;

/** `ustar` and a NUL: the magic of a POSIX ustar header. */
export const ustarMagic = "ustar\0";

/** The ustar version that goes with {@link ustarMagic}. */
export const ustarVersion = "00";

/** The type flag of a regular file. */
export const regularFileType = "0";

/**
 * The header's checksum: the sum of all its bytes, with the checksum field
 * itself counted as eight spaces.
 */
export function headerChecksum(header: Uint8Array): number {
  const space = 0x20;
  const { offset, length } = field.checksum;
  let sum = 0;
  for (let index = 0; index < blockSize; index++) {
    const insideChecksum = index >= offset && index < offset + length;
    sum += insideChecksum ? space : (header[index] ?? 0);
  }
  return sum;
}

/** How many bytes a file body takes once padded to whole blocks. */
export function paddedSize(size: number): number {
  return Math.ceil(size / blockSize) * blockSize;
}
