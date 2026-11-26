import { describe, expect, it } from "vitest";
import {
  isPortableExecutable,
  readSecurityDirectory,
  signatureState,
  withoutSignature,
} from "./pe-signature.ts";

const peHeader = 0x80;
const pe32PlusEntry = peHeader + 24 + 112 + 4 * 8;

/**
 * A minimal 64-bit Windows program: the MZ and PE headers and 16 data
 * directories, padded to `size` bytes, with the security directory set to
 * `offset` and `length`.
 */
function program(size: number, security?: { offset: number; length: number }): Uint8Array {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, peHeader, true);
  view.setUint32(peHeader, 0x00004550, true);
  view.setUint16(peHeader + 24, 0x20b, true);
  view.setUint32(peHeader + 24 + 108, 16, true);
  if (security !== undefined) {
    view.setUint32(pe32PlusEntry, security.offset, true);
    view.setUint32(pe32PlusEntry + 4, security.length, true);
  }
  return bytes;
}

/** A program signed as Windows signs: a WIN_CERTIFICATE at the end of the file. */
function signed(): Uint8Array {
  const bytes = program(0x400 + 0x20, { offset: 0x400, length: 0x20 });
  const view = new DataView(bytes.buffer);
  view.setUint32(0x400, 0x20, true);
  view.setUint16(0x404, 0x0200, true);
  view.setUint16(0x406, 0x0002, true);
  return bytes;
}

describe("a Windows program's security directory (HAL-20055)", () => {
  it("is empty for an unsigned program", () => {
    expect(readSecurityDirectory(program(0x400))).toBeUndefined();
    expect(signatureState(program(0x400))).toEqual({ kind: "none" });
  });

  it("holds a certificate for a signed one", () => {
    expect(signatureState(signed())).toEqual({
      kind: "certificate",
      directory: { offset: 0x400, size: 0x20 },
    });
  });

  it("is broken when it points at bytes that are no longer a certificate, as after injecting into node.exe", () => {
    // The injected resources start where the signature was.
    const injected = program(0x800, { offset: 0x400, length: 0x20 });
    const state = signatureState(injected);
    expect(state.kind).toBe("broken");
    expect(state.kind === "broken" && state.reason).toContain("certificate says 0 bytes");
  });

  it("is broken when it points past the end of the file or isn't aligned", () => {
    expect(signatureState(program(0x400, { offset: 0x400, length: 0x20 })).kind).toBe("broken");
    expect(signatureState(program(0x420, { offset: 0x404, length: 0x10 })).kind).toBe("broken");
  });

  it("is read from a 32-bit program's header too", () => {
    const bytes = program(0x400);
    const view = new DataView(bytes.buffer);
    view.setUint16(peHeader + 24, 0x10b, true);
    view.setUint32(peHeader + 24 + 92, 16, true);
    view.setUint32(peHeader + 24 + 96 + 4 * 8, 0x400, true);
    view.setUint32(peHeader + 24 + 96 + 4 * 8 + 4, 0x20, true);
    expect(readSecurityDirectory(bytes)).toEqual({ offset: 0x400, size: 0x20 });
  });

  it("tells programs from other files", () => {
    expect(isPortableExecutable(program(0x400))).toBe(true);
    expect(isPortableExecutable(new TextEncoder().encode(`MZ${" ".repeat(100)}`))).toBe(false);
    expect(() => readSecurityDirectory(new Uint8Array(100))).toThrow("doesn't start with MZ");
  });
});

describe("removing a program's signature (HAL-20055)", () => {
  it("clears the security directory and cuts the signature off the end", () => {
    const stripped = withoutSignature(signed());
    expect(stripped.length).toBe(0x400);
    expect(signatureState(stripped)).toEqual({ kind: "none" });
  });

  it("leaves an unsigned program as it was", () => {
    expect(withoutSignature(program(0x400))).toEqual(program(0x400));
  });

  it("refuses when the signature isn't at the end, rather than cut what follows it", () => {
    expect(() => withoutSignature(program(0x800, { offset: 0x400, length: 0x20 }))).toThrow(
      "isn't at the end",
    );
  });
});
