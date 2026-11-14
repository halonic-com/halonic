import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { PinnedPackage } from "./sdk-pins.ts";

/** One 512-byte ustar header and the padded content of an entry. */
function tarEntry(path: string, content: string, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, "utf8");
  header.write("0000644\0", 100);
  header.write(`${Buffer.byteLength(content).toString(8).padStart(11, "0")}\0`, 124);
  header.write(type, 156);
  header.write("ustar\0", 257);
  header.write("        ", 148);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  const body = Buffer.alloc(Math.ceil(Buffer.byteLength(content) / 512) * 512);
  body.write(content);
  return Buffer.concat([header, body]);
}

/** A gzipped tarball of `entries` (path and content), npm-style. */
export function tarball(entries: Array<[string, string] | [string, string, string]>): Buffer {
  const parts = entries.map(([path, content, type]) => tarEntry(path, content, type));
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

export function integrityOf(bytes: Buffer): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

/** A pinned package whose tarball is `bytes`, with the real pin's name. */
export function pinFor(name: string, bytes: Buffer): PinnedPackage {
  return {
    name,
    version: "1.0.0",
    tarballUrl: `https://registry.npmjs.org/${name}/-/x-1.0.0.tgz`,
    integrity: integrityOf(bytes),
  };
}

/** A fake registry that answers by address and counts its answers. */
export function fakeRegistry(bytesByUrl: Record<string, Buffer | Error>) {
  const calls: string[] = [];
  const fetchBytes = async (url: string) => {
    calls.push(url);
    const answer = bytesByUrl[url];
    if (!answer) throw new Error("no such package");
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetchBytes, calls };
}
