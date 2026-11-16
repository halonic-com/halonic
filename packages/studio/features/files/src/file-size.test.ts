import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LARGE_FILE_CHARACTERS, sizeOf, textKindOf } from "./file-size.ts";

verifies("files.ui.large-or-not-text", () => {
  it("calls ordinary text text", () => {
    expect(textKindOf("name: A\n")).toBe("text");
    expect(textKindOf("")).toBe("text");
  });

  it("calls a file over 1,000,000 characters large, and one at the limit text", () => {
    expect(textKindOf("a".repeat(LARGE_FILE_CHARACTERS))).toBe("text");
    expect(textKindOf("a".repeat(LARGE_FILE_CHARACTERS + 1))).toBe("large");
  });

  it("calls a file with a zero byte in its first 8 KB not text, but not one further on", () => {
    expect(textKindOf(`PK\u0000\u0003${"x".repeat(100)}`)).toBe("not-text");
    expect(textKindOf(`${"x".repeat(8192)}\u0000`)).toBe("text");
  });

  it("says a size in bytes, KB and MB", () => {
    expect(sizeOf("a")).toBe("1 byte");
    expect(sizeOf("ab")).toBe("2 bytes");
    expect(sizeOf("a".repeat(2560))).toBe("2.5 KB");
    expect(sizeOf("a".repeat(3 * 1024 * 1024))).toBe("3.0 MB");
  });
});
