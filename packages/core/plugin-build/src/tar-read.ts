// Reads one file out of an archive this package wrote. The archive is
// untrusted (it comes from a folder the user names), so the reader reads only
// our own format, checks every header and never trusts a size it hasn't
// checked against the archive's length.

import { err, ok, type Result } from "@halonicjs/std";
import {
  blockSize,
  field,
  headerChecksum,
  paddedSize,
  regularFileType,
  ustarMagic,
  ustarVersion,
} from "./tar-header.ts";

/** More headers than a plugin archive ever has; past it the archive is refused. */
export const maxTarEntries = 16;

/** Why a file couldn't be read out of an archive. */
export type TarReadProblem =
  | { readonly code: "not-our-tar"; readonly detail: string }
  | { readonly code: "missing"; readonly fileName: string }
  | { readonly code: "duplicate"; readonly fileName: string }
  | { readonly code: "too-large"; readonly fileName: string; readonly maxBytes: number };

interface Entry {
  readonly name: string;
  readonly start: number;
  readonly size: number;
}

/**
 * Reads one file out of an uncompressed ustar archive. Only regular files
 * with a plain name are accepted; anything else in the archive refuses the
 * whole archive, so no link or odd header can stand in for the file.
 *
 * @param archive - the archive's bytes
 * @param fileName - the path inside the archive, such as `package/snapshot.json`
 * @param maxBytes - the largest file it will return
 * @returns a copy of the file's bytes, or why it can't
 */
export function readTarFile(
  archive: Uint8Array,
  fileName: string,
  maxBytes: number,
): Result<Uint8Array, TarReadProblem> {
  const entries = listEntries(archive);
  if (!entries.ok) {
    return entries;
  }
  const matches = entries.value.filter((entry) => entry.name === fileName);
  const [entry] = matches;
  if (entry === undefined) {
    return err({ code: "missing", fileName });
  }
  if (matches.length > 1) {
    return err({ code: "duplicate", fileName });
  }
  if (entry.size > maxBytes) {
    return err({ code: "too-large", fileName, maxBytes });
  }
  return ok(archive.slice(entry.start, entry.start + entry.size));
}

function listEntries(archive: Uint8Array): Result<Entry[], TarReadProblem> {
  const entries: Entry[] = [];
  let offset = 0;
  while (offset + blockSize <= archive.length) {
    const block = archive.subarray(offset, offset + blockSize);
    if (block.every((byte) => byte === 0)) {
      return ok(entries);
    }
    if (entries.length === maxTarEntries) {
      return notOurTar(`more than ${maxTarEntries} files`);
    }
    const entry = readHeader(block, offset + blockSize, archive.length);
    if (!entry.ok) {
      return entry;
    }
    entries.push(entry.value);
    offset = entry.value.start + paddedSize(entry.value.size);
  }
  return notOurTar("it ends before its end blocks");
}

function readHeader(
  block: Uint8Array,
  start: number,
  archiveLength: number,
): Result<Entry, TarReadProblem> {
  if (text(block, field.magic) !== ustarMagic || text(block, field.version) !== ustarVersion) {
    return notOurTar("a header isn't ustar");
  }
  if (readOctal(block, field.checksum) !== headerChecksum(block)) {
    return notOurTar("a header's checksum is wrong");
  }
  if (text(block, field.typeflag) !== regularFileType) {
    return notOurTar("it holds something other than a plain file");
  }
  if (!isEmpty(block, field.prefix)) {
    return notOurTar("a name uses the prefix field");
  }
  const size = readOctal(block, field.size);
  if (size === undefined || start + paddedSize(size) > archiveLength) {
    return notOurTar("a file's size is wrong");
  }
  return ok({ name: nulTerminated(block, field.name), start, size });
}

function notOurTar(detail: string): Result<never, TarReadProblem> {
  return err({ code: "not-our-tar", detail });
}

/** The field's bytes as text, one character per byte. */
function text(block: Uint8Array, at: { offset: number; length: number }): string {
  return String.fromCharCode(...block.subarray(at.offset, at.offset + at.length));
}

/** The field's text up to its first NUL. */
function nulTerminated(block: Uint8Array, at: { offset: number; length: number }): string {
  const whole = text(block, at);
  const end = whole.indexOf("\0");
  return end === -1 ? whole : whole.slice(0, end);
}

/**
 * The field's octal number: digits, then NUL or space to the field's end.
 * Anything else, such as GNU's base-256 form, is `undefined`.
 */
function readOctal(block: Uint8Array, at: { offset: number; length: number }): number | undefined {
  const match = /^([0-7]+)[\0 ]*$/.exec(text(block, at));
  return match?.[1] === undefined ? undefined : Number.parseInt(match[1], 8);
}

function isEmpty(block: Uint8Array, at: { offset: number; length: number }): boolean {
  return block.subarray(at.offset, at.offset + at.length).every((byte) => byte === 0);
}
