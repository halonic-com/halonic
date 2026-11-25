import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { blockSize, field } from "./tar-header.ts";
import { type TarFile, TarNameError, type TarNameReason, writeTar } from "./tar-write.ts";

// Tests may use TextEncoder; the package itself may not (core layer).
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function file(name: string, text = "x"): TarFile {
  return { name, bytes: encoder.encode(text) };
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

/** A header field's text, as the writer put it. */
function fieldText(header: Uint8Array, at: { offset: number; length: number }): string {
  return decoder.decode(header.subarray(at.offset, at.offset + at.length));
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

describe("the tar writer", () => {
  it("gives identical bytes for the same files in any order", () => {
    const one = writeTar([file("package/b.js", "2"), file("package/a.js", "1")]);
    const two = writeTar([file("package/a.js", "1"), file("package/b.js", "2")]);
    expect(one).toEqual(two);
  });

  it("writes whole blocks, sorted, and ends with two empty blocks", () => {
    const archive = writeTar([file("b", "second"), file("a", "hello")]);
    expect(archive.length).toBe(6 * blockSize);
    expect(fieldText(archive, field.name).replace(/\0+$/, "")).toBe("a");
    expect(decoder.decode(archive.subarray(blockSize, blockSize + 5))).toBe("hello");
    expect(archive.subarray(4 * blockSize).every((byte) => byte === 0)).toBe(true);
  });

  it("writes mtime 0, mode 0644, uid and gid 0, the size and no owner names", () => {
    const header = writeTar([file("a", "hello")]).subarray(0, blockSize);
    expect(fieldText(header, field.mode)).toBe("0000644\0");
    expect(fieldText(header, field.uid)).toBe("0000000\0");
    expect(fieldText(header, field.gid)).toBe("0000000\0");
    expect(fieldText(header, field.size)).toBe("00000000005\0");
    expect(fieldText(header, field.mtime)).toBe("00000000000\0");
    expect(fieldText(header, field.magic)).toBe("ustar\0");
    expect(header.subarray(265, 329).every((byte) => byte === 0)).toBe(true);
  });

  it("writes the checksum tar checks: the header's byte sum, the checksum counted as spaces", () => {
    const header = writeTar([file("a", "hello")]).subarray(0, blockSize);
    let sum = 0;
    header.forEach((byte, index) => {
      const inChecksum = index >= field.checksum.offset && index < field.checksum.offset + 8;
      sum += inChecksum ? 0x20 : byte;
    });
    expect(fieldText(header, field.checksum)).toBe(`${sum.toString(8).padStart(6, "0")}\0 `);
  });

  it("writes an empty file as a header alone", () => {
    expect(writeTar([file("a", "")]).length).toBe(3 * blockSize);
  });

  it("refuses a file too large for the size field", () => {
    const huge = { name: "a", bytes: { length: 0o100000000000 } as Uint8Array };
    expect(() => writeTar([huge])).toThrow(RangeError);
  });
});
