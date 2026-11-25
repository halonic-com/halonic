import { encodeUtf8, unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { blockSize, field, headerChecksum } from "./tar-header.ts";
import { maxTarEntries, readTarFile } from "./tar-read.ts";
import { TarNameError, type TarNameReason, writeTar } from "./tar-write.ts";

function file(name: string, text = "x"): { name: string; bytes: Uint8Array } {
  return { name, bytes: encodeUtf8(text) };
}

function refusal(name: string): TarNameReason | undefined {
  try {
    writeTar([file("package/ok.js"), file(name)]);
  } catch (error) {
    if (error instanceof TarNameError) {
      return error.reason;
    }
    throw error;
  }
  return undefined;
}

verifies("plugin-build.tar-names", () => {
  it.each([
    ["", "empty"],
    ["package/../../etc/passwd", "parent-folder"],
    ["..", "parent-folder"],
    ["/etc/passwd", "absolute"],
    ["package/é.js", "not-ascii"],
    ["package/a b.js", "not-ascii"],
    ["package/a\nb.js", "not-ascii"],
    [`package/${"a".repeat(93)}`, "too-long"],
    ["package/ok.js", "duplicate"],
  ])("refuses %j as %s", (name, reason) => {
    expect(refusal(name)).toBe(reason);
  });

  it("takes a name of exactly 100 bytes", () => {
    expect(refusal(`package/${"a".repeat(92)}`)).toBeUndefined();
  });
});

describe("the tar writer and reader", () => {
  it("writes whole blocks and ends with two empty blocks", () => {
    const archive = writeTar([file("a", "hello")]);
    expect(archive.length).toBe(4 * blockSize);
    expect(archive.subarray(2 * blockSize).every((byte) => byte === 0)).toBe(true);
  });

  it("reads back each file it wrote, whatever order they came in", () => {
    const archive = writeTar([file("b", "second"), file("a", "first")]);
    expect(unwrap(readTarFile(archive, "a", 100))).toEqual(encodeUtf8("first"));
    expect(unwrap(readTarFile(archive, "b", 100))).toEqual(encodeUtf8("second"));
  });

  it("reads an empty file", () => {
    expect(unwrap(readTarFile(writeTar([file("a", "")]), "a", 0))).toEqual(new Uint8Array());
  });

  it("refuses a missing file and one over the size cap", () => {
    const archive = writeTar([file("a", "hello")]);
    expect(readTarFile(archive, "b", 100)).toEqual({
      ok: false,
      error: { code: "missing", fileName: "b" },
    });
    expect(readTarFile(archive, "a", 4)).toEqual({
      ok: false,
      error: { code: "too-large", fileName: "a", maxBytes: 4 },
    });
  });

  it("refuses a file that comes twice", () => {
    const one = writeTar([file("a", "first")]);
    const twice = new Uint8Array(one.length + 2 * blockSize);
    twice.set(one.subarray(0, 2 * blockSize), 0);
    twice.set(one.subarray(0, 2 * blockSize), 2 * blockSize);
    expect(readTarFile(twice, "a", 100)).toEqual({
      ok: false,
      error: { code: "duplicate", fileName: "a" },
    });
  });

  it.each([
    ["a header with a wrong checksum", (archive: Uint8Array) => archive.set([0x41], 0)],
    [
      "a header that isn't ustar",
      (archive: Uint8Array) => resign(archive, field.magic.offset, "gnu "),
    ],
    [
      "a link instead of a file",
      (archive: Uint8Array) => resign(archive, field.typeflag.offset, "2"),
    ],
    [
      "a name in the prefix field",
      (archive: Uint8Array) => resign(archive, field.prefix.offset, "x"),
    ],
    [
      "a size past the archive's end",
      (archive: Uint8Array) => resign(archive, field.size.offset, "77777"),
    ],
    ["a size that isn't octal", (archive: Uint8Array) => resign(archive, field.size.offset, "9")],
  ])("refuses %s", (_name, damage) => {
    const archive = writeTar([file("a", "hello")]);
    damage(archive);
    expect(readTarFile(archive, "a", 100)).toMatchObject({
      ok: false,
      error: { code: "not-our-tar" },
    });
  });

  it("refuses an archive cut off before its end blocks", () => {
    const archive = writeTar([file("a", "hello")]).subarray(0, 2 * blockSize);
    expect(readTarFile(archive, "a", 100)).toEqual({
      ok: false,
      error: { code: "not-our-tar", detail: "it ends before its end blocks" },
    });
  });

  it("refuses an archive with more files than a plugin has", () => {
    const names = Array.from({ length: maxTarEntries + 1 }, (_, index) => `f${index}`);
    const archive = writeTar(names.map((name) => file(name)));
    expect(readTarFile(archive, "f0", 100)).toEqual({
      ok: false,
      error: { code: "not-our-tar", detail: `more than ${maxTarEntries} files` },
    });
  });
});

/** Writes text into the first header, then fixes its checksum so only that change counts. */
function resign(archive: Uint8Array, offset: number, text: string): void {
  archive.set(encodeUtf8(text), offset);
  const header = archive.subarray(0, blockSize);
  const checksum = headerChecksum(header).toString(8).padStart(6, "0");
  archive.set(encodeUtf8(`${checksum}\0 `), field.checksum.offset);
}
