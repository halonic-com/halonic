/** One file of a tar archive. */
export interface TarFile {
  /** The path inside the archive, with forward slashes. */
  path: string;
  content: Buffer;
}

const blockSize = 512;

/**
 * The regular files of a tar archive (already gunzipped), as npm packs them:
 * plain or ustar headers, with a pax header for a long path. Folders, links
 * and anything else are skipped: a package never needs them, and a link is
 * how an archive would reach outside its folder.
 *
 * @throws when the archive is cut short
 */
export function readTarFiles(archive: Buffer): TarFile[] {
  const files: TarFile[] = [];
  let paxPath: string | null = null;
  let offset = 0;
  while (offset + blockSize <= archive.length) {
    const header = archive.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(textOf(header, 124, 12), 8);
    if (!Number.isInteger(size)) throw new Error("a tar header has no readable size");
    const start = offset + blockSize;
    if (start + size > archive.length) throw new Error("the tar archive is cut short");
    const content = archive.subarray(start, start + size);
    offset = start + Math.ceil(size / blockSize) * blockSize;

    const type = textOf(header, 156, 1);
    if (type === "0" || type === "") {
      files.push({ path: paxPath ?? pathOf(header), content: Buffer.from(content) });
    }
    paxPath = type === "x" ? paxPathOf(content.toString("utf8")) : null;
  }
  return files;
}

/** The path in a ustar header: its prefix field, then its name field. */
function pathOf(header: Buffer): string {
  const prefix = textOf(header, 345, 155);
  return (prefix === "" ? "" : `${prefix}/`) + textOf(header, 0, 100);
}

/** A header field: text up to its first zero byte. */
function textOf(header: Buffer, start: number, length: number): string {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? length : end).toString("utf8");
}

/** The `path=` entry of a pax header (`<length> path=<value>\n` lines), or `null`. */
function paxPathOf(records: string): string | null {
  for (const line of records.split("\n")) {
    const entry = line.slice(line.indexOf(" ") + 1);
    if (entry.startsWith("path=")) return entry.slice("path=".length);
  }
  return null;
}
