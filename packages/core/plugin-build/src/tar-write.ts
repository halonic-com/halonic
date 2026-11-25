// An uncompressed ustar writer that gives the same bytes for the same files:
// sorted names, mtime 0, mode 0644, uid and gid 0, empty owner names. It is
// uncompressed on purpose: gzip's output depends on the zlib version, so a
// different runtime could give different bytes and a different sha-256.

import {
  blockSize,
  field,
  headerChecksum,
  maxFileBytes,
  maxNameBytes,
  paddedSize,
  regularFileType,
  ustarMagic,
  ustarVersion,
} from "./tar-header.ts";

/** One file to put into an archive. */
export interface TarFile {
  /** The path inside the archive, such as `package/manifest.js`. */
  readonly name: string;
  /** The file's bytes, copied as they are. */
  readonly bytes: Uint8Array;
}

/** Why the writer refused a name. */
export type TarNameReason =
  | "empty"
  | "too-long"
  | "not-ascii"
  | "absolute"
  | "parent-folder"
  | "duplicate";

/** The writer refused a name, so it wrote nothing. */
export class TarNameError extends Error {
  /** Why the name was refused. */
  readonly reason: TarNameReason;
  /** The refused name, as it was given. */
  readonly fileName: string;

  constructor(fileName: string, reason: TarNameReason) {
    super(`Can't put "${fileName}" in the archive: ${reason}.`);
    this.name = "TarNameError";
    this.fileName = fileName;
    this.reason = reason;
  }
}

/**
 * Writes files as one uncompressed ustar archive. The same files always give
 * the same bytes, whatever order they come in.
 *
 * @param files - the files, each with its path inside the archive
 * @returns the archive's bytes, ending with the two empty blocks tar expects
 * @throws {TarNameError} when a name is empty, longer than 100 bytes, not
 *   visible ASCII, absolute, holds `..` or comes twice
 * @throws {RangeError} when a file is too large for the size field
 */
export function writeTar(files: readonly TarFile[]): Uint8Array {
  checkNames(files);
  const sorted = [...files].sort((left, right) => byCodeUnit(left.name, right.name));
  const total = sorted.reduce((sum, file) => sum + blockSize + paddedSize(file.bytes.length), 0);
  const archive = new Uint8Array(total + 2 * blockSize);
  let offset = 0;
  for (const file of sorted) {
    archive.set(header(file), offset);
    archive.set(file.bytes, offset + blockSize);
    offset += blockSize + paddedSize(file.bytes.length);
  }
  return archive;
}

/**
 * Why a name may not go into an archive, or `undefined` when it may. Only
 * visible ASCII (no spaces or control characters) is allowed, so a name
 * never holds anything a shell, a file system or the header could read
 * another way.
 */
export function tarNameProblem(name: string): Exclude<TarNameReason, "duplicate"> | undefined {
  if (name === "") {
    return "empty";
  }
  if (!/^[\x21-\x7e]+$/.test(name)) {
    return "not-ascii";
  }
  // Visible ASCII is one byte per character, so the length is the byte count.
  if (name.length > maxNameBytes) {
    return "too-long";
  }
  if (name.startsWith("/")) {
    return "absolute";
  }
  if (name.includes("..")) {
    return "parent-folder";
  }
  return undefined;
}

function checkNames(files: readonly TarFile[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    const problem = tarNameProblem(file.name);
    if (problem !== undefined) {
      throw new TarNameError(file.name, problem);
    }
    if (seen.has(file.name)) {
      throw new TarNameError(file.name, "duplicate");
    }
    seen.add(file.name);
  }
}

function header(file: TarFile): Uint8Array {
  if (file.bytes.length > maxFileBytes) {
    throw new RangeError(`"${file.name}" is too large for a tar archive.`);
  }
  const block = new Uint8Array(blockSize);
  writeText(block, field.name, file.name);
  writeOctal(block, field.mode, 0o644);
  writeOctal(block, field.uid, 0);
  writeOctal(block, field.gid, 0);
  writeOctal(block, field.size, file.bytes.length);
  writeOctal(block, field.mtime, 0);
  writeText(block, field.typeflag, regularFileType);
  writeText(block, field.magic, ustarMagic);
  writeText(block, field.version, ustarVersion);
  // The owner and group names, the device numbers and the prefix stay empty (all NUL).
  // The checksum is six octal digits, a NUL and a space, as GNU tar and npm write it.
  const checksum = headerChecksum(block).toString(8).padStart(6, "0");
  writeText(block, field.checksum, `${checksum}\0 `);
  return block;
}

/** Writes ASCII text at a field's start; the rest of the field stays NUL. */
function writeText(block: Uint8Array, at: { offset: number }, text: string): void {
  for (let index = 0; index < text.length; index++) {
    block[at.offset + index] = text.charCodeAt(index);
  }
}

/** Writes a number as octal digits filling the field, then a NUL. */
function writeOctal(
  block: Uint8Array,
  at: { offset: number; length: number },
  value: number,
): void {
  writeText(block, at, `${value.toString(8).padStart(at.length - 1, "0")}\0`);
}

function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
