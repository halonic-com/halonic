import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkProgram, checkPrograms } from "./program-signatures.ts";

const peHeader = 0x80;
const securityEntry = peHeader + 24 + 112 + 4 * 8;

/** A minimal 64-bit Windows program, unsigned, signed, or with a security directory left by injection. */
function program(signature: "none" | "signed" | "injected"): Uint8Array {
  const bytes = new Uint8Array(signature === "injected" ? 0x800 : 0x420);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x5a4d, true);
  view.setUint32(0x3c, peHeader, true);
  view.setUint32(peHeader, 0x00004550, true);
  view.setUint16(peHeader + 24, 0x20b, true);
  view.setUint32(peHeader + 24 + 108, 16, true);
  if (signature === "none") return bytes;
  view.setUint32(securityEntry, 0x400, true);
  view.setUint32(securityEntry + 4, 0x20, true);
  if (signature === "signed") {
    view.setUint32(0x400, 0x20, true);
    view.setUint16(0x404, 0x0200, true);
    view.setUint16(0x406, 0x0002, true);
  }
  return bytes;
}

let folder: string | undefined;

afterEach(() => {
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  folder = undefined;
});

describe("the release's check of every program in the installer (HAL-20055)", () => {
  it("passes an unsigned program", () => {
    expect(checkProgram("a.exe", program("none"))).toEqual({
      path: "a.exe",
      ok: true,
      detail: "not signed",
    });
  });

  it("fails a program whose security directory no longer holds a certificate", () => {
    const result = checkProgram("halonic-agent-host.exe", program("injected"));
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("broken security directory (32 bytes at 1024)");
  });

  it("passes a certificate on to Authenticode", () => {
    expect(checkProgram("a.dll", program("signed"))).toEqual({
      path: "a.dll",
      ok: true,
      detail: "signed (32 bytes at 1024)",
    });
  });

  it("checks every program in the folder and its subfolders, whatever its name, and skips other files", () => {
    folder = mkdtempSync(join(tmpdir(), "program-signatures-"));
    mkdirSync(join(folder, "$PLUGINSDIR"));
    writeFileSync(join(folder, "Halonic.exe"), program("none"));
    writeFileSync(join(folder, "halonic-agent-host.exe"), program("injected"));
    writeFileSync(join(folder, "$PLUGINSDIR", "System.dll"), program("signed"));
    writeFileSync(join(folder, "vcruntime140.dll.pinned"), program("signed"));
    writeFileSync(join(folder, "halonic-runtime.json"), "{}");
    writeFileSync(join(folder, "notes.txt"), "MZ, but no PE header");
    writeFileSync(join(folder, "empty"), "");
    const results = checkPrograms(folder);
    expect(results.map(({ path, ok }) => [path.slice(folder?.length ?? 0), ok])).toEqual([
      [join("/", "$PLUGINSDIR", "System.dll"), true],
      [join("/", "Halonic.exe"), true],
      [join("/", "halonic-agent-host.exe"), false],
      [join("/", "vcruntime140.dll.pinned"), true],
    ]);
  });
});
