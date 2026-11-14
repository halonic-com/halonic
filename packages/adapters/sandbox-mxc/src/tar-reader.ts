import { gunzipSync } from "node:zlib";

/** One file of a tarball. Folders, links and everything else are never returned. */
export interface TarFile {
  /** The path inside the tarball, with `/` separators, relative, without `.` or `..`. */
  path: string;
  content: Buffer;
}

const blockSize = 512;

/**
 * Reads the files of a gzipped tarball (the shape `npm pack` makes: ustar,
 * every path under one top folder such as `package/`). It refuses the whole
 * tarball when any entry has an absolute path, a `..` part, or is a link, a
 * device or any other kind than a file or folder, so nothing can land outside
 * the folder it is unpacked to.
 */
export function readTarball(gzipped: Buffer): TarFile[] {
  const tar = gunzipSync(gzipped);
  const files: TarFile[] = [];
  let offset = 0;
  while (offset + blockSize <= tar.length) {
    const header = tar.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) break;
    const path = entryPath(header);
    const kind = String.fromCharCode(header[156] || 0x30);
    const size = Number.parseInt(text(header, 124, 12), 8);
    if (!Number.isFinite(size) || size < 0) throw new Error(`Tarball entry "${path}" has no size`);
    offset += blockSize;
    if (offset + size > tar.length) throw new Error(`Tarball is cut off inside "${path}"`);
    if (kind === "0") {
      files.push({
        path: safePath(path),
        content: Buffer.from(tar.subarray(offset, offset + size)),
      });
    } else if (kind === "5") {
      safePath(path);
    } else {
      throw new Error(`Tarball entry "${path}" is not a file or folder (type "${kind}")`);
    }
    offset += Math.ceil(size / blockSize) * blockSize;
  }
  return files;
}

/** The entry's path: ustar's prefix field and name field joined. */
function entryPath(header: Buffer): string {
  const name = text(header, 0, 100);
  const prefix =
    header.subarray(257, 262).toString("latin1") === "ustar" ? text(header, 345, 155) : "";
  return prefix ? `${prefix}/${name}` : name;
}

function text(header: Buffer, from: number, length: number): string {
  const field = header.subarray(from, from + length);
  const end = field.indexOf(0);
  return field
    .subarray(0, end === -1 ? length : end)
    .toString("utf8")
    .trim();
}

/** The path itself when it stays inside the folder it is unpacked to; throws otherwise. */
function safePath(path: string): string {
  const parts = path.split("/").filter((part) => part !== "");
  const escapes =
    path.startsWith("/") ||
    path.includes("\\") ||
    /^[A-Za-z]:/.test(path) ||
    parts.length === 0 ||
    parts.some((part) => part === ".." || part === ".");
  if (escapes) throw new Error(`Tarball entry "${path}" would land outside its folder`);
  return parts.join("/");
}
